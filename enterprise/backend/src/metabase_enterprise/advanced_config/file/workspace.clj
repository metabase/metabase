(ns metabase-enterprise.advanced-config.file.workspace
  (:require
   [clojure.walk :as walk]
   [metabase-enterprise.advanced-config.file.interface :as advanced-config.file.i]
   [metabase-enterprise.workspaces.core :as ws]
   [metabase.util :as u]
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
  and return a normalized config with database configs indexed by db-id.

  Throws `ex-info` if any referenced database name does not resolve via
  `db-id-by-name`. All unresolved names are reported together in
  `:missing-names` so operators see the full list of typos at once rather
  than fixing them one boot at a time."
  [{:keys [db-id-by-name]} raw-config]
  (let [plain    (ordered->plain raw-config)
        resolved (for [[name-kw config] (:databases plain)]
                   (let [db-name (name name-kw)]
                     (assoc config
                            :name db-name
                            :id   (db-id-by-name db-name))))
        missing  (seq (keep (fn [{db-name :name db-id :id}]
                              (when (nil? db-id) db-name))
                            resolved))]
    (when missing
      (throw (ex-info (str "Workspace config references unknown databases: "
                           (pr-str (vec missing)))
                      {:missing-names (vec missing)})))
    (assoc plain :databases (u/index-by :id resolved))))

(defmethod advanced-config.file.i/initialize-section! :workspace
  [_section-name section-config]
  (ws/set-config!
   (normalize
    {:db-id-by-name #(t2/select-one-pk :model/Database :name %)}
    section-config))
  ;; Previously this synchronously called `remapping-poll/poll-once!` to warm the cache before
  ;; the scheduler started. That opened real JDBC connections to every workspaced warehouse at
  ;; boot, so a slow/unreachable warehouse stalled `initialize-section!`. The Quartz job in
  ;; `metabase.task.remapping-poll` schedules with `start-now`, so the first tick fires within
  ;; milliseconds of the scheduler coming up anyway.
  )
