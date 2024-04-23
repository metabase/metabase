(ns metabase.test.data.druid-jdbc.ingestion
  (:require
   [cheshire.core :as json]
   [clj-http.client :as http]
   [clojure.java.io :as io]
   [clojure.string :as str]
   [java-time.api :as t]
   [metabase.util.date-2 :as u.date]

   [metabase.test.data.interface :as tx]
   
   [metabase.test.data.dataset-definition-test :as dataset-definition-test]))

(set! *warn-on-reflection* true)

;; TODO: I should use field
(defn prepare-field-value
  [value]
  (def vvv value)
  (cond-> (u.date/add-zone-to-local value (t/zone-id "UTC"))
    (instance? java.time.temporal.Temporal value)
    (->> (t/instant value)
         (.getEpochSecond)
         (* 1000))))

(defn adjust-temporal-values
  [table-def]
  (let [temporal-field-indices (keep-indexed (fn [i {:keys [base-type] :as _field-value}]
                                               (when (isa? base-type :type/Temporal)
                                                 i))
                                             (:field-definitions table-def))]
    (update table-def :rows (partial mapv (fn [row]
                                            (reduce (fn [acc index]
                                                      (update acc index prepare-field-value))
                                                    row
                                                    temporal-field-indices))))))

(defn add-__time-to-field-def
  [field-defs]
  (into [{:field-name "__time"
          :base-type :type/DateTime}]
        field-defs))

(defn add-__time-to-table-def
  [table-def]
  (-> table-def
      (update :field-definitions add-__time-to-field-def)
      (update :rows
              (partial map (fn [row row-number] (into [row-number] row)))
              (map inc (range)))))

;; This is important!
(defn adjust-json-fields
  [table-def]
  (let [field-defs (:field-definitions table-def)
        json-col-indices (keep-indexed (fn [idx field-def] 
                                         (when (= :type/JSON (:base-type field-def))
                                           idx))
                                       field-defs)]
    (update table-def :rows (partial mapv (fn [row]
                                            (reduce (fn [row index]
                                                      (update row index json/parse-string))
                                                    row
                                                    json-col-indices))))))

;; I have to pick right coercion! -- 
;; I don't know how following works yet!!!
;; base on [[metabase.types.coercion-hierarchies/strategy->effective-type]]
(defn maybe-adjust-coercion
  [field-def]
  (if-not (and (not= "__time" (:field-name field-def))
               (isa? (:base-type field-def) :type/Temporal))
    field-def
    (-> field-def
        (assoc :coercion-strategy :Coercion/UNIXMilliSeconds->DateTime)
        (assoc :effective-type :type/Instant)
        (assoc :base-type :type/Integer))))

(defn adjust-coercions
  [table-def]
  (update table-def :field-definitions (partial map maybe-adjust-coercion)))

;; should be called after `add-__time-to-table-def`
(defn add-id-col
  [table-def]
  (-> table-def
      (update :field-definitions (fn [[time-col & rest-cols]]
                                   (into [time-col {:field-name "id"
                                                    :base-type :type/Integer}]
                                         rest-cols)))
      (update :rows (fn [row]
                      (mapv
                       (fn [index [time-col & rest-row]]
                         (into [time-col index] rest-row))
                       (map inc (range))
                       row)))))

(defn prepare-table-def
  "Add `__time` column."
  [table-def]
  @(def ddd (-> table-def
                add-__time-to-table-def
                adjust-temporal-values
                adjust-json-fields
                adjust-coercions
                add-id-col)))

;;
;; PROCESS
;;

;; this should ignore __time
(defn table-def->maps
  [table-def]
  (def tdtd table-def)
  (let [;; silly next line
        #_#_table-def (-> table-def
                          (update :field-definitions subvec 1)
                          (update :rows (partial mapv (fn [[_ & row]] (vec row)))))
        field-defs (-> table-def :field-definitions)
        col-names @(def xi (map :field-name field-defs))
        rows (-> table-def :rows)]
    (mapv (fn [row] (zipmap col-names row))
         rows)))

(defn table-maps->jsons
  [table-maps]
  (mapv json/generate-string table-maps))

(defn ->json
  [table-jsons]
  (str/join "\n" table-jsons))

(defn ingestion-spec-base
  []
  (with-open [r (io/reader (io/resource "./ingestion_spec_base.json"))]
    (json/parse-stream r)))

