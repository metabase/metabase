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
  ;; Previously this synchronously called `remapping-poll/poll-once!` to warm the cache before
  ;; the scheduler started. That opened real JDBC connections to every workspaced warehouse at
  ;; boot, so a slow/unreachable warehouse stalled `initialize-section!`. The Quartz job in
  ;; `metabase.task.remapping-poll` schedules with `start-now`, so the first tick fires within
  ;; milliseconds of the scheduler coming up anyway.
  )
