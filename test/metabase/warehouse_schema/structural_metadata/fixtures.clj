(ns metabase.warehouse-schema.structural-metadata.fixtures
  "Fixture schemas for the structural metadata design check, as the prototype classifiers would see them after sync."
  (:refer-clojure :exclude [some])
  (:require
   [clojure.edn :as edn]
   [clojure.java.io :as io]
   [metabase.analyze.core :as analyze]
   [metabase.util :as u]
   [metabase.util.performance :refer [some]]
   [toucan2.core :as t2]))

;; The prototype's `name.clj` (prototype/semantic-layer-1-structure, commit 3dc2ec9ad3b) types columns that the copied
;; classifiers read by semantic type. Only the rules for types they read are inlined here; the rest of that file's
;; changes are left out. `head` rules sat before the base rules there, `tail` rules after them.

(def ^:private prototype-head-name-rules
  [[#"^_fivetran_active$"                                      #{:type/Boolean}  :type/CurrentRowFlag]
   [#"^(?:_fivetran_synced|_airbyte_(?:extracted|emitted)_at)$" #{:type/Temporal} :type/LoadTimestamp]
   [#"^(?:_fivetran_start|dbt_valid_from)$"                    #{:type/Temporal} :type/ValidFrom]
   [#"^(?:_fivetran_end|dbt_valid_to)$"                        #{:type/Temporal} :type/ValidTo]
   [#"(?:^|_)(?:valid|effective)_(?:from|start)|^effective_date$" #{:type/Temporal} :type/ValidFrom]
   [#"(?:^|_)(?:valid|effective)_(?:to|until|end)"             #{:type/Temporal} :type/ValidTo]])

(def ^:private prototype-tail-name-rules
  [[#"^(?:_?loaded_at|synced_at|_etl_loaded_at|ingested_at)$" #{:type/Temporal}              :type/LoadTimestamp]
   [#"^(?:version|revision|etag|rev)$|_version$"             #{:type/Integer :type/Text}    :type/Version]
   [#"_status$|(?:^|_)(?:stage|phase|result)$"               #{:type/Integer :type/Text}    :type/Status]
   [#"^(?:is_current|is_latest|current_flag)$"               #{:type/Boolean}               :type/CurrentRowFlag]])

(defn- match-rule [rules field-name base-type]
  (some (fn [[pattern base-types semantic-type]]
          (when (and (some #(isa? base-type %) base-types)
                     (re-find pattern field-name))
            semantic-type))
        rules))

(defn prototype-semantic-type
  "The semantic type the prototype's sync gives a column with `field-name` and `base-type`, as far as the copied
  classifiers care: the inlined prototype rules, around the base branch's own name classifier."
  [field-name base-type]
  (let [lower-name (u/lower-case-en field-name)]
    (or (match-rule prototype-head-name-rules lower-name base-type)
        (analyze/infer-semantic-type-by-name {:name field-name, :base_type base-type})
        (match-rule prototype-tail-name-rules lower-name base-type))))

(defn load-fixture
  "Read the fixture schema `fixture-name` from `test_resources/structural_metadata/`."
  [fixture-name]
  (-> (str "structural_metadata/" fixture-name ".edn") io/resource slurp edn/read-string))

(defn database-fixture
  "The tables and fields of the Database `db-id`, e.g. the `test-data` dataset, in the shape of an EDN fixture."
  [db-id]
  (let [tables    (t2/select :model/Table :db_id db-id :active true {:order-by [[:name :asc]]})
        fields    (t2/select :model/Field :table_id [:in (map :id tables)] :active true
                             {:order-by [[:table_id :asc] [:position :asc] [:id :asc]]})
        id->field (u/index-by :id fields)
        id->table (u/index-by :id tables)
        by-table  (group-by :table_id fields)]
    {:schema (:schema (first tables))
     :tables (vec (for [table tables]
                    {:name   (:name table)
                     :fields (vec (for [field (by-table (:id table))
                                        :let [target (some-> (:fk_target_field_id field) id->field)]]
                                    (cond-> {:name          (:name field)
                                             :base_type     (:base_type field)
                                             :semantic_type (:semantic_type field)}
                                      (isa? (:semantic_type field) :type/PK)
                                      (assoc :pk true)

                                      target
                                      (assoc :fk (str (:name (id->table (:table_id target))) "." (:name target))))))}))}))

(defn- field-semantic-type [{field-name :name, :keys [base_type semantic_type pk fk], :as field}]
  (cond
    (contains? field :semantic_type) semantic_type
    pk                               :type/PK
    fk                               :type/FK
    :else                            (prototype-semantic-type field-name base_type)))

(defn insert-fixture!
  "Insert the tables and fields of `fixture` into the Database `db-id`, returning a map of table name to its Table
  with `:fields` attached (in fixture order). The fixture's `:fk` references, `\"table.field\"`, become
  `fk_target_field_id`s."
  [db-id {:keys [schema tables]}]
  (let [table-rows (into {}
                         (for [{table-name :name} tables]
                           [table-name (t2/insert-returning-instance! :model/Table
                                                                      {:db_id        db-id
                                                                       :schema       schema
                                                                       :name         table-name
                                                                       :display_name table-name
                                                                       :active       true})]))
        field-rows (into {}
                         (for [{table-name :name, fields :fields} tables
                               [position {field-name :name, :as field}] (map-indexed vector fields)]
                           [(str table-name "." field-name)
                            (t2/insert-returning-instance! :model/Field
                                                           {:table_id       (:id (table-rows table-name))
                                                            :name           field-name
                                                            :display_name   field-name
                                                            :base_type      (:base_type field)
                                                            :database_type  (name (:base_type field))
                                                            :semantic_type  (field-semantic-type field)
                                                            :database_is_pk (boolean (:pk field))
                                                            :position       position})]))
        field-rows (reduce (fn [rows {table-name :name, fields :fields}]
                             (reduce (fn [rows {field-name :name, fk :fk}]
                                       (if-not fk
                                         rows
                                         (let [k         (str table-name "." field-name)
                                               target-id (:id (or (rows fk)
                                                                  (throw (ex-info (str "Unknown FK target " fk)
                                                                                  {:field k}))))]
                                           (t2/update! :model/Field :id (:id (rows k)) {:fk_target_field_id target-id})
                                           (assoc rows k (t2/select-one :model/Field :id (:id (rows k)))))))
                                     rows
                                     fields))
                           field-rows
                           tables)]
    (into {}
          (for [{table-name :name, fields :fields} tables]
            [table-name (assoc (table-rows table-name)
                               :fields (mapv #(field-rows (str table-name "." (:name %))) fields))]))))
