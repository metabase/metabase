(ns metabase-enterprise.representations.v0.metric
  (:require
   [clojure.string :as str]
   [metabase-enterprise.representations.export :as export]
   [metabase-enterprise.representations.import :as import]
   [metabase-enterprise.representations.v0.common :as v0-common]
   [metabase-enterprise.representations.v0.mbql :as v0-mbql]
   [metabase.api.common :as api]
   [metabase.config.core :as config]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.models.serialization :as serdes]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [metabase.util.malli.registry :as mr]
   [toucan2.core :as t2]))

(defmethod import/type->schema :v0/metric [_]
  ::metric)

;;; ----------------------------- Column Schema Definitions -----------------------------

(mr/def ::column-name
  [:and
   {:description "Column name as returned by the query"}
   ::lib.schema.common/non-blank-string])

(mr/def ::display-name
  [:and
   {:description "Human-friendly display name for the column"}
   ::lib.schema.common/non-blank-string])

(mr/def ::column-description
  [:and
   {:description "Documentation explaining the column's meaning"}
   [:or
    :nil
    :string]])

(defn- normalize-type-string
  "Convert type strings to internal keyword format.
   Expects strings like 'type/Text' or 'type/PK' and converts to :type/Text, :type/PK.
   Also handles already-keywordized values."
  [type-str]
  (when type-str
    (cond
      ;; Already a keyword, return as-is
      (keyword? type-str) type-str

      ;; String in format "type/Foo" or ":type/Foo"
      (string? type-str)
      (let [trimmed (str/trim type-str)]
        (cond
          ;; Handle ":type/Foo" format
          (str/starts-with? trimmed ":")
          (keyword (subs trimmed 1))

          ;; Handle "type/Foo" format - most common case
          (str/includes? trimmed "/")
          (keyword trimmed)

          ;; Fallback: treat as "type/X" if no slash present
          ;; This handles cases like just "Text" -> :type/Text
          :else
          (keyword "type" trimmed)))

      ;; Unknown type, return nil
      :else nil)))

