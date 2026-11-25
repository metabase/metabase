;; Copied for the structural metadata design check from branch prototype/semantic-layer-1-structure, commit
;; 3dc2ec9ad3b (PR #87236), file src/metabase/analyze/classifiers/field_signals.clj. Changes: namespace names,
;; and `analyze.schema/X` refs became registry keywords, since `metabase.analyze.schema` is not the module's API.
(ns metabase.warehouse-schema.structural-metadata.prototype-classifiers.field-signals
  "Column predicates and name patterns shared by the classifiers that read all of a Table's columns at once: the table
  role, the history binding, and the custom-property binding."
  (:refer-clojure :exclude [some])
  (:require
   [metabase.analyze.core]
   [metabase.util :as u]
   [metabase.util.performance :refer [some]]))

(defn- minimal-field
  "The keys of a Field these classifiers read, as hand-built maps (e.g. in tests) pass them."
  [id-properties]
  [:map {:closed true}
   [:id                 id-properties    pos-int?]
   [:name                                :string]
   [:base_type          {:optional true} [:maybe :keyword]]
   [:effective_type     {:optional true} [:maybe :keyword]]
   [:semantic_type      {:optional true} [:maybe :keyword]]
   [:database_is_pk     {:optional true} [:maybe :boolean]]
   [:fk_target_field_id {:optional true} [:maybe pos-int?]]])

(def Field
  "A Field as the table classifiers read it: a Field instance, or a map with its name, types and key markers."
  [:or [:ref :metabase.analyze.schema/Field] (minimal-field {:optional true})])

(def FieldWithId
  "A [[Field]] with its ID, for classifiers whose results point at fields."
  [:or [:ref :metabase.analyze.schema/Field] (minimal-field {})])

(def version-key-pattern
  "Name of a key column that numbers the versions of a row."
  #"(?:^|_)version$")

(def property-pattern
  "Name of the column in an entity–attribute–value table that says which property a row holds."
  #"(?:^|_)(?:property|attribute|key|field|name)(?:_name|_key|_id)?$")

(def value-pattern
  "Name of the column in an entity–attribute–value table that holds the property's value."
  #"(?:^|_)value$")

(def definition-label-patterns
  "Names of a field-definitions table's label column, most specific first."
  [#"^title$" #"^label$" #"^display_name$" #"^name$"])

(def definition-type-pattern
  "Name of a field-definitions table's data-type column."
  #"^(?:type|data_type|field_type|value_type)$")

(def ^:private valid-from-pattern
  #"(?:^|_)(?:valid_from|effective_from|effective_date|dbt_valid_from)$|^_fivetran_start$")

(def ^:private valid-to-pattern
  #"(?:^|_)(?:valid_to|effective_to|end_date|dbt_valid_to)$|^_fivetran_end$")

(defn field-name
  "The `field`'s name in lower case."
  [field]
  (u/lower-case-en (:name field)))

(defn named?
  "Whether the `field`'s lower-cased name contains a match for `pattern`."
  [pattern field]
  (boolean (re-find pattern (field-name field))))

(defn first-named
  "The first of `fields` whose name matches `pattern`."
  [pattern fields]
  (some #(when (named? pattern %) %) fields))

(defn first-named-by-priority
  "The first of `fields` whose name matches the first of `patterns` that any field matches."
  [patterns fields]
  (some #(first-named % fields) patterns))

(defn semantic-type-isa?
  "Whether the `field`'s semantic type is `ancestor` or derives from it."
  [field ancestor]
  (isa? (:semantic_type field) ancestor))

(defn data-type-isa?
  "Whether the `field`'s effective type, or its base type when it has none, is `ancestor` or derives from it."
  [field ancestor]
  (isa? (or (:effective_type field) (:base_type field)) ancestor))

(defn pk?
  "Whether the `field` is part of its table's primary key."
  [field]
  (boolean (or (:database_is_pk field) (semantic-type-isa? field :type/PK))))

(defn fk?
  "Whether the `field` is a foreign key."
  [field]
  (or (semantic-type-isa? field :type/FK) (some? (:fk_target_field_id field))))

(defn temporal?
  "Whether the `field` holds dates or times."
  [field]
  (data-type-isa? field :type/Temporal))

(defn valid-from?
  "Whether the `field` is the start of a row's validity interval, by its semantic type or its name."
  [field]
  (or (semantic-type-isa? field :type/ValidFrom) (named? valid-from-pattern field)))

(defn valid-to?
  "Whether the `field` is the end of a row's validity interval, by its semantic type or its name."
  [field]
  (or (semantic-type-isa? field :type/ValidTo) (named? valid-to-pattern field)))
