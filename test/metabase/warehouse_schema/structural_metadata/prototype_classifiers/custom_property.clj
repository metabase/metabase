;; Copied for the structural metadata design check from branch prototype/semantic-layer-1-structure, commit
;; 3dc2ec9ad3b (PR #87236), file src/metabase/analyze/classifiers/custom_property.clj. Changes: namespace names,
;; and `analyze.schema/X` refs became registry keywords, since `metabase.analyze.schema` is not the module's API.
(ns metabase.warehouse-schema.structural-metadata.prototype-classifiers.custom-property
  "Classifiers for the two ways a source stores customer-defined fields: as rows of an entity–attribute–value (EAV)
  table, usually next to a table of field definitions with labels and types, and as wildcard columns such as
  `custom_*` and `property_*` whose names the customer chose.

  Nothing calls these during sync and nothing stores their results yet: the next step is a nullable `eav_definition`
  JSON column on `metabase_table`, with a twin in `metabase_table_user_settings` so an admin's choice wins over sync."
  (:refer-clojure :exclude [some])
  (:require
   [clojure.string :as str]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli :as mu]
   [metabase.util.performance :refer [some]]
   [metabase.warehouse-schema.structural-metadata.prototype-classifiers.field-signals :as signals :refer [named? pk? fk?]]))

(def ^:private Table
  "A Table in the same schema as the one being classified. A Table instance needs its `:fields` hydrated for the
  classifiers that read them."
  [:or
   [:ref :metabase.analyze.schema/Table]
   [:map {:closed true}
    [:id                      pos-int?]
    [:name                    :string]
    [:fields {:optional true} [:maybe [:sequential signals/FieldWithId]]]]])

(def ^:private EavBinding
  "Field and table IDs that say how to pivot an EAV table; nil where no column or table fits."
  [:map {:closed true}
   [:entity_key_field     [:maybe pos-int?]]
   [:property_name_field  [:maybe pos-int?]]
   [:property_value_field [:maybe pos-int?]]
   [:definition_table_id  [:maybe pos-int?]]
   [:label_field          [:maybe pos-int?]]
   [:type_field           [:maybe pos-int?]]])

(def ^:private EavInference
  [:map {:closed true}
   [:binding    EavBinding]
   [:signal     :string]
   [:confidence [:enum :high :low]]])

(def ^:private CustomPropertyFacet
  [:map {:closed true}
   [:prefix :string]
   [:suffix :string]])

