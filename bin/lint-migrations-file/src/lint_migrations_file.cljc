(ns lint-migrations-file
  "This is cljc because it is used from both Clojure (:clj) and Babashka (:bb). Not cljs!"
  #_{:clj-kondo/ignore [:unused-alias :unused-namespace]}
  (:require
   [change-set.strict]
   [clj-yaml.core :as yaml]
   [clojure.java.io :as io]
   [clojure.pprint :as pprint]
   [clojure.set :as set]
   [clojure.spec.alpha :as s]
   [clojure.string :as str])
  (:import
   [clojure.lang ExceptionInfo]))

#_:clj-kondo/ignore
(set! *warn-on-reflection* true)

(comment change-set.strict/keep-me)

(defmacro validation-error
  "An exception with `::validation-error` in the data, for easy id later."
  [msg & [data]]
  `(ex-info ~msg (merge ~data {::validation-error true})))

(defn- validation-error? [e]
  (::validation-error (ex-data e)))

#?(:bb ::no-op
   :clj ;; just print ordered maps like normal maps.
   (defmethod print-method flatland.ordered.map.OrderedMap
     [m writer]
     (print-method (into {} m) writer)))

(defn- require-database-change-log! [migrations]
  (when-not (contains? migrations :databaseChangeLog)
    (throw (validation-error "Missing `databaseChangeLog` key."))))

(defn- change-set-ids
  "Returns all the change set ids given a change-log."
  [change-log]
  (for [{{id :id} :changeSet} change-log
        :when id]
    id))

(defn- require-distinct-change-set-ids [change-log]
  (let [ids (change-set-ids change-log)
        duplicates (->> ids
                        (group-by identity)
                        (keep (fn [[k v]]
                                (when (< 1 (count v))
                                  k))))]
    (when (seq duplicates)
      (throw (validation-error "Change set IDs are not distinct." {:duplicates duplicates})))))

(defn- require-change-set-ids-in-order [change-log]
  (let [ids (change-set-ids change-log)
        out-of-order-ids (->> ids
                              (partition 2 1)
                              (filter (fn [[id1 id2]]
                                        (pos? (compare id1 id2)))))]

    (when (seq out-of-order-ids)
      (throw (validation-error "Change set IDs are not in order"
                               {:out-of-order-ids out-of-order-ids})))))

(defn- require-change-set-ids-in-correct-file [change-log file]
  (let [file-version (parse-long (re-find #"\d+" (.getName file)))
        ids (change-set-ids change-log)
        wrong-file-ids (->> ids
                            (filter (fn [id]
                                      (let [id-version (parse-long (re-find #"\d+" id))]
                                        (if (= file-version 1)
                                          (> id-version 55)
                                          (not= file-version id-version))))))]
    (when (seq wrong-file-ids)
      (throw (validation-error "Change set IDs are in the wrong file"
                               {:wrong-file-ids wrong-file-ids})))))

(defn- check-change-use-types?
  "Return `true` if change use any type in `types`."
  [types change]
  {:pre [(set? types)]}
  (let [match-target-types? (fn [ttype]
                              (contains? types (str/lower-case ttype)))]
    (cond
     ;; a createTable or addColumn change; see if it adds a target-type col
      (or (:createTable change) (:addColumn change))
      (let [op (cond (:createTable change) :createTable (:addColumn change) :addColumn)]
        (some (fn [col-def]
                (match-target-types? (get-in col-def [:column :type] "")))
              (get-in change [op :columns])))

     ;; a modifyDataType change; see if it change a column to target-type
      (and (:modifyDataType change)
           (match-target-types? (get-in change [:modifyDataType :newDataType] "")))
      true)))

(defn- check-change-set-use-types?
  "Return true if `change-set` doesn't contain usage of any type in `types`."
  [target-types change-set]
  (some #(check-change-use-types? target-types %) (get-in change-set [:changeSet :changes])))

(defn- require-no-types-in-change-log!
  "Returns true if none of the changes in the change-log contain usage of any type specified in `target-types`.

  `id-filter-fn` is a function that takes an ID and return true if the changeset should be checked."
  ([target-types change-log]
   (require-no-types-in-change-log! target-types change-log (constantly true)))
  ([target-types change-log id-filter-fn]
   {:pre [(set? target-types)]}
   (when-let [using-types? (->> change-log
                                (filter (fn [change-set]
                                          (let [id (get-in change-set [:changeSet :id])]
                                            (and (string? id)
                                                 (id-filter-fn id)))))
                                (filter #(check-change-set-use-types? target-types %))
                                (map #(get-in % [:changeSet :id]))
                                seq)]
     (throw (validation-error
             #_:clj-kondo/ignore
             (format "Migration(s) [%s] uses invalid types (in %s)"
                     (str/join "," (map #(str "'" % "'") using-types?))
                     (str/join "," (map #(str "'" % "'") target-types)))
             {:invalid-ids using-types?
              :target-types target-types})))))

(defn require-no-bare-blob-or-text-types
  "Ensures that no \"text\" or \"blob\" type columns are added in any changesets."
  [change-log]
  (require-no-types-in-change-log! #{"blob" "text"} change-log))

(defn require-no-bare-boolean-types
  "Ensures that no \"boolean\" type columns are added in changesets with id later than v49.00-032. From that point on,
  \"${boolean.type}\" should be used instead, so that we can consistently use `BIT(1)` for Boolean columns on MySQL."
  [change-log]
  (require-no-types-in-change-log! #{"boolean"} change-log #(pos? (compare % "v49.00-032"))))

(defn require-no-datetime-type
  "Ensures that no \"datetime\" or \"timestamp without time zone\".
  From that point on, \"${timestamp_type}\" should be used instead, so that all of our time related columns are tz-aware."
  [change-log]
  (require-no-types-in-change-log!
   #{"datetime" "timestamp" "timestamp without time zone"}
   change-log
   #(pos? (compare % "v49.00-000"))))

(defn require-primary-key-exists-has-table-name
  "Ensures that all primaryKeyExists preconditions specify a tableName."
  [change-log]
  (doseq [{:keys [changeSet]} change-log
          :when changeSet
          :let [s (pr-str (:preConditions changeSet))]
          :when (and (str/includes? s ":primaryKeyExists")
                     (not (str/includes? s ":tableName")))]
    (throw (validation-error
            (format "Migration '%s' has primaryKeyExists precondition without tableName" (:id changeSet))
            {:id (:id changeSet)}))))

(s/def ::changeSet
  (s/spec :change-set.strict/change-set))

(defn- only-key [m]
  (let [keys (keys m)]
    (when-not (= 1 (count keys))
      (throw (validation-error "Expected exactly one key." {:keys keys})))
    (first keys)))

(defn- validate-database-change-log [change-log file]
  (when (string? change-log)
    (throw (validation-error "Expected `:databaseChangeLog` to be a map, not a string.")))

  (require-distinct-change-set-ids change-log)
  (require-change-set-ids-in-correct-file change-log file)
  (require-change-set-ids-in-order change-log)
  (require-no-bare-blob-or-text-types change-log)
  (require-no-bare-boolean-types change-log)
  (require-no-datetime-type change-log)
  (require-primary-key-exists-has-table-name change-log)
  (let [{:keys [changeSet]
         :as all} (group-by only-key change-log)]
    (when-not (set/subset? (set (keys all)) #{:property :objectQuotingStrategy :changeSet})
      (throw (validation-error "Expected exactly one of :property, :objectQuotingStrategy, or :changeSet."
                               {:keys (keys all)})))
    (doseq [{:keys [changeSet]} changeSet
            :when (not (s/valid? ::changeSet changeSet))]
      (throw (validation-error "Invalid change set." (s/explain-data ::changeSet changeSet))))))

(defn- validate-migrations [migrations file]
  (require-database-change-log! migrations)
  (validate-database-change-log (:databaseChangeLog migrations) file)
  :ok)

(defn- migration-files []
  #_{:clj-kondo/ignore [:unresolved-symbol :unused-binding :syntax]}
  (let [dir-str #?(:bb "resources/migrations" :clj "../../resources/migrations")
        dir (io/file dir-str)]
    (->> (file-seq dir)
         (filter #(and (.isFile %) (str/ends-with? (.getName %) "_update_migrations.yaml"))))))

(defn- migrations [file]
  (assert (.exists file) (format "%s does not exist" file))
  (letfn [(fix-vals [x]
            ;; convert any lazy seqs to regular vectors and maps
            (cond (map? x) (update-vals x fix-vals)
                  (sequential? x) (mapv fix-vals x)
                  :else x))]
    (fix-vals (yaml/parse-string
               #_:clj-kondo/ignore (slurp file)))))

(defn- validate-all []
  (doseq [file (migration-files)]
    (println "Validating" (.getName file) "...")
    (try
      (validate-migrations (migrations file) file)
      (catch ExceptionInfo e
        (throw (ex-info (.getMessage e) (assoc (ex-data e) :file (.getName file)) e))))))

(defn -main
  "Entry point for Clojure CLI task `lint-migrations-file`. Run it with

    ./bin/lint-migrations-file.sh"
  []
  (println "Check Liquibase migrations files...")
  (try
    (validate-all)
    (println "Ok.")
    #_:clj-kondo/ignore
    (System/exit 0)
    (catch ExceptionInfo e
      (if (validation-error? e)
        (do
          (println)
          #_:clj-kondo/ignore
          (printf "Error in %s:\t%s\n" (:file (ex-data e)) (.getMessage e))
          #_:clj-kondo/ignore
          (printf "Details:\n\n %s" (with-out-str (pprint/pprint (dissoc (ex-data e) ::validation-error))))
          (println))
        (do
          (pprint/pprint (Throwable->map e))
          (println (.getMessage e))))
      #_:clj-kondo/ignore
      (System/exit 1))
    (catch #_:clj-kondo/ignore
     Throwable e
           (pprint/pprint (Throwable->map e))
           (println (.getMessage e))
           #_:clj-kondo/ignore
           (System/exit 1))))
