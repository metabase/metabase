(ns metabase.driver.athena.schema-parser
  (:require
   [clojure.string :as str]
   [metabase.driver.athena.hive-parser :as athena.hive-parser]
   [metabase.driver.sql-jdbc.sync :as sql-jdbc.sync]))

(set! *warn-on-reflection* true)

(defn- column->base-type [column-type]
  (sql-jdbc.sync/database-type->base-type :athena (keyword (re-find #"\w+" column-type))))

(defn- flatten-nested-fields
  "Recursively flatten nested struct fields into a flat list with nfc_path.
   Returns a sequence of field maps with :nfc-path set for nested fields.
   Nested field names use arrow notation (→) to show the full path.
   Nested fields get database-position 0 to match Postgres JSONB behavior."
  [schema parent-path]
  (mapcat (fn [[k v]]
            (let [field-name (name k)
                  current-path (conj parent-path field-name)
                  ;; Use arrow separator for nested field names to ensure uniqueness
                  display-name (str/join " → " current-path)]
              (if (map? v)
                ;; For struct types, recursively flatten children but don't include the struct itself
                ;; Only leaf fields get nfc-path, intermediate structs are excluded
                (flatten-nested-fields v current-path)
                ;; For non-struct types (leaf fields), include this field with nfc-path
                ;; Position is 0 to match Postgres behavior where JSONB nested fields have position 0
                [{:name display-name
                  :database-type (if (sequential? v) "array" v)
                  :base-type (if (sequential? v) :type/Array (column->base-type v))
                  :database-position 0
                  :nfc-path current-path}])))
          schema))

(defn- parse-struct-type-field [field-info database-position]
  (let [root-field-name (:name field-info)
        schema (athena.hive-parser/hive-schema->map (:type field-info))]
    ;; Return a set containing the root struct field (without nfc-path) and all leaf nested fields (with nfc-path)
    ;; This matches Postgres behavior: the parent JSONB column exists in metadata but only leaf fields are selectable
    (into #{}
          (cons {:name root-field-name
                 :base-type :type/Dictionary
                 :database-type "struct"
                 :database-position database-position}
                (flatten-nested-fields schema [root-field-name])))))

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
    {:name (:name field-info)
     :base-type (column->base-type (:type field-info))
     :database-type (:type field-info)
     :database-position (:database-position field-info)}))
