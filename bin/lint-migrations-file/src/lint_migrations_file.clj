(ns lint-migrations-file
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

(set! *warn-on-reflection* true)

(comment change-set.strict/keep-me)

(defmacro validation-error
  "An exception with `::validation-error` in the data, for easy id later."
  [msg & [data]]
  `(ex-info ~msg (merge ~data {::validation-error true})))

(defn- validation-error? [e]
  (::validation-error (ex-data e)))

;; just print ordered maps like normal maps.
(defmethod print-method flatland.ordered.map.OrderedMap
  [m writer]
  (print-method (into {} m) writer))

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
  From that point on, \"${timestamp_type}\" should be used instead, so that all of our time related columsn are tz-aware."
  [change-log]
  (require-no-types-in-change-log!
   #{"datetime" "timestamp" "timestamp without time zone"}
   change-log
   #(pos? (compare % "v49.00-000"))))

(s/def ::changeSet
  (s/spec :change-set.strict/change-set))

(defn- only-key [m]
  (let [keys (keys m)]
    (when-not (= 1 (count keys))
      (throw (validation-error "Expected exactly one key." {:keys keys})))
    (first keys)))

(defn- validate-database-change-log [change-log]
  (require-distinct-change-set-ids change-log)
  (require-change-set-ids-in-order change-log)
  (require-no-bare-blob-or-text-types change-log)
  (require-no-bare-boolean-types change-log)
  (require-no-datetime-type change-log)
  (let [{:keys [changeSet]
         :as all} (group-by only-key change-log)]
    (when-not (set/subset? (set (keys all)) #{:property :objectQuotingStrategy :changeSet})
      (throw (validation-error "Expected exactly one of :property, :objectQuotingStrategy, or :changeSet."
                               {:keys (keys all)})))
    (doseq [{:keys [changeSet]} changeSet
            :when (not (s/valid? ::changeSet changeSet))]
      (throw (validation-error "Invalid change set." (s/explain-data ::changeSet changeSet))))))

(defn- validate-migrations [migrations]
  (require-database-change-log! migrations)
  (validate-database-change-log (:databaseChangeLog migrations))
  :ok)

(def ^:private filename
  "../../resources/migrations/001_update_migrations.yaml")

(defn- migrations []
  (let [file (io/file filename)]
    (assert (.exists file) (format "%s does not exist" filename))
    (letfn [(fix-vals [x]
                      ;; convert any lazy seqs to regular vectors and maps
                      (cond (map? x)        (update-vals x fix-vals)
                            (sequential? x) (mapv fix-vals x)
                            :else           x))]
      (fix-vals (yaml/parse-string (slurp file))))))

(defn- validate-all []
  (validate-migrations (migrations)))

(defn -main
  "Entry point for Clojure CLI task `lint-migrations-file`. Run it with

    ./bin/lint-migrations-file.sh"
  []
  (println "Check Liquibase migrations file...")
  (try
    (validate-all)
    (println "Ok.")
    (System/exit 0)
    (catch ExceptionInfo e
      (if (validation-error? e)
        (do
          (println)
          (printf "Error:\t%s\n" (.getMessage e))
          (printf "Details:\n\n %s" (with-out-str (pprint/pprint (dissoc (ex-data e) ::validation-error))))
          (println))
        (do
          (pprint/pprint (Throwable->map e))
          (println (.getMessage e))))
      (System/exit 1))
    (catch Throwable e
      (pprint/pprint (Throwable->map e))
      (println (.getMessage e))
      (System/exit 1))))
