(ns metabase-enterprise.representations.v0.model
  (:require
   [clojure.string :as str]
   [metabase-enterprise.representations.export :as export]
   [metabase-enterprise.representations.import :as import]
   [metabase-enterprise.representations.v0.common :as v0-common]
   [metabase-enterprise.representations.v0.mbql :as v0-mbql]
   [metabase.api.common :as api]
   [metabase.config.core :as config]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [metabase.util.malli.registry :as mr]
   [toucan2.core :as t2]))

(defmethod import/type->schema :v0/model [_]
  ::model)

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
   [:visibility_type {:optional true} [:maybe :string]]
   [:fk_target_field_id {:optional true} [:maybe :int]]
   [:currency {:optional true} ::currency]
   [:settings {:optional true} [:maybe ::column-settings]]])

(mr/def ::column-settings
  [:map
   {:description "User-editable column settings for formatting and display"}
   [:column_title {:optional true} [:maybe :string]]
   [:text_align {:optional true} [:maybe [:enum "left" "right" "middle"]]]
   [:text_wrapping {:optional true} [:maybe :boolean]]
   [:view_as {:optional true} [:maybe [:enum "link" "email_link" "image" "auto"]]]
   [:link_text {:optional true} [:maybe :string]]
   [:link_url {:optional true} [:maybe :string]]
   [:show_mini_bar {:optional true} [:maybe :boolean]]
   [:number_style {:optional true} [:maybe [:enum "decimal" "percent" "scientific" "currency"]]]
   [:currency {:optional true} [:maybe :string]]
   [:currency_style {:optional true} [:maybe :string]]
   [:date_style {:optional true} [:maybe :string]]
   [:date_separator {:optional true} [:maybe [:enum "/" "-" "."]]]
   [:date_abbreviate {:optional true} [:maybe :boolean]]
   [:time_enabled {:optional true} [:maybe [:enum "minutes" "seconds" "milliseconds"]]]
   [:time_style {:optional true} [:maybe :string]]])

(mr/def ::columns
  [:sequential
   {:description "Array of column metadata definitions"}
   ::column])

;;; ------------------------------------ Main Schema Definitions ------------------------------------

(mr/def ::type
  [:enum {:decode/json keyword
          :description "Type must be 'model' or 'v0/model'"}
   :model :v0/model "model" "v0/model"])

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
  [:or
   {:description "MBQL query - either embedded map or ref to MBQL data"}
   ::lib.schema.common/non-blank-string
   :map])

(mr/def ::database
  [:or
   {:description "Database reference: integer ID, name string, or ref string"}
   :int
   ::lib.schema.common/non-blank-string])

(mr/def ::collection
  [:and
   {:description "Optional collection path for organizing the model"}
   any?])

;;; ------------------------------------ Main Model Schema ------------------------------------

