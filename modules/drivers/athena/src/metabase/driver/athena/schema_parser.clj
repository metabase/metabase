(ns metabase.driver.athena.schema-parser
  (:require
   [clojure.string :as str]
   [metabase.driver.athena.hive-parser :as athena.hive-parser]
   [metabase.driver.sql-jdbc.sync :as sql-jdbc.sync]))

(set! *warn-on-reflection* true)

(defn- column->base-type [column-type]
  (sql-jdbc.sync/database-type->base-type :athena (keyword (re-find #"\w+" column-type))))

(defn- create-nested-fields [schema database-position]
  (set (map (fn [[k v]]
              (let [root {:name              (name k)
                          :base-type         (cond (map? v)        :type/Dictionary
                                                   (sequential? v) :type/Array
                                                   :else           (column->base-type v))
                          :database-type     (cond (map? v)        "map"
                                                   (sequential? v) "array"
                                                   :else           v)
                          :database-position database-position}]
                (cond
                  (map? v) (assoc root :nested-fields (create-nested-fields v database-position))
                  :else    root)))
            schema)))

(defn- parse-struct-type-field [field-info database-position]
  (let [root-field-name (:name field-info)
        schema          (athena.hive-parser/hive-schema->map (:type field-info))]
    {:name              root-field-name
     :base-type         :type/Dictionary
     :database-type     "struct"
     :database-position database-position
     :nested-fields     (create-nested-fields schema database-position)}))

(defn- parse-array-type-field [field-info database-position]
  {:name (:name field-info) :base-type :type/Array :database-type "array" :database-position database-position})

(defn- is-struct-type-field? [field-info]
  (str/starts-with? (:type field-info) "struct"))

(defn- is-array-type-field? [field-info]
  (str/starts-with? (:type field-info) "array"))

(defn parse-schema
  "Parse specific Athena types"
  [field-info]
  (cond
    ; :TODO Should we also validate maps?
    (is-struct-type-field? field-info)
    (parse-struct-type-field field-info (:database-position field-info))

    (is-array-type-field? field-info)
    (parse-array-type-field field-info (:database-position field-info))

    :else
    {:name              (:name field-info)
     :base-type         (column->base-type (:type field-info))
     :database-type     (:type field-info)
     :database-position (:database-position field-info)}))
