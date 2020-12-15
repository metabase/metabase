(ns lint-migrations-file
  (:require [clojure.java.io :as io]
            [clojure.pprint :as pprint]
            [clojure.spec.alpha :as s]
            [yaml.core :as yaml]))

(s/def ::migrations
  (s/keys :req-un [::databaseChangeLog]))

(s/def ::databaseChangeLog
  (s/+ (s/alt :property  (s/keys :req-un [::property])
              :changeSet (s/keys :req-un [::changeSet]))))

(s/def ::changeSet
  (s/keys :req-un [:change-set/id :change-set/changes]
          ;; TODO -- require these on new change sets
          :opt-un [:change-set/author :change-set/comment]))

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

(s/def :change-set/changes
  ;; TODO -- only one change allowed for new change sets
  (s/+ ::change))

(s/def ::change
  (s/keys :opt-un [:change/addColumn :change/addTable]))

(s/def :change/addColumn
  (s/keys :req-un [:add-column/tableName :add-column/columns]))

(s/def :add-column/columns
  (s/alt :column :columns/column))

(s/def :columns/column
  (s/keys :req-un [::column]))

(s/def ::column
  (s/keys :req-un [:column/name :column/type]
          :opt-un [:column/remarks]))

;; TODO -- correct use of onDelete: CASCADE (addForeignKeyConstraint) or deleteCascade: true (constraints)

(defn validate-migrations [migrations]
  (when (= (s/conform ::migrations migrations) :clojure.spec.alpha/invalid)
    (throw (ex-info (str "Validation failed: " (s/explain-str ::migrations migrations))
                    (or (s/explain-data ::migrations migrations) {}))))
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
      (println (.getMessage e))
      (pprint/pprint (Throwable->map e))
      (System/exit 1))))