;; wrong name
(defn table-def->json
  [table-def]
  (-> table-def
      #_prepare-table-def
      table-def->maps
      table-maps->jsons
      ->json))

;; TODO: Currently redundant!
(defn base-type->dimension-type
  [base-type]
  (case base-type
    #_#_:type/JSON "json"
    "auto"))

;; TODO: Currently redundant
(defn field-def->dimension
  [field-def]
  {"name" (:field-name field-def)
   "type" (base-type->dimension-type (:base-type field-def))})

;; TODO: Add types to dimensions
(defn table-def->dimensions
  [table-def]
  #_(let [field-names (map :field-name (:field-definitions table-def))]
    (vec field-names))
  #_(let [field-defs (:field-definitions table-def)]
    {"name" (:name )})
  ;; ignoring __time field
  (map field-def->dimension (rest (:field-definitions table-def))))

(defn table-def->ingestion-spec
  [table-def & {:keys [datasource-name] :as _opts}]
  (let [base (ingestion-spec-base)
        dimensions (table-def->dimensions table-def)
        data (table-def->json table-def)]
    (-> base
        (assoc-in ["spec" "dataSchema" "dataSource"] #_"users_test_0" (or datasource-name
                                                                          (:table-name table-def)))
        (assoc-in ["spec" "dataSchema" "dimensionsSpec" "dimensions"] dimensions)
        (assoc-in ["spec" "ioConfig" "inputSource" "data"] data))))

;; TODO: Hardcoded url. Should be using tx/db-def->spec?
(defn execute-ingestion-spec!
  "Return task id. May throw."
  [ingestion-spec-json]
  (let [result (http/post "http://localhost:8888/druid/indexer/v1/task"
                          {:content-type :json
                           :body ingestion-spec-json})]
    (@(def aaa (json/parse-string (:body result))) "task")))

(defn task-status
  "How to acquire task-id?
   What does this return?"
  [task-id]
  #_(println (str "executing task " task-id))
  (json/parse-string (:body (http/get (str "http://localhost:8888/druid/indexer/v1/task/" task-id "/status")))))

;; following could be done in multiple threads?
;; super naive impl first!
(defn ingest-table!
  [table-def & {:as _opts}]
  (let [ingestion-spec-json (json/generate-string (table-def->ingestion-spec table-def))]
    (let [task-id @(def xixi (execute-ingestion-spec! ingestion-spec-json))
          timeout (* 60 1000) ; 60s
          start-time (System/currentTimeMillis)]
      (loop [now (System/currentTimeMillis)]
        (let [delta (- now start-time)
              task-status (task-status task-id)
              status (get-in task-status ["status" "status"])]
          (println "task status for " task-id " is " status)
          (cond (> delta timeout)
                (throw (ex-info "Timeout"
                                {}))

                (= "SUCCESS" status)
                [::success task-status]

                :else
                (do
                  (println "waiting 5 seconds databsae ingestion in progress")
                  (Thread/sleep 5000)
                  (recur (System/currentTimeMillis)))))))))

(defn ingest-dataset!
  [dataset-def]
  (let [result (mapv ingest-table! (:table-definitions dataset-def))]
    (println "waiting 10 seconds after dataset ingestion")
    (Thread/sleep 10000)
    (println "10 s waiting period ended. Should be ready for sync.")
    result))




;;
;; Preprocess
;;

;; redundant, temporary
(defn preprocess-table-def
  [table-def]
  (prepare-table-def table-def))

(def ^:dynamic *adjust-table-name?* true)

(defn adjust-table-name [db-name table-def]
  (cond-> table-def
    *adjust-table-name?* (update :table-name (partial tx/db-qualified-table-name db-name))))

#_(defn ajdust-table-names
  [dataset-def]
  (let [db-name (:database-name dataset-def)]
    (update dataset-def :table-definitions (partial mapv (partial adjust-table-name db-name)))))

;; table defs done...
(defn preprocess-dataset*
  [dataset-def]
  (let [db-name (:database-name dataset-def)]
    (-> dataset-def
      ;; following exprs shoudl be merged!
        (update :table-definitions (partial mapv (partial adjust-table-name db-name)))
        (update :table-definitions (partial mapv preprocess-table-def))
        (assoc ::preprocessed true))))

(defn preprocess-dataset
  [dataset]
  (if (::preprocessed dataset)
    dataset
    (preprocess-dataset* dataset)))