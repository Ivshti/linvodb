var async = require("async"),
    _ = require("underscore");

module.exports = function setupSync(model, collection, api)
{
    var dirty = false;
    var triggerSync = function(cb)
    { 
        dirty = true;
        q.push({}, cb);
    };
    model.on("update", triggerSync);
    model.static("triggerSync", triggerSync);

    /* We need to run only one task at a time */
    var q = async.queue(function(opts, cb)
    {
        if (! api.user) return cb();
        if (! dirty) return cb();

        var syncInfo = /*db.findOne("_sync", { collection: collection }) ||*/ { collection: model.modelName, lastSync: 0 },
            remoteMeta, localMeta, modifications, deletes,
            baseQuery = { collection: remoteCollection || model.modelName };

        async.auto({
            retrieve_remote: function(callback)
            {
                api.request("datastoreMeta", { collection: remoteCollection || model.modelName }, function(err, meta)
                {
                    remoteMeta = meta;
                    callback(err);
                });
            },
            retrieve_local: function(callback)
            {
                collection.find({}, function(err, results)
                {
                    localMeta = results.map(function(r) { return [r._id, r._mtime, 1] });
                    callback(err);
                });
            },
            compile_changes: ["retrieve_remote", "retrieve_local", function(callback)
            {
                // It's correct to mark the DB before commiting the changes, but when compiling the list of changes
                // Until the changes are commited, more changes might occur
                dirty = false;
                
                modifications = [].concat(remoteMeta).concat(localMeta)
                .filter(function(m) { return (m[1] || 0) >= syncInfo.lastSync })
                .sort(function(a, b) { return a[1] - b[1] });
                /* TODO: solve conflicts
                 */
                
                /* Slightly tricky part: deletes; we just need all IDs that are not here, but on the remote server, 
                 * which were not modified between lastSync and now */
                deletes = _.difference(
                    _.difference(remoteMeta.map(function(m){ return m[0] }), localMeta.map(function(m){ return m[0] })),
                    modifications.map(function(m){ return m[0] })
                );
                
                callback();
            }],
            push_remote: ["compile_changes", function(callback)
            {
                var ids = modifications.filter(function(m) { return m[2] }).map(function(m) { return m[0] });
                collection.find({ _id: { $in: ids } }, function(err, updatedItems)
                {
                    api.request("datastorePut", _.extend({ }, baseQuery, { changes: 
                        deletes.map(function(id) { return { _id: id, _delete: true } })
                        .concat(updatedItems)
                    }), callback);
                });
            }],
            push_local: ["compile_changes", function(callback)
            {
                api.request("datastoreGet", _.extend({ }, baseQuery, { 
                    ids: modifications.filter(function(m) { return ! m[2] }).map(function(m) { return m[0] })
                }), function(err, results)
                {
                    async.each(results, function(res, cb) {
                        collection.update({ _id: res._id }, res, { upsert: true }, cb);
                    }, callback);
                });
            }],
            update_last_sync: ["push_remote", "push_local", function(callback)
            {
                syncInfo.lastSync = Date.now();
                console.log(syncInfo);
                //db.save("_sync", syncInfo, callback)
            }]
        }, cb);
    }, 1);
}
