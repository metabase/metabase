(ns lint-migrations-file
  (:require
   [change-set.strict]
   [clj-yaml.core :as yaml]
   [clojure.java.io :as io]
   [clojure.pprint :as pprint]
   [clojure.spec.alpha :as s]
   [clojure.string :as str]))

(set! *warn-on-reflection* true)

(comment change-set.strict/keep-me)

;; just print ordered maps like normal maps.
(defmethod print-method flatland.ordered.map.OrderedMap
  [m writer]
  (print-method (into {} m) writer))

(s/def ::migrations
  (s/keys :req-un [::databaseChangeLog]))

(defn- change-set-ids
  "Returns all the change set ids given a change-log."
  [change-log]
  (for [{{id :id} :changeSet} change-log
        :when id]
    id))

(defn- distinct-change-set-ids? [change-log]
  (let [ids (change-set-ids change-log)]
    ;; can't apply distinct? with so many IDs
    (= (count ids) (count (set ids)))))

(defn- change-set-ids-in-order? [change-log]
  (let [ids (change-set-ids change-log)]
    (= ids (sort-by identity compare ids))))

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

(defn- assert-no-types-in-change-log
  "Returns true if none of the changes in the change-log contain usage of any type specified in `target-types`.

  `id-filter-fn` is a function that takes an ID and return true if the changeset should be checked."
  ([target-types change-log]
   (assert-no-types-in-change-log target-types change-log (constantly true)))
  ([target-types change-log id-filter-fn]
   {:pre [(set? target-types)]}
   (->> change-log
        (filter (fn [change-set]
                  (let [id (get-in change-set [:changeSet :id])]
                    (and (string? id)
                         (id-filter-fn id)))))
        (some #(check-change-set-use-types? target-types %))
        not)))

(defn no-bare-blob-or-text-types?
  "Ensures that no \"text\" or \"blob\" type columns are added in changesets with id later than 320 (i.e. version
  0.42.0).  From that point on, \"${text.type}\" should be used instead, so that MySQL can handle it correctly (by using
  `LONGTEXT`).  And similarly, from an earlier point, \"${blob.type}\" should be used instead of \"blob\"."
  [change-log]
  (assert-no-types-in-change-log #{"blob" "text"} change-log))

(defn no-bare-boolean-types?
  "Ensures that no \"boolean\" type columns are added in changesets with id later than v49.00-032. From that point on,
  \"${boolean.type}\" should be used instead, so that we can consistently use `BIT(1)` for Boolean columns on MySQL."
  [change-log]
  (assert-no-types-in-change-log #{"boolean"} change-log #(pos? (compare % "v49.00-032"))))

(defn no-datetime-type?
  "Ensures that no \"datetime\" or \"timestamp without time zone\".
  From that point on, \"${timestamp_type}\" should be used instead, so that all of our time related columsn are tz-aware."
  [change-log]
  (assert-no-types-in-change-log
   #{"datetime" "timestamp" "timestamp without time zone"}
   change-log
   #(pos? (compare % "v49.00-000"))))

(s/def ::changeSet
  (s/spec :change-set.strict/change-set))

(s/def ::databaseChangeLog
  (s/and distinct-change-set-ids?
         change-set-ids-in-order?
         no-bare-blob-or-text-types?
         no-bare-boolean-types?
         no-datetime-type?
         (s/+ (s/alt :property              (s/keys :req-un [::property])
                     :objectQuotingStrategy (s/keys :req-un [::objectQuotingStrategy])
                     :changeSet             (s/keys :req-un [::changeSet])))))

(defn- validate-migrations [migrations]
  (when (= (s/conform ::migrations migrations) ::s/invalid)
    (let [data (s/explain-data ::migrations migrations)]
      (throw (ex-info (str "Validation failed:\n" (with-out-str (pprint/pprint (mapv #(dissoc % :val)
                                                                                     (::s/problems data)))))
                      (or (dissoc data ::s/value) {})))))
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
    (catch Throwable e
      (pprint/pprint (Throwable->map e))
      (println (.getMessage e))
      (System/exit 1))))
