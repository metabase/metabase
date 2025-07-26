(ns metabase.sync.sync-metadata.routines
  "Logic for syncing stored procedures and functions from a physical DB."
  (:require
   [medley.core :as m]
   [metabase.driver :as driver]
   [metabase.driver.util :as driver.u]
   [metabase.sync.fetch-metadata :as fetch-metadata]
   [metabase.sync.interface :as i]
   [metabase.sync.util :as sync-util]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.warehouse-schema.models.routine]
   [metabase.warehouse-schema.models.routine-parameter]
   [toucan2.core :as t2]))

(mu/defn- fetch-routine-metadata
  "Fetch metadata about routines (stored procedures and functions) from the database.
   Returns a reducible/lazy sequence to avoid materializing large result sets."
  [database :- i/DatabaseInstance & {:as args}]
  (fetch-metadata/routine-metadata database args))

(mu/defn- create-routine!
  "Create a new routine in the database."
  [database routine-metadata]
  (println "Creating routine:" (:name routine-metadata) "type:" (:routine-type routine-metadata))
  (let [routine-type-value (let [rt (:routine-type routine-metadata)]
                            (cond
                              (keyword? rt) (name rt)
                              (string? rt) rt
                              :else (str rt)))]
    (println "  Storing routine_type as:" routine-type-value "class:" (type routine-type-value))
    (try
      (t2/insert-returning-instance!
       :model/Routine
       {:db_id        (:id database)
        :schema       (:schema routine-metadata)
        :name         (:name routine-metadata)
        :routine_type routine-type-value
        :description  (:description routine-metadata)
        :definition   (:definition routine-metadata)
        :return_type  (:return-type routine-metadata)
        :active       true})
      (catch Exception e
        (println "ERROR in create-routine! for" (:name routine-metadata) ":" (.getMessage e))
        (println "routine-type was:" (:routine-type routine-metadata) "type:" (type (:routine-type routine-metadata)))
        (println "Stack trace:" (clojure.string/join "\n" (map str (.getStackTrace e))))
        (throw e)))))

(mu/defn- create-routine-parameters!
  "Create parameters for a routine."
  [routine routine-metadata]
  (when-let [parameters (:parameters routine-metadata)]
    (doseq [param parameters]
      (t2/insert! :model/RoutineParameter
                  {:routine_id       (:id routine)
                   :name             (:name param)
                   :parameter_mode   (:parameter-mode param)
                   :data_type        (:data-type param)
                   :ordinal_position (:ordinal-position param)
                   :default_value    (:default-value param)}))))

(mu/defn- upsert-routine-parameters!
  "Upsert parameters for a routine using proper UPSERT logic."
  [routine routine-metadata]
  (when-let [parameters (:parameters routine-metadata)]
    ;; First, get existing parameters for comparison
    (let [existing-params (t2/select :model/RoutineParameter 
                                    :routine_id (:id routine))
          existing-positions (set (map :ordinal_position existing-params))
          new-positions (set (map :ordinal-position parameters))]
      ;; Remove parameters that no longer exist
      (when-let [positions-to-remove (seq (clojure.set/difference existing-positions new-positions))]
        (t2/delete! :model/RoutineParameter 
                   :routine_id (:id routine)
                   :ordinal_position [:in positions-to-remove]))
      ;; Upsert each parameter
      (doseq [param parameters]
        (let [param-data {:routine_id       (:id routine)
                         :name             (:name param)
                         :parameter_mode   (:parameter-mode param)
                         :data_type        (:data-type param)
                         :ordinal_position (:ordinal-position param)
                         :default_value    (:default-value param)}]
          ;; Try to update first, if no rows affected then insert
          (let [updated (t2/update! :model/RoutineParameter
                                   {:routine_id (:id routine)
                                    :ordinal_position (:ordinal-position param)}
                                   param-data)]
            (when (zero? updated)
              (t2/insert! :model/RoutineParameter param-data))))))))