(mr/def ::base-type
  [:and
   {:description "The actual data type of the column (e.g., Text, Integer, DateTime)"
    :decode/json normalize-type-string}
   [:or
    :string
    :keyword]
   [:fn
    {:error/message "Must be a valid base type (not a semantic type)"
     :error/fn (fn [{:keys [value]} _]
                 (str "Not a valid base type: " (pr-str value)))}
    (fn [x]
      (let [type-kw (if (keyword? x) x (normalize-type-string x))]
        (and type-kw
             (isa? type-kw :type/*))))]])

(mr/def ::effective-type
  [:and
   {:description "How Metabase should treat this column (can override base_type)"
    :decode/json normalize-type-string}
   [:or
    :string
    :keyword]
   [:fn
    {:error/message "Must be a valid effective type"
     :error/fn (fn [{:keys [value]} _]
                 (str "Not a valid effective type: " (pr-str value)))}
    (fn [x]
      (let [type-kw (if (keyword? x) x (normalize-type-string x))]
        (and type-kw
             ;; Effective type can be a base type OR a semantic type
             (isa? type-kw :type/*))))]])

(mr/def ::semantic-type
  [:and
   {:description "Semantic meaning of the column (e.g., Email, Currency, Entity Key)"
    :decode/json normalize-type-string}
   [:or
    :string
    :keyword]
   [:fn
    {:error/message "Must be a valid semantic type"
     :error/fn (fn [{:keys [value]} _]
                 (let [normalized (normalize-type-string value)]
                   (str "Not a recognized semantic type: " (pr-str value)
                        ". Got: " normalized
                        " which is not a :Semantic/* or :Relation/* type.")))}
    (fn [x]
      (let [type-kw (if (keyword? x) x (normalize-type-string x))]
        (when type-kw
          (or (isa? type-kw :Semantic/*)
              (isa? type-kw :Relation/*)))))]])

(mr/def ::visibility
  [:enum
   {:description "Column visibility setting"}
   "normal" "sensitive" "retired" "hidden"])

(mr/def ::currency
  [:and
   {:description "Currency code for financial columns (e.g., USD, EUR)"}
   ::lib.schema.common/non-blank-string])

(mr/def ::column
  [:map
   {:description "Column metadata definition"}
   [:name ::column-name]
   [:display_name {:optional true} ::display-name]
   [:description {:optional true} ::column-description]
   [:base_type {:optional true} ::base-type]
   [:effective_type {:optional true} ::effective-type]
   [:semantic_type {:optional true} ::semantic-type]
   [:visibility {:optional true} ::visibility]
   [:currency {:optional true} ::currency]])

(mr/def ::columns
  [:sequential
   {:description "Array of column metadata definitions"}
   ::column])

;;; ------------------------------------ Main Schema Definitions ------------------------------------

(mr/def ::type
  [:enum {:decode/json keyword
          :description "Type must be 'metric' or 'v0/metric'"}
   :metric :v0/metric "metric" "v0/metric"])

(mr/def ::ref
  [:and
   {:description "Unique reference identifier for the model, used for cross-references"}
   ::lib.schema.common/non-blank-string
   [:re #"^[a-z0-9][a-z0-9-_]*$"]])

(mr/def ::name
  [:and
   {:description "Human-readable name for the model"}
   ::lib.schema.common/non-blank-string])

(mr/def ::description
  [:and
   {:description "Documentation explaining what the model represents"}
   [:or :nil :string]])

(mr/def ::query
  [:and
   {:description "Native SQL query that defines the model's data"}
   ::lib.schema.common/non-blank-string])

(mr/def ::mbql-query
  [:and
   {:description "MBQL (Metabase Query Language) query that defines the model's data"}
   any?])

(mr/def ::database
  [:and
   {:description "Name or ref of the database to run the query against"}
   ::lib.schema.common/non-blank-string])

(mr/def ::collection
  [:and
   {:description "Optional collection path for organizing the model"}
   any?])

;;; ------------------------------------ Main Model Schema ------------------------------------

(mr/def ::metric
  [:and
   [:map
    {:description "v0 schema for human-writable model representation"}
    [:type ::type]
    [:ref ::ref]
    [:name {:optional true} ::name]
    [:description {:optional true} ::description]
    [:database ::database]
    [:query {:optional true} ::query]
    [:mbql_query {:optional true} ::mbql-query]
    [:columns {:optional true} ::columns]
    [:collection {:optional true} ::collection]]
   [:fn {:error/message "Must have exactly one of :query or :mbql_query"}
    (fn [{:keys [query mbql_query]}]
      (= 1 (count (filter some? [query mbql_query]))))]])

;;; ------------------------------------ INGESTION ------------------------------------

;;; ---------------------------- Column Metadata Processing -----------------------------

(defn- normalize-type-name
  "Convert type strings to internal keyword format.
   Expects strings like 'type/Text' or 'type/PK' and converts to :type/Text, :type/PK.
   Also handles already-keywordized values."
  [type-str]
  (when type-str
    (keyword (str/trim type-str))))

(defn- process-column-metadata
  "Process column definitions from the representation into result_metadata format."
  [columns]
  (when (seq columns)
    (mapv (fn [col]
            (let [;; Extract all the fields
                  {:keys [name display_name description base_type effective_type
                          semantic_type visibility currency
                          ;; New fields from enriched metadata
                          database_type table_id active id position
                          source source_alias field_ref
                          fingerprint visibility_type
                          unit inherited_temporal_unit]
                   ;; Handle lib/* namespaced keys separately
                   :as col-map} col
                  ;; Extract lib/* keys and convert string values to keywords where appropriate
                  lib-keys (into {}
                                 (map (fn [[k v]]
                                        [k (if (and (string? v)
                                                    (or (str/starts-with? v "source/")
                                                        (str/starts-with? v "type/")))
                                             (keyword v)
                                             v)])
                                      (filter (fn [[k _]]
                                                (and (keyword? k)
                                                     (= "lib" (namespace k))))
                                              col-map)))
                  ;; Also handle qp/* keys
                  qp-keys (into {}
                                (filter (fn [[k _]]
                                          (and (keyword? k)
                                               (= "qp" (namespace k))))
                                        col-map))
                  ;; Normalize types
                  normalized-base (normalize-type-name base_type)
                  normalized-eff (normalize-type-name effective_type)
                  normalized-sem (normalize-type-name semantic_type)
                  ;; For field_ref, we need a valid base type (not semantic/relation type)
                  ;; Check if it's actually a base type using isa?
                  valid-base-type? (fn [t]
                                     (and t
                                          (isa? t :type/*)
                                          (not (isa? t :Semantic/*))
                                          (not (isa? t :Relation/*))))
                  field-base-type (cond
                                    (valid-base-type? normalized-base) normalized-base
                                    (valid-base-type? normalized-eff) normalized-eff
                                    :else :type/Text) ; Default fallback
                  ;; Process provided field_ref, converting strings to keywords in the options map
                  process-field-ref (fn [ref]
                                      (when ref
                                        (if (and (vector? ref) (= 3 (count ref)))
                                          (let [[tag id-or-name opts] ref]
                                            [tag id-or-name
                                             (if (map? opts)
                                               (into {} (map (fn [[k v]]
                                                               [k (if (and (string? v)
                                                                           (str/starts-with? v "type/"))
                                                                    (keyword v)
                                                                    v)])
                                                             opts))
                                               opts)])
                                          ref)))
                  ;; Use provided field_ref or construct one
                  final-field-ref (or (process-field-ref field_ref)
                                      [:field name {:base-type field-base-type}])]
              (merge
               ;; Base required fields
               {:name name
                :display_name (or display_name name)
                :field_ref final-field-ref}
               ;; Optional fields
               (when description {:description description})
               (when normalized-base {:base_type normalized-base})
               (when normalized-eff {:effective_type normalized-eff})
               (when normalized-sem {:semantic_type normalized-sem})
               ;; Convert visibility_type to keyword
               (when (or visibility visibility_type)
                 {:visibility_type (keyword (or visibility_type visibility))})
               (when currency {:currency currency})
               ;; Additional metadata fields
               (when database_type {:database_type database_type})
               (when table_id {:table_id table_id})
               (when (some? active) {:active active})
               (when id {:id id})
               (when position {:position position})
               ;; Convert source to keyword
               (when source {:source (keyword source)})
               (when source_alias {:source_alias source_alias})
               (when fingerprint {:fingerprint fingerprint})
               ;; Convert unit to keyword
               (when unit {:unit (keyword unit)})
               ;; Convert inherited_temporal_unit to keyword
               (when inherited_temporal_unit {:inherited_temporal_unit (keyword inherited_temporal_unit)})
               ;; Add all lib/* namespaced keys (with converted values)
               lib-keys
               ;; Add all qp/* namespaced keys
               qp-keys)))
          columns)))

;;; ------------------------------------ Public API ------------------------------------

(defn yaml->toucan
  "Convert a validated v0 model representation into data suitable for creating/updating a Card (Model).

   Returns a map with keys matching the Card model fields.
   Does NOT insert into the database - just transforms the data.

   Key differences from questions:
   - :type is :model instead of :question
   - Includes result_metadata with column definitions
   - Display is typically :table since models represent structured data"
  [{model-name :name
    :keys [_type _ref description database collection columns] :as representation}
   ref-index]
  (let [database-id (v0-common/ref->id database ref-index)
        dataset-query (v0-mbql/import-dataset-query representation ref-index)]
    (when-not database-id
      (throw (ex-info (str "Database not found: " database)
                      {:database database})))
    (merge
     {;; Core fields
      :name model-name
      :description (or description "")
      :display :table ; Models are typically displayed as tables
      :dataset_query dataset-query
      :visualization_settings {}
      :database_id database-id
      :query_type (if (= (:type dataset-query) "native") :native :query)
      :type :model}
     ;; Result metadata with column definitions
     (when columns
       {:result_metadata (process-column-metadata columns)})
     ;; Optional collection
     (when-let [coll-id (v0-common/find-collection-id collection)]
       {:collection_id coll-id}))))

(defn persist!
  "Ingest a v0 metric representation and create or update a Card (Metric) in the database.

   Uses ref as a stable identifier for upserts.
   If a model with the same ref exists (via entity_id), it will be updated.
   Otherwise a new metric will be created.

   Returns the created/updated Card."
  [representation ref-index]
  (let [metric-data (yaml->toucan representation ref-index)
        ;; Generate stable entity_id from ref and collection
        entity-id (v0-common/generate-entity-id representation)
        existing (when entity-id
                   (t2/select-one :model/Card :entity_id entity-id))]
    (if existing
      (do
        (log/info "Updating existing metric" (:name metric-data) "with ref" (:ref representation))
        (t2/update! :model/Card (:id existing) (dissoc metric-data :entity_id))
        (t2/select-one :model/Card :id (:id existing)))
      (do
        (log/info "Creating new metric" (:name metric-data))
        (let [metric-data-with-creator (-> metric-data
                                           (assoc :creator_id (or api/*current-user-id*
                                                                  config/internal-mb-user-id))
                                           (assoc :entity_id entity-id))]
          (first (t2/insert-returning-instances! :model/Card metric-data-with-creator)))))))

;;; -- Export --

(defn ->ref
  "Make a ref"
  [card]
  (format "%s-%s" (name (:type card)) (:id card)))

(defn- source-table-ref [table]
  (cond
    (vector? table)
    (let [[db schema table] table]
      {:database db
       :schema schema
       :table table})

    (string? table)
    (let [referred-card (t2/select-one :model/Card :entity_id table)]
      (->ref referred-card))))

(defn- update-source-table [card]
  (if-some [_table (get-in card [:mbql_query :source-table])]
    (update-in card [:mbql_query :source-table] source-table-ref)
    card))

(defn- patch-refs [card]
  (-> card
      (update-source-table)))

(defmethod export/export-entity :metric [card]
  (let [query (serdes/export-mbql (:dataset_query card))]
    (cond-> {:name (:name card)
             ;;:version "question-v0"
             :type (name (:type card))
             :ref (->ref card)
             :description (:description card)}

      (= :native (:type query))
      (assoc :query (-> query :native :query)
             :database (:database query))

      (= :query (:type query))
      (assoc :mbql_query (:query query)
             :database (:database query))

      :always
      patch-refs

      :always
      u/remove-nils)))
