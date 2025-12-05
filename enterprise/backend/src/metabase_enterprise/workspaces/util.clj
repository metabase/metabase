(ns metabase-enterprise.workspaces.util)

(defn assert-transform!
  "Test whether we support the given entity type within workspaces yet.
   Named for the only case we support currently, to make call sites assumptions more obvious."
  [type]
  (when (not= "transform" type)
    (throw (ex-info "Type not supported"
                    {:status-code 400
                     :type        type}))))
