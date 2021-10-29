(ns lint-migrations-file
  (:require [change-set strict unstrict]
            [clojure.java.io :as io]
            [clojure.pprint :as pprint]
            [clojure.spec.alpha :as s]
            [clojure.string :as str]
            [clojure.walk :as walk]
            [yaml.core :as yaml]))

(comment change-set.strict/keep-me
         change-set.unstrict/keep-me)

;; just print ordered maps like normal maps.
(defmethod print-method flatland.ordered.map.OrderedMap
  [m writer]
  (print-method (into {} m) writer))

(s/def ::migrations
  (s/keys :req-un [::databaseChangeLog]))

(defn- change-set-ids [change-log]
  (for [{{id :id} :changeSet} change-log
        :when                 id]
    (if (string? id)
      (Integer/parseInt id)
      id)))

(defn distinct-change-set-ids? [change-log]
  ;; there are actually two migration 32s, so that's the only exception we're allowing.
  (let [ids (remove (partial = 32) (change-set-ids change-log))]
    ;; can't apply distinct? with so many IDs
    (= (count ids) (count (set ids)))))

(defn change-set-ids-in-order? [change-log]
  (let [ids (change-set-ids change-log)]
    (= ids (sort ids))))

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

      true ; some other kind of change; continue walking
      x)
    x))

(defn no-bare-blob-or-text-types?
  "Ensures that no \"text\" or \"blob\" type columns are added in changesets with id later than 320 (i.e. version
  0.42.0).  From that point on, \"${text.type}\" should be used instead, so that MySQL can handle it correctly (by using
  `LONGTEXT`).  And similarly, from an earlier point, \"${blob.type\" should be used instead of \"blob\"."
  [change-log]
  (let [problem-cols (atom [])
        walk-fn      (partial assert-no-types-in-change-set #{"blob" "text"} problem-cols)]
    (doseq [[id change-set] (for [{{id :id} :changeSet :as change-set} change-log
                                  :when                                id]
                              [(if (string? id)
                                 (Integer/parseInt id)
                                 id)
                               change-set])]
      (when (> id 320) ; only enforced after changeset ID 320
        (walk/postwalk walk-fn change-set)))
    (empty? @problem-cols)))

;; TODO -- change sets must be distinct by ID.
(s/def ::databaseChangeLog
  (s/and distinct-change-set-ids?
         change-set-ids-in-order?
         no-bare-blob-or-text-types?
         (s/+ (s/alt :property  (s/keys :req-un [::property])
                     :changeSet (s/keys :req-un [::changeSet])))))

(def strict-change-set-cutoff
  "All change sets with an ID >= this number will be validated with the strict spec."
  172)

(defn change-set-validation-level [{id :id}]
  (let [id (cond
             (integer? id) id
             (string? id)  (Integer/parseInt ^String id)
             :else         (throw (ex-info "Invalid ID" {:id id})))]
    (if (>= id strict-change-set-cutoff)
      :strict
      :unstrict)))

(defmulti change-set
  change-set-validation-level)

(defmethod change-set :strict
  [_]
  :change-set.strict/change-set)

(defmethod change-set :unstrict
  [_]
  :change-set.unstrict/change-set)

(s/def ::changeSet
  (s/multi-spec change-set change-set-validation-level))

(defn validate-migrations [migrations]
  (when (= (s/conform ::migrations migrations) :clojure.spec.alpha/invalid)
    (let [data (s/explain-data ::migrations migrations)]
      (throw (ex-info (str "Validation failed:\n" (with-out-str (pprint/pprint (mapv #(dissoc % :val)
                                                                                     (:clojure.spec.alpha/problems data)))))
                      (or (dissoc data :clojure.spec.alpha/value) {})))))
  :ok)

(def filename
  "../../resources/migrations/000_migrations.yaml")

(defn migrations []
  (let [file (io/file filename)]
    (assert (.exists file) (format "%s does not exist" filename))
    (yaml/from-file file)))

(defn- validate-all []
  (validate-migrations (migrations)))

(defn -main []
  (println "Check Liquibase migrations file...")
  (try
    (validate-all)
    (println "Ok.")
    (System/exit 0)
    (catch Throwable e
      (pprint/pprint (Throwable->map e))
      (println (.getMessage e))
      (System/exit 1))))