(mr/def ::model
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

;;; ------------------------------------ Public API ------------------------------------

(defn- merge-column
  "Merge user-edited fields from a column representation into base column metadata.
   User edits take precedence for display_name, description, semantic_type, visibility_type, and fk_target_field_id.
   Settings are merged with user settings taking precedence."
  [base-col user-col]
  (-> base-col
      (merge (select-keys user-col [:display_name :description :semantic_type
                                    :visibility_type :fk_target_field_id]))
      (update :settings #(merge % (:settings user-col)))))

(defn- merge-column-metadata
  "Merge user-edited column metadata from model.yml into base metadata from mbql.yml.
   User edits take precedence. Returns the base metadata with user edits applied."
  [base-metadata user-columns]
  (if (empty? user-columns)
    base-metadata
    (let [user-by-name (into {} (map (juxt :name identity)) user-columns)]
      (mapv (fn [base-col]
              (if-let [user-col (get user-by-name (:name base-col))]
                (merge-column base-col user-col)
                base-col))
            base-metadata))))

(defmethod import/yaml->toucan :v0/model
  [{model-name :name
    :keys [_type _ref description database collection columns mbql_query] :as representation}
   ref-index]
  (let [database-id (v0-common/resolve-database-id database ref-index)
        dataset-query (-> (assoc representation :database database-id)
                          (v0-mbql/import-dataset-query ref-index))
        base-result-metadata (if (and (string? mbql_query) (v0-common/ref? mbql_query))
                               (let [mbql-data (get ref-index (v0-common/unref mbql_query))]
                                 (:result_metadata mbql-data))
                               nil)
        result-metadata (if base-result-metadata
                          (merge-column-metadata base-result-metadata columns)
                          columns)]
    (merge
     {:name model-name
      :description (or description "")
      :display :table
      :dataset_query dataset-query
      :visualization_settings {}
      :database_id database-id
      :query_type (if (= (:type dataset-query) "native") :native :query)
      :type :model}
     (when result-metadata
       {:result_metadata result-metadata})
     (when-let [coll-id (v0-common/find-collection-id collection)]
       {:collection_id coll-id}))))

(defmethod import/persist! :v0/model
  [representation ref-index]
  (let [model-data (import/yaml->toucan representation ref-index)
        entity-id (v0-common/generate-entity-id representation)
        existing (when entity-id
                   (t2/select-one :model/Card :entity_id entity-id))]
    (if existing
      (do
        (log/info "Updating existing model" (:name model-data) "with ref" (:ref representation))
        (t2/update! :model/Card (:id existing) (dissoc model-data :entity_id))
        (t2/select-one :model/Card :id (:id existing)))
      (do
        (log/info "Creating new model" (:name model-data))
        (let [model-data-with-creator (-> model-data
                                          (assoc :creator_id (or api/*current-user-id*
                                                                 config/internal-mb-user-id))
                                          (assoc :entity_id entity-id))]
          (first (t2/insert-returning-instances! :model/Card model-data-with-creator)))))))

;;; -- Export --

(defn- extract-user-editable-settings
  "Extract user-editable settings from a column's settings map.
   Returns only the fields that users should be able to edit in YAML."
  [settings]
  (when settings
    (not-empty
     (select-keys settings
                  [:column_title :text_align :text_wrapping :view_as :link_text :link_url
                   :show_mini_bar :number_style :currency :currency_style
                   :date_style :date_separator :date_abbreviate :time_enabled :time_style]))))

(defn- extract-user-editable-column-metadata
  "Extract user-editable metadata from a result_metadata column entry.
   Returns a map with :name and user-editable fields only."
  [column]
  (let [base {:name (:name column)}
        editable (not-empty
                  (select-keys column [:display_name :description :semantic_type
                                       :visibility_type :fk_target_field_id]))
        settings (extract-user-editable-settings (:settings column))]
    (cond-> base
      editable (merge editable)
      settings (assoc :settings settings))))

(defn- patch-refs-for-export [query]
  (-> query
      (v0-mbql/->ref-database)
      (v0-mbql/->ref-source-table)
      (v0-mbql/->ref-fields)))

(defmethod export/export-entity :model [card]
  (let [query (if export/*use-refs*
                (patch-refs-for-export (:dataset_query card))
                (:dataset_query card))
        card-ref (v0-common/unref (v0-common/->ref (:id card) :model))
        mbql-ref (str "mbql-" card-ref)
        columns (when-let [result-metadata (:result_metadata card)]
                  (seq (mapv extract-user-editable-column-metadata result-metadata)))]
    (cond-> {:name (:name card)
             :type (:type card)
             :ref card-ref
             :description (:description card)}

      (= :native (:type query))
      (assoc :query (-> query :native :query)
             :database (:database query))

      (= :query (:type query))
      (assoc :mbql_query (str "ref:" mbql-ref)
             :database (:database query))

      columns
      (assoc :columns columns)

      :always
      u/remove-nils)))

(defmethod export/export-mbql-data :model
  [card]
  (let [query (if export/*use-refs*
                (patch-refs-for-export (:dataset_query card))
                (:dataset_query card))]
    (when (= :query (:type query))
      (let [card-ref (v0-common/unref (v0-common/->ref (:id card) :model))
            mbql-ref (str "mbql-" card-ref)]
        (v0-mbql/create-mbql-data mbql-ref (:query query) (:result_metadata card))))))