(mu/defn- create-or-reactivate-routines-batch!
  "Create or reactivate multiple routines in batch for better performance."
  [database routine-metadatas]
  (let [;; Separate routines into those that exist (inactive) and those that don't
        routine-keys (map (fn [rm]
                           {:db_id (:id database)
                            :schema (:schema rm)
                            :name (:name rm)
                            :routine_type (if (keyword? (:routine-type rm))
                                           (name (:routine-type rm))
                                           (:routine-type rm))})
                         routine-metadatas)
        ;; Find existing inactive routines
        existing-inactive (when (seq routine-keys)
                           (t2/select :model/Routine
                                     {:where [:and
                                              [:in [:composite :db_id :schema :name :routine_type]
                                               {:values (map (juxt :db_id :schema :name :routine_type) routine-keys)}]
                                              [:= :active false]]}))
        existing-by-key (m/index-by #(select-keys % [:schema :name :routine_type]) existing-inactive)
        ;; Reactivate existing routines in batch
        _ (when (seq existing-inactive)
            (println "Reactivating" (count existing-inactive) "routines in batch")
            (t2/update! :model/Routine
                       {:where [:in :id (map :id existing-inactive)]}
                       {:active true}))
        ;; Find which routines need to be created
        routines-to-create (remove #(existing-by-key (-> %
                                                         (select-keys [:schema :name :routine-type])
                                                         (update :routine-type (fn [rt] (if (keyword? rt) (name rt) rt)))))
                                  routine-metadatas)]
    ;; Create new routines in batch
    (when (seq routines-to-create)
      (println "Creating" (count routines-to-create) "new routines in batch")
      (let [routine-rows (map (fn [rm]
                               {:db_id        (:id database)
                                :schema       (:schema rm)
                                :name         (:name rm)
                                :routine_type (if (keyword? (:routine-type rm))
                                               (name (:routine-type rm))
                                               (:routine-type rm))
                                :return_type  (:return-type rm)
                                :description  (:description rm)
                                :definition   (:definition rm)
                                :active       true})
                             routines-to-create)
            created-routines (t2/insert-returning-instances! :model/Routine routine-rows)
            ;; Create parameters for new routines
            params-to-create (mapcat (fn [routine routine-metadata]
                                      (when-let [params (:parameters routine-metadata)]
                                        (map #(assoc % :routine_id (:id routine)) params)))
                                    created-routines
                                    routines-to-create)]
        (when (seq params-to-create)
          (println "Creating" (count params-to-create) "parameters in batch")
          (t2/insert! :model/RoutineParameter params-to-create))))))

(mu/defn- update-routine-if-needed!
  "Update routine metadata if it has changed."
  [routine-metadata metabase-routine]
  (let [old-routine (select-keys metabase-routine [:description :definition :return_type])
        new-routine (select-keys routine-metadata [:description :definition :return-type])
        new-routine (zipmap [:description :definition :return_type] 
                           (map new-routine [:description :definition :return-type]))]
    (when (not= old-routine new-routine)
      (log/infof "Updating routine %s" (:name metabase-routine))
      (t2/update! :model/Routine (:id metabase-routine) new-routine)
      ;; Use UPSERT logic for parameters instead of delete/recreate
      (upsert-routine-parameters! metabase-routine routine-metadata))))

(mu/defn- retire-routines!
  "Mark routines as inactive that no longer exist in the database."
  [database old-routines]
  (log/info "Marking routines as inactive:"
            (for [routine old-routines]
              (str (:schema routine) "." (:name routine))))
  (println "DEBUG: Retiring" (count old-routines) "routines in batch")
  ;; Build the WHERE clause for batch update
  (let [routine-conditions (map (fn [routine]
                                 [(:id database)
                                  (:schema routine)
                                  (:name routine)
                                  (if (keyword? (:routine-type routine))
                                    (name (:routine-type routine))
                                    (:routine-type routine))])
                               old-routines)]
    (when (seq routine-conditions)
      (t2/update! :model/Routine
                  {:where [:and
                           [:in [:composite :db_id :schema :name :routine_type]
                            {:values routine-conditions}]
                           [:= :active true]]}
                  {:active false}))))

(mu/defn- db->our-routines
  "Return information about what Routines we have for this DB in the Metabase application DB."
  [database :- i/DatabaseInstance]
  (let [routines (t2/select [:model/Routine :id :schema :name :routine_type :description :definition :return_type]
                            :db_id (:id database)
                            :active true)]
    (println "Raw routines from DB:" (count routines))
    (doseq [r routines]
      (println "  Routine:" (:name r) "Type:" (:routine_type r) "Type class:" (type (:routine_type r))))
    (into (sorted-set-by #(compare (str %1) (str %2)))
          (map (fn [routine]
                 ;; Ensure routine_type is not nil for comparison
                 (if (nil? (:routine_type routine))
                   (assoc routine :routine_type "unknown")
                   routine))
               routines))))

(mu/defn- routine-set
  "Get sorted set of routines from database metadata for efficient comparison."
  [routine-metadata]
  (into (sorted-set-by #(compare (str %1) (str %2)))
        (map (fn [routine]
               (-> routine
                   (select-keys [:schema :name :routine-type])
                   (update :routine-type #(if (keyword? %) (name %) %))))
             routine-metadata)))

(mu/defn sync-routines!
  "Sync the Routines recorded in the Metabase application database with the ones obtained by calling
  database's driver's implementation of `describe-routines`."
  [database :- i/DatabaseInstance]
  (println "sync-routines! called for database" (:id database) (:name database))
  (let [driver (driver.u/database->driver database)]
    (println "Driver:" driver "Supports describe-routines?" (driver.u/supports? driver :describe-routines database)))
  (when (driver.u/supports? (driver.u/database->driver database) :describe-routines database)
    (log/infof "Syncing routines for database %s..." (sync-util/name-for-logging database))
    ;; Wrap entire sync in a transaction for consistency
    (t2/with-transaction [_conn]
      (let [start-time         (System/currentTimeMillis)
            db-routine-metadata (fetch-routine-metadata database)
          db-routines        (routine-set db-routine-metadata)
          our-routines       (db->our-routines database)
          our-routine-set    (routine-set our-routines)
          _                  (println "DB routines count:" (count db-routines))
          _                  (println "Our routines count:" (count our-routine-set))
          _                  (println "Sample DB routine:" (first db-routines))
          _                  (println "Sample Our routine:" (first our-routine-set))
          [new-routines
           old-routines]     (clojure.data/diff db-routines our-routine-set)
          _                  (println "New routines:" (count new-routines) "Old routines:" (count old-routines))
          _                  (when (and (> (count db-routines) 0) (> (count our-routine-set) 0))
                              (println "First db-routine:" (first db-routines))
                              (println "First our-routine:" (first our-routine-set))
                              (println "Are they equal?" (= (first db-routines) (first our-routine-set))))
          routine-by-key     (m/index-by #(-> %
                                              (select-keys [:schema :name :routine-type])
                                              (update :routine-type (fn [rt] (if (keyword? rt) (name rt) rt))))
                                        db-routine-metadata)
          our-routine-by-key (m/index-by #(select-keys % [:schema :name :routine-type])
                                        our-routines)]
      
      ;; Create new routines
      (when (seq new-routines)
        (println "Processing" (count new-routines) "new routines")
        (println "First 3 new routine keys:" (take 3 new-routines))
        (println "First 3 routine-by-key keys:" (take 3 (keys routine-by-key)))
        (sync-util/with-error-handling (format "Error creating/reactivating routines for %s"
                                              (sync-util/name-for-logging database))
          ;; Collect routine metadata for batch processing
          (let [routine-metadatas (keep #(routine-by-key %) new-routines)]
            (when (seq routine-metadatas)
              ;; Process in batches of 100 for optimal performance
              (doseq [batch (partition-all 100 routine-metadatas)]
                (create-or-reactivate-routines-batch! database batch))))))
      
      ;; Retire old routines
      (when (seq old-routines)
        (sync-util/with-error-handling (format "Error retiring routines for %s"
                                              (sync-util/name-for-logging database))
          (retire-routines! database old-routines)))
      
      ;; Update existing routines
      (let [existing-routines (clojure.set/intersection db-routines our-routine-set)]
        (when (seq existing-routines)
          (sync-util/with-error-handling (format "Error updating routines for %s"
                                                (sync-util/name-for-logging database))
            (doseq [routine-key existing-routines]
              (when-let [routine-metadata (routine-by-key routine-key)]
                (when-let [our-routine (our-routine-by-key routine-key)]
                  (update-routine-if-needed! routine-metadata our-routine)))))))
      
        ;; Return metrics for monitoring
        (let [end-time (System/currentTimeMillis)
              duration-ms (- end-time start-time)]
          (log/info (format "Routine sync completed for database %s: %d routines processed in %d ms"
                           (:name database)
                           (count db-routines)
                           duration-ms))
          {:updated-routines (+ (count new-routines) (count old-routines))
           :total-routines   (count db-routines)
           :duration-ms      duration-ms
           :new-routines     (count new-routines)
           :retired-routines (count old-routines)
           :database-id      (:id database)
           :database-name    (:name database)})))))