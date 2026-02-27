(ns metabase.mq.quick-tasks
  "Persistent queue replacement for metabase.util.quick-task.
   Tasks are serialized as data maps and processed by a queue listener."
  (:require
   [metabase.mq.core :as mq]
   [metabase.mq.impl :as mq.impl]
   [metabase.util.log :as log]))

(set! *warn-on-reflection* true)

(def queue-name :queue/quick-tasks)

(defn submit!
  "Submit a task to the persistent queue. Fire-and-forget."
  [task params]
  (mq/with-queue queue-name [q]
    (mq.impl/put q {:task task :params params})))

(defmulti handle-task!
  "Dispatch on :task keyword to execute the work."
  (fn [msg] (:task msg)))

(defmethod handle-task! :default [msg]
  (log/error "Unknown quick-task type" {:task (:task msg)}))

(defmethod handle-task! :sync-database [{:keys [params]}]
  (let [{:keys [database-id full-sync?]} params
        database ((requiring-resolve 'toucan2.core/select-one) :model/Database :id database-id)]
    (when database
      (if full-sync?
        ((requiring-resolve 'metabase.sync.core/sync-database!) database)
        ((requiring-resolve 'metabase.sync.core/sync-db-metadata!) database)))))

(defmethod handle-task! :sync-table [{:keys [params]}]
  (let [{:keys [table-id]} params
        table ((requiring-resolve 'toucan2.core/select-one) :model/Table :id table-id)]
    (when table
      ((requiring-resolve 'metabase.sync.core/sync-table!) table))))

(defmethod handle-task! :update-field-values-for-table [{:keys [params]}]
  (let [{:keys [table-id]} params
        table ((requiring-resolve 'toucan2.core/select-one) :model/Table :id table-id)]
    (when table
      ((requiring-resolve 'metabase.sync.core/update-field-values-for-table!) table))))

(defmethod handle-task! :refingerprint-field [{:keys [params]}]
  (let [{:keys [field-id]} params
        field ((requiring-resolve 'toucan2.core/select-one) :model/Field :id field-id)]
    (when field
      ((requiring-resolve 'metabase.sync.core/refingerprint-field!) field))))

(defmethod handle-task! :update-field-values [{:keys [params]}]
  (let [{:keys [database-id]} params
        database ((requiring-resolve 'toucan2.core/select-one) :model/Database :id database-id)]
    (when database
      ((requiring-resolve 'metabase.sync.core/update-field-values!) database))))

(defmethod handle-task! :manual-sync [{:keys [params]}]
  (let [{:keys [database-id]} params
        database ((requiring-resolve 'toucan2.core/select-one) :model/Database :id database-id)]
    (when database
      ((requiring-resolve 'metabase.database-routing.core/with-database-routing-off-fn)
       (fn []
         ((requiring-resolve 'metabase.sync.core/sync-db-metadata!) database)
         ((requiring-resolve 'metabase.sync.core/analyze-db!) database))))))

(defmethod handle-task! :sync-unhidden-tables [{:keys [params]}]
  (let [{:keys [table-ids]} params
        tables ((requiring-resolve 'toucan2.core/select) :model/Table :id [:in table-ids])]
    (doseq [[db-id db-tables] (group-by :db_id tables)]
      (let [database ((requiring-resolve 'toucan2.core/select-one) :model/Database db-id)
            allow-h2-var (requiring-resolve 'metabase.driver.settings/*allow-testing-h2-connections*)]
        (when database
          (if (with-bindings {allow-h2-var true}
                ((requiring-resolve 'metabase.driver.util/can-connect-with-details?) (:engine database) (:details database)))
            (doseq [table db-tables]
              (log/infof "Table '%s' is now visible. Resyncing." (:name table))
              ((requiring-resolve 'metabase.sync.core/sync-table!) table))
            (log/warnf "Cannot connect to database '%s' in order to sync unhidden tables" (:name database))))))))

(defmethod handle-task! :sync-table-routing-off [{:keys [params]}]
  (let [{:keys [table-id]} params
        table ((requiring-resolve 'toucan2.core/select-one) :model/Table :id table-id)]
    (when table
      ((requiring-resolve 'metabase.database-routing.core/with-database-routing-off-fn)
       (fn [] ((requiring-resolve 'metabase.sync.core/sync-table!) table))))))

(defmethod handle-task! :sync-database-from-config [{:keys [params]}]
  (let [{:keys [database-id]} params
        database ((requiring-resolve 'toucan2.core/select-one) :model/Database :id database-id)]
    (when database
      ((requiring-resolve 'metabase.sync.core/sync-database!) database))))
