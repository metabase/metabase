(ns lint-migrations-file
  (:require
   [change-set.strict]
   [clj-yaml.core :as yaml]
   [clojure.java.io :as io]
   [clojure.pprint :as pprint]
   [clojure.spec.alpha :as s]
   [clojure.string :as str]
   [clojure.walk :as walk]))

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

(defn- compare-ids
  "If `x` and `y` are integers, compare numerical values. Otherwise do String comparison."
  [x y]
  ;; Clojure gets confused if you try to compare a String and a Number.
  (if (= (class x) (class y))
    (compare x y)
    (compare (str x) (str y))))

(defn- change-set-ids-in-order? [change-log]
  (let [ids (change-set-ids change-log)]
    (= ids (sort-by identity compare-ids ids))))

(defn- assert-no-types-in-change-set
  "Walks over x (a changeset map) to ensure it doesn't add any columns of `target-types` (a set of strings).
  `found-cols` is an atom of vector, in which any problematic changes to the `target-types` will be stored.

  A partial application of this function will be passed to postwalk below.

  TODO: add and conform to a spec instead?"
  [target-types found-cols x]
  {:pre [(set? target-types) (instance? clojure.lang.Atom found-cols)]}
  (if
    (map? x)
    (cond
      ;; a createTable or addColumn change; see if it adds a target-type col
      (or (:createTable x) (:addColumn x))
      (let [op     (cond (:createTable x) :createTable (:addColumn x) :addColumn)
            cols   (filter (fn [col-def]
                             (contains? target-types
                                        (str/lower-case (or (get-in col-def [:column :type]) ""))))
                     (get-in x [op :columns]))]
        (doseq [col cols]
          (swap! found-cols conj col))
        x)

      ;; a modifyDataType change; see if it changes a column to target-type
      (:modifyDataType x)
      (if (= target-types (str/lower-case (or (get-in x [:modifyDataType :newDataType]) "")))
        (do (swap! found-cols conj x)
            x)
        x)

      ;; some other kind of change; continue walking
      :else x)
    x))

(defn no-bare-blob-or-text-types?
  "Ensures that no \"text\" or \"blob\" type columns are added in changesets with id later than 320 (i.e. version
  0.42.0).  From that point on, \"${text.type}\" should be used instead, so that MySQL can handle it correctly (by using
  `LONGTEXT`).  And similarly, from an earlier point, \"${blob.type\" should be used instead of \"blob\"."
  [change-log]
  (let [problem-cols (atom [])
        walk-fn      (partial assert-no-types-in-change-set #{"blob" "text"} problem-cols)]
    (doseq [{{id :id} :changeSet, :as change-set} change-log
            :when                                 (and id
                                                       (string? id))]
      [id change-set])
    (doseq [{{id :id} :changeSet :as change-set} change-log
            :when                                (and id
                                                      (string? id)
                                                      (str/starts-with? id "v"))]
      (walk/postwalk walk-fn change-set))
    (empty? @problem-cols)))

(s/def ::changeSet
  (s/spec :change-set.strict/change-set))

(s/def ::databaseChangeLog
  (s/and distinct-change-set-ids?
         change-set-ids-in-order?
         no-bare-blob-or-text-types?
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
