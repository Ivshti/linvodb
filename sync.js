var async = require("async"),
    fs = require("fs"),
    _ = require("underscore");

module.exports = function setupSync(model, collection, api, options)
{
    var options = options || {};

    var status = function(s) {
        if (options.log) console.log("LinvoDB Sync: "+s);
    };

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

        var baseQuery = { collection: options.remoteCollection || model.modelName };
        var remote = {}, push = [], pull = [];

        async.auto({
            retrieve_remote: function(callback)
            {
                api.request("datastoreMeta", baseQuery, function(err, meta)
                { 
                    if (err) return cb(err);

                    meta.forEach(function(m) { remote[m[0]] = new Date(m[1]).getTime() });
                    callback();
                });
            },
            compile_changes: ["retrieve_remote", function(callback)
            {
                collection.find({ }, function(err, results)
                {
                    if (err) return callback(err);

                    results.forEach(function(r) {
                        if ((remote[r._id] || 0) > r._mtime.getTime()) pull.push(r._id);
                        if ((remote[r._id] || 0) < r._mtime.getTime()) push.push(r);
                        delete remote[r._id]; // already processed
                    });
                    pull = pull.concat(_.keys(remote)); // add all non-processed to pull queue
                    callback();

                    // It's correct to mark the DB before commiting the changes, but when compiling the list of changes
                    // Until the changes are commited, more changes might occur
                    dirty = false;                
                });
            }],
            push_remote: ["compile_changes", function(callback)
            {
                status("pushing "+push.length+" changes to remote");

                api.request("datastorePut", _.extend({ }, baseQuery, { changes: 
                    push.map(function(x) { 
                        var item = _.extend({ }, x);
                        if (x._mtime) x._mtime = x._mtime.getTime();
                        if (x._ctime) x._ctime = x._ctime.getTime();
                        return item;
                    })
                }), callback);
            }],
            pull_local: ["compile_changes", function(callback)
            {
                api.request("datastoreGet", _.extend({ }, baseQuery, { ids: pull }), function(err, results)
                {
                    status("pulled "+results.length+" down");

                    async.each(results, function(res, cb) {
                        res._ctime = new Date(res._ctime || 0);
                        res._force_mtime = new Date(res._mtime || 0);
                        collection.update({ _id: res._id }, res, { upsert: true }, cb);
                    }, function(err)
                    {
                        if (err) console.error(err);
                        callback();
                    });
                });
            }],
            finalize: ["push_remote", "push_local", function(callback)
            {
                status("sync finished");
                
                if (pull.length) model.emit("updated", { dontSync: true });
                callback();
            }]
        }, cb);
    }, 1);
    
    /* Trigger first sync right after setup */
    triggerSync();
}
