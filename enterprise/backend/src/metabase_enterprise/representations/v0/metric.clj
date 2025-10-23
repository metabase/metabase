(ns metabase-enterprise.representations.v0.metric
  (:require
   [clojure.string :as str]
   [metabase-enterprise.representations.export :as export]
   [metabase-enterprise.representations.import :as import]
   [metabase-enterprise.representations.v0.card]
   [metabase-enterprise.representations.v0.common :as v0-common]
   [metabase-enterprise.representations.v0.mbql :as v0-mbql]
   [metabase.api.common :as api]
   [metabase.config.core :as config]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [metabase.util.malli.registry :as mr]
   [toucan2.core :as t2]))

(defmethod import/type->schema [:v0 :metric] [_]
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
   :metric "metric"])

(mr/def ::version
  [:enum {:decode/json keyword
          :description "Version of this metric schema"}
   :v0])

(mr/def ::ref
  [:and
   {:description "Unique reference identifier for the metric, used for cross-references"}
   ::lib.schema.common/non-blank-string
   [:re #"^[a-z0-9][a-z0-9-_]*$"]])

(mr/def ::name
  [:and
   {:description "Human-readable name for the metric"}
   ::lib.schema.common/non-blank-string])

(mr/def ::description
  [:and
   {:description "Documentation explaining what the metric represents"}
   [:or :nil :string]])

(mr/def ::query
  [:and
   {:description "Native SQL query that defines the metric's data"}
   ::lib.schema.common/non-blank-string])

(mr/def ::mbql-query
  [:and
   {:description "MBQL (Metabase Query Language) query that defines the metric's data"}
   any?])

(mr/def ::database
  [:and
   {:description "Ref of the database to run the query against"}
   ::lib.schema.common/non-blank-string])

(mr/def ::collection
  [:and
   {:description "Optional collection path for organizing the metric"}
   any?])

;;; ------------------------------------ Main Metric Schema ------------------------------------

(mr/def ::metric
  [:and
   [:map
    {:description "v0 schema for human-writable metric representation"}
    [:type ::type]
    [:version ::version]
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

(defmethod v0-common/type->model :metric
  [_]
  :model/Card)

;;; ------------------------------------ INGESTION ------------------------------------

;;; ---------------------------- Column Metadata Processing -----------------------------

;;; ------------------------------------ Public API ------------------------------------

(defmethod import/yaml->toucan [:v0 :metric]
  [{metric-name :name
    :keys [description database collection columns] :as representation}
   ref-index]
  (let [database-id (-> ref-index
                        (v0-common/lookup-entity database)
                        (v0-common/ensure-not-nil)
                        (v0-common/ensure-correct-type :database)
                        :id)
        dataset-query (v0-mbql/import-dataset-query representation ref-index)]
    (-> {;; Core fields
         :name metric-name
         :description description
         :dataset_query dataset-query
         :database_id database-id
         :query_type (if (= (name (:type dataset-query)) "native") :native :query)
         :type :metric
         :result_metadata columns
         :collection_id (v0-common/find-collection-id collection)}
        u/remove-nils)))

(defmethod import/with-toucan-defaults [:v0 :metric]
  [toucan-entity]
  (merge-with #(or %1 %2)
              toucan-entity
              {:description ""
               :visualization_settings {}
               :display :table
               :creator_id (or api/*current-user-id* config/internal-mb-user-id)}))

(defmethod import/persist! [:v0 :metric]
  [representation ref-index]
  (let [metric-data (import/yaml->toucan representation ref-index)
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

(defmethod export/export-entity :metric [card]
  (-> {:name (:name card)
       :type (:type card)
       :version :v0
       :ref (v0-common/unref (v0-common/->ref (:id card) :metric))
       :description (:description card)
       :columns (:result_metadata card)}

      (merge (v0-mbql/export-dataset-query (:dataset_query card)))
      u/remove-nils))
