(ns metabase-enterprise.advanced-config.file.workspace
  (:require
   [clojure.walk :as walk]
   [metabase-enterprise.advanced-config.file.interface :as advanced-config.file.i]
   [metabase-enterprise.workspaces.core :as ws]
   [metabase-enterprise.workspaces.remapping-poll :as remapping-poll]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [toucan2.core :as t2]))

(defn- ordered->plain [x]
  (walk/postwalk
   (fn [form]
     (if (map? form)
       (into {} form)
       form))
   x))

(defn normalize
  "Take a raw workspace config, with database configs indexed by database name,
  and return a normalized config with database configs indexed by db-id."
  [{:keys [db-id-by-name]} raw-config]
  (-> (ordered->plain raw-config)
      (update :databases
              (fn [dbs]
                (u/index-by :id
                            (for [[name-kw config] dbs]
                              (let [db-name (name name-kw)]
                                (assoc config
                                       :name db-name
                                       :id (db-id-by-name db-name)))))))))

(defmethod advanced-config.file.i/initialize-section! :workspace
  [_section-name section-config]
  (ws/set-config!
   (normalize
    {:db-id-by-name #(t2/select-one-pk :model/Database :name %)}
    section-config))
  ;; Eager first tick: populate the app-db `table_remapping` cache from each workspaced
  ;; warehouse's `_mb_remappings` ledger synchronously, before the scheduler starts in
  ;; `metabase.core.core/init!*`. Without this, fresh-boot has no cached remappings for
  ;; the first 30 seconds — a problem for queries that hit the QP immediately.
  (try
    (remapping-poll/poll-once!)
    (catch Throwable t
      (log/warn t "remapping-poll: eager first tick failed; scheduler will retry"))))
