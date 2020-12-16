(ns lint-migrations-file
  (:require [clojure.java.io :as io]
            [clojure.pprint :as pprint]
            [clojure.spec.alpha :as s]
            [yaml.core :as yaml]))

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

;; TODO -- change sets must be distinct by ID.
(s/def ::databaseChangeLog
  (s/and distinct-change-set-ids?
         change-set-ids-in-order?
         (s/+ (s/alt :property  (s/keys :req-un [::property])
                     :changeSet (s/keys :req-un [::changeSet])))))

;; Strict change set validation:
;;
;; All *new* change sets can only have one change per change set -- this is a Liquibase best practice. (Otherwise part
;; of the change set can succeed without the entire change set succeeding)
;;
;; Comment is required. Has to be something like 'Added x.38.0'

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

;; ID must be either an integer or string
(s/def :change-set/id
  (s/or
   :int int?
   :int-string (s/and
                string?
                (fn [^String s]
                  (try
                    (Integer/parseInt s)
                    (catch Throwable _
                      false))))))

(s/def :change-set/comment
  string?)

(s/def :change-set/shared
  (s/keys :req-un [:change-set/id :change-set/author]))

(defmethod change-set :unstrict
  [_]
  (s/merge
   :change-set/shared
   (s/keys :req-un [:change-set.unstrict/changes]
           :opt-un [:change-set.unstrict/comment])))

(s/def :change-set.unstrict/comment
  string?)

(defmethod change-set :strict
  [_]
  (s/merge
   :change-set/shared
   (s/keys :req-un [:change-set.strict/changes :change-set.strict/comment])))

(s/def change-set.strict/comment
  (partial re-find #"Added [\d.x]+"))

(s/def ::changeSet
  (s/multi-spec change-set change-set-validation-level))

(s/def ::change
  (s/keys :opt-un [:change/addColumn]))

(s/def :change/addColumn
  (s/keys :req-un [:add-column/tableName :add-column/columns]))

(s/def :add-column/columns
  (s/alt :column :columns/column))

(s/def :columns/column
  (s/keys :req-un [::column]))

(s/def ::column
  (s/keys :req-un [:column/name :column/type]
          :opt-un [:column/remarks]))

;; unstrict change set: one or more changes
(s/def :change-set.unstrict/changes
  (s/+ ::change))

;; only one change allowed per change set for the strict schema.
(s/def :change-set.strict/changes
  (s/alt :change ::change))

;; TODO -- correct use of onDelete: CASCADE (addForeignKeyConstraint) or deleteCascade: true (constraints)

(defn validate-migrations [migrations]
  (when (= (s/conform ::migrations migrations) :clojure.spec.alpha/invalid)
    (let [data (s/explain-data ::migrations migrations)]
      (throw (ex-info (str "Validation failed:\n" (with-out-str (pprint/pprint (mapv #(dissoc % :val)
                                                                                     (:clojure.spec.alpha/problems data)))))
                      (or data {})))))
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
