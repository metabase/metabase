(ns metabase.driver.athena.athena-sql-parser
  (require [metabase.driver.athena.hive-schema-parser :as hsp]))

(defn- column->base-type [column-type]
  ({:bigint :type/BigInteger
    :binary :type/*
    :boolean :type/Boolean
    :date :type/Date
    :decimal :type/Decimal
    :double :type/Float
    :float :type/Float
    :int :type/Integer
    :map :type/*
    :smallint :type/Integer
    :string :type/Text
    :timestamp :type/DateTime
    :tinyint :type/Integer
    :uniontype :type/*
    :varchar :type/Text} (keyword column-type)))

(defn- create-nested-fields [schema]
  (set (map (fn [[k v]]
              (let [root {:name (name k)
                          :base-type (cond (map? v) :type/Dictionary
                                                          (sequential? v) :type/Array
                                                          :else (column->base-type v))}]
                (cond
                  (map? v) (assoc root :nested-fields (create-nested-fields v))
                  :else root)))
            schema)))

(defn- remove-root-field [root-field schema]
  (let [root-field-kw (keyword root-field)]
    (cond
      (sequential? schema) schema
      (contains? schema root-field-kw) (schema root-field-kw)
      :else schema)))

(defn- parse-struct-type-field [field-info]
  (let [root-field-name (:name field-info)
        schema (remove-root-field root-field-name (hsp/hive-schema->map (:type field-info)))]
    {:name root-field-name
     :base-type :type/Dictionary
     :nested-fields (create-nested-fields schema)}))

(defn- parse-array-type-field [field-info]
  (let [root-field-name (:name field-info)
        schema (hsp/hive-schema->map (:type field-info))]
    {:name root-field-name :base-type :type/Array}))

(defn- is-struct-type-field? [field-info]
  (clojure.string/starts-with? (:type field-info) "struct"))

(defn- is-array-type-field? [field-info]
  (clojure.string/starts-with? (:type field-info) "array"))

(defn parse-schema [field-info]
  (cond
    ; :TODO Should we also validate maps?
    (is-struct-type-field? field-info) (parse-struct-type-field field-info)
    (is-array-type-field? field-info) (parse-array-type-field field-info)
    :else {:name (:name field-info) :base-type (column->base-type (:type field-info))}))