(def ^:private wildcard-pattern                #"^(custom|property)_(.+)$")
(def ^:private definition-sibling-suffix-pattern #"_(?:values?|history)$")
(def ^:private entity-id-pattern               #"_id$")

(mu/defn find-target-table :- [:maybe Table]
  "The one of `schema-tables` holding the field that `field` is a foreign key to; nil when `field` is nil, is not a
  foreign key, or points outside `schema-tables`."
  [field         :- [:maybe signals/Field]
   schema-tables :- [:sequential Table]]
  (when-let [target-field-id (:fk_target_field_id field)]
    (some (fn [table]
            (when (some #(= (:id %) target-field-id) (:fields table))
              table))
          schema-tables)))

(defn- definition-columns
  "The label and type columns of a table of field definitions."
  [fields]
  {:label-field (signals/first-named-by-priority signals/definition-label-patterns fields)
   :type-field  (signals/first-named signals/definition-type-pattern fields)})

(defn- sibling-definition-table
  "The table named like `table-name` without its `_values` or `_history` suffix, or without its `custom_` part:
  `custom_field` for `custom_field_value`, `ticket_field` for `ticket_custom_field`."
  [table-name schema-tables]
  (let [table-name    (u/lower-case-en table-name)
        base-name     (str/replace table-name definition-sibling-suffix-pattern "")
        sibling-names (hash-set base-name (str/replace base-name #"(^|_)custom_" "$1"))]
    (some (fn [table]
            (let [candidate (u/lower-case-en (:name table))]
              (when (and (not= candidate table-name)
                         (contains? sibling-names candidate))
                table)))
          schema-tables)))

(defn- row-columns
  "The entity key, property and value columns of an EAV table."
  [fields]
  (let [sole-pk  (let [pks (filter pk? fields)]
                   (when (= (count pks) 1) (first pks)))
        value    (signals/first-named signals/value-pattern fields)
        ;; a lone primary key named `key` or `name` makes a settings table, not a property column
        property (some #(when (and (not (identical? % sole-pk))
                                   (not (identical? % value))
                                   (named? signals/property-pattern %))
                          %)
                       fields)
        entity   (or (some #(when (and (fk? %) (not (identical? % property))) %) fields)
                     (some #(when (and (not (pk? %))
                                       (not (identical? % property))
                                       (named? entity-id-pattern %))
                              %)
                           fields))]
    {:entity entity, :property property, :value value}))

(mu/defn infer-custom-property-binding :- [:maybe EavInference]
  "Propose how to pivot the EAV Table named `table-name`, given its `fields`, its `role` (as inferred or set by an
  admin), and `schema-tables`, the other tables in its schema with their fields. Returns nil unless `role` is
  `:role/CustomPropertyTable`.

  The definition table is the one the property column is a foreign key to, else the sibling named like this table
  without its suffix. Returns the binding (each pointer nil when nothing fits), a one-line reason for an admin, and
  whether it is confident enough to apply without review: every row column and a definition table were found."
  [table-name    :- :string
   role          :- [:maybe :keyword]
   fields        :- [:sequential signals/FieldWithId]
   schema-tables :- [:sequential Table]]
  ;; `=`, not `isa?`: `:role/CustomPropertyTable` has no descendants (a test guards this)
  (when (= role :role/CustomPropertyTable)
    (let [{:keys [entity property value]} (row-columns fields)
          target-table     (find-target-table property schema-tables)
          definition-table (or target-table (sibling-definition-table table-name schema-tables))
          {:keys [label-field type-field]} (definition-columns (:fields definition-table))]
      {:binding    {:entity_key_field     (:id entity)
                    :property_name_field  (:id property)
                    :property_value_field (:id value)
                    :definition_table_id  (:id definition-table)
                    :label_field          (:id label-field)
                    :type_field           (:id type-field)}
       :signal     (cond
                     target-table     (tru "{0} links to {1}" (:name property) (:name definition-table))
                     definition-table (tru "{0} is named like {1} without its suffix" (:name definition-table) table-name)
                     :else            (tru "no table of field definitions was found"))
       :confidence (if (and entity property value definition-table) :high :low)})))

(mu/defn infer-custom-property-facet :- [:maybe CustomPropertyFacet]
  "The wildcard prefix and the customer-chosen rest of a column named like `custom_*` or `property_*`, e.g.
  `{:prefix \"property_\", :suffix \"amount\"}` for `property_amount`; nil for any other name."
  [field :- signals/Field]
  (when-let [[_ prefix suffix] (re-matches wildcard-pattern (u/lower-case-en (:name field)))]
    {:prefix (str prefix "_"), :suffix suffix}))

(mu/defn infer-wildcard-definition-table :- [:maybe Table]
  "The one of `schema-tables` that defines the wildcard columns of the Table named `table-name`: a table named
  `<table-name>_*` (singular) with label and type columns, e.g. `deal_property` for `deals`. Nil when none fits."
  [table-name    :- :string
   schema-tables :- [:sequential Table]]
  (let [prefix (str (str/replace (u/lower-case-en table-name) #"s$" "") "_")]
    (some (fn [table]
            (let [{:keys [label-field type-field]} (definition-columns (:fields table))]
              (when (and (str/starts-with? (u/lower-case-en (:name table)) prefix)
                         label-field
                         type-field)
                table)))
          schema-tables)))
