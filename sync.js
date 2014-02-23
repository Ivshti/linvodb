var async = require("async"),
    fs = require("fs"),
    _ = require("underscore");

module.exports = function setupSync(model, collection, api, remoteCollection)
{
    var syncInfoPath = collection.filename+".sync";
    var syncInfo = { lastSync: 0 };
    if (fs.existsSync(syncInfoPath)) try { syncInfo = JSON.parse(fs.readFileSync(syncInfoPath)) } catch(e) { };
    var saveSyncInfo = function() { fs.writeFileSync(syncInfoPath, JSON.stringify(syncInfo)) };
    
    var dirty = false;
    var triggerSync = function(cb)
    { 
        dirty = true;
        q.push({}, cb);
    };
    model.on("updated", function(inf) { if (! (inf && inf.dontSync)) triggerSync() });
    model.static("triggerSync", triggerSync);

    /* We need to run only one task at a time */
    var q = async.queue(function(opts, cb)
    {
        if (! api.user) return cb();
        if (! dirty) return cb();

        var remoteMeta, localMeta, modifications, deletes,
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
                    localMeta = results.map(function(r) { return [r._id, r._mtime.getTime(), 1] });
                    callback(err);
                });
            },
            compile_changes: ["retrieve_remote", "retrieve_local", function(callback)
            {
                // It's correct to mark the DB before commiting the changes, but when compiling the list of changes
                // Until the changes are commited, more changes might occur
                dirty = false;
                // TODO: set that back to true if anything fails
                
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
                    //console.log("pushing "+updatedItems.length+" up, "+deletes.length+" deletes");//debug
                    
                    updatedItems = updatedItems.map(function(x) { 
                        return _.extend({ }, x, { 
                            _mtime: parseInt(x._mtime) ? x._mtime : x._mtime.getTime(), 
                            _ctime: parseInt(x._ctime) ? x._ctime : x._ctime.getTime()
                        })                    });
                    
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
                    //console.log("pulling "+results.length+" down");//debug
                    async.each(results, function(res, cb) {
                        //res._ctime = new Date(res._ctime);
                        res._force_mtime = new Date(res._mtime);
                        collection.update({ _id: res._id }, res, { upsert: true }, cb);
                    }, callback);
                });
            }],
            update_last_sync: ["push_remote", "push_local", function(callback)
            {
                syncInfo.lastSync = Date.now();
                saveSyncInfo();
                
                if (modifications.some(function(m) { return ! m[2] }))
                    model.emit("updated", { dontSync: true });

                callback();
            }]
        }, cb);
    }, 1);
    
    /* Trigger first sync right after setup */
    triggerSync();
}
