(ns metabase.lib-be.metadata.jvm
  "Implementation(s) of [[metabase.lib.metadata.protocols/MetadataProvider]] only for the JVM."
  (:refer-clojure :exclude [get-in])
  (:require
   [clojure.core.cache :as cache]
   [clojure.core.cache.wrapped :as cache.wrapped]
   [clojure.string :as str]
   [honey.sql.helpers :as sql.helpers]
   [metabase.lib.metadata.cached-provider :as lib.metadata.cached-provider]
   [metabase.lib.metadata.invocation-tracker :as lib.metadata.invocation-tracker]
   [metabase.lib.metadata.protocols :as lib.metadata.protocols]
   [metabase.lib.normalize :as lib.normalize]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.lib.schema.metadata :as lib.schema.metadata]
   [metabase.models.interface :as mi]
   [metabase.settings.core :as setting]
   [metabase.util :as u]
   [metabase.util.json :as json]
   [metabase.util.malli :as mu]
   [metabase.util.memoize :as u.memo]
   [metabase.util.performance :as perf :refer [get-in]]
   [metabase.util.snake-hating-map :as u.snake-hating-map]
   [methodical.core :as methodical]
   [potemkin :as p]
   [pretty.core :as pretty]
   [toucan2.core :as t2]
   [toucan2.model :as t2.model]
   [toucan2.pipeline :as t2.pipeline]
   [toucan2.query :as t2.query]))

(set! *warn-on-reflection* true)

(defn- qualified-key? [k]
  (or (qualified-keyword? k)
      (str/includes? k ".")))

;;; TODO (Cam 8/8/25) -- this is duplicated with [[metabase.lib.schema.common/memoized-kebab-key]]... should we use that
;;; here too? Or is it better if this keeps its own cache, which presumably has a smaller set of keys to deal with?
(def ^{:private true
       :arglists '([k])} memoized-kebab-key
  "Calculating the kebab-case version of a key every time is pretty slow (even with the LRU caching
  [[u/->kebab-case-en]] has), since the keys here are static and finite we can just memoize them forever and
  get a nice performance boost."
  (u.memo/fast-memo u/->kebab-case-en))

(def ^:private metadata-type->schema
  {:metadata/card ::lib.schema.metadata/card})

(mu/defn instance->metadata
  "Convert a (presumably) Toucan 2 instance of an application database model with `snake_case` keys to a MLv2 style
  metadata instance with `:lib/type` and `kebab-case` keys."
  [instance      :- :map
   metadata-type :- :keyword]
  (let [normalize (if-let [schema (get metadata-type->schema metadata-type)]
                    (fn [instance]
                      (lib.normalize/normalize schema instance))
                    identity)]
    (-> instance
        (perf/update-keys memoized-kebab-key)
        (assoc :lib/type metadata-type)
        normalize
        u.snake-hating-map/snake-hating-map
        (vary-meta assoc :metabase/toucan-instance instance))))

;;;
;;; Database
;;;

(derive :metadata/database :model/Database)

(methodical/defmethod t2.model/resolve-model :metadata/database
  [model]
  (t2/resolve-model :model/Database) ; for side-effects
  model)

(methodical/defmethod t2.pipeline/build [#_query-type     :toucan.query-type/select.*
                                         #_model          :metadata/database
                                         #_resolved-query clojure.lang.IPersistentMap]
  [query-type model parsed-args honeysql]
  (merge (next-method query-type model parsed-args honeysql)
         {:select [:id :engine :name :dbms_version :settings :is_audit :details :timezone :router_database_id]}))

(t2/define-after-select :metadata/database
  [database]
  ;; ignore encrypted details that we cannot decrypt, because that breaks schema
  ;; validation
  (let [database (instance->metadata database :metadata/database)]
    (cond-> database
      (not (map? (:details database))) (dissoc :details))))

;;;
;;; Table
;;;

(derive :metadata/table :model/Table)

(methodical/defmethod t2.model/resolve-model :metadata/table
  [model]
  (t2/resolve-model :model/Table)
  model)

(methodical/defmethod t2.pipeline/build [#_query-type     :toucan.query-type/select.*
                                         #_model          :metadata/table
                                         #_resolved-query clojure.lang.IPersistentMap]
  [query-type model parsed-args honeysql]
  (merge (next-method query-type model parsed-args honeysql)
         {:select [:id :db_id :name :display_name :schema :active :visibility_type :database_require_filter]}))

(t2/define-after-select :metadata/table
  [table]
  (instance->metadata table :metadata/table))

;;;
;;; Field
;;;

(derive :metadata/column :model/Field)

(methodical/defmethod t2.model/resolve-model :metadata/column
  [model]
  (t2/resolve-model :model/Dimension) ; for side-effects
  (t2/resolve-model :model/Field)
  (t2/resolve-model :model/FieldValues)
  (t2/resolve-model :model/Table)
  model)

(methodical/defmethod t2.model/model->namespace :metadata/column
  ":metadata/column joins Dimension and FieldValues by default; namespace their columns so we can distinguish them from
  the columns coming back from Field."
  [_model]
  {:model/Dimension   "dimension"
   :model/FieldValues "values"})

(methodical/defmethod t2.query/apply-kv-arg [#_model          :metadata/column
                                             #_resolved-query clojure.lang.IPersistentMap
                                             #_k              :default]
  "Qualify unqualified kv-args when fetching a `:metadata/column`."
  [model honeysql k v]
  (let [k (if (not (qualified-key? k))
            (keyword "field" (name k))
            k)]
    (next-method model honeysql k v)))

(methodical/defmethod t2.pipeline/build [#_query-type     :toucan.query-type/select.*
                                         #_model          :metadata/column
                                         #_resolved-query clojure.lang.IPersistentMap]
  [query-type model parsed-args honeysql]
  (merge
   (next-method query-type model parsed-args honeysql)
   {:select    [:field/active
                :field/base_type
                :field/coercion_strategy
                :field/database_partitioned
                :field/database_type
                :field/description
                :field/display_name
                :field/effective_type
                :field/fingerprint
                :field/fk_target_field_id
                :field/id
                :field/name
                :field/nfc_path
                :field/parent_id
                :field/position
                :field/semantic_type
                :field/settings
                :field/table_id
                :field/visibility_type
                :dimension/human_readable_field_id
                :dimension/id
                :dimension/name
                :dimension/type
                :values/human_readable_values
                :values/values]
    :from      [[(t2/table-name :model/Field) :field]]
    :left-join [[(t2/table-name :model/Table) :table]
                [:= :field/table_id :table/id]
                [(t2/table-name :model/Dimension) :dimension]
                [:and
                 [:= :dimension/field_id :field/id]
                 [:inline [:in :dimension/type ["external" "internal"]]]]
                [(t2/table-name :model/FieldValues) :values]
                [:and
                 [:= :values/field_id :field/id]
                 [:= :values/type [:inline "full"]]]]}))

(t2/define-after-select :metadata/column
  [field]
  (let [field          (instance->metadata field :metadata/column)
        dimension-type (some-> (:dimension/type field) keyword)]
    (merge
     (dissoc field
             :table
             :dimension/human-readable-field-id :dimension/id :dimension/name :dimension/type
             :values/human-readable-values :values/values)
     (when (and (= dimension-type :external)
                (:dimension/human-readable-field-id field))
       {:lib/external-remap {:lib/type :metadata.column.remapping/external
                             :id       (:dimension/id field)
                             :name     (:dimension/name field)
                             :field-id (:dimension/human-readable-field-id field)}})
     (when (and (= dimension-type :internal)
                (:values/values field)
                (:values/human-readable-values field))
       {:lib/internal-remap {:lib/type              :metadata.column.remapping/internal
                             :id                    (:dimension/id field)
                             :name                  (:dimension/name field)
                             :values                (mi/json-out-with-keywordization
                                                     (:values/values field))
                             :human-readable-values (mi/json-out-without-keywordization
                                                     (:values/human-readable-values field))}}))))

;;;
;;; Card
;;;

(derive :metadata/card :model/Card)

(methodical/defmethod t2.model/resolve-model :metadata/card
  [model]
  (t2/resolve-model :model/Card)
  (t2/resolve-model :model/PersistedInfo)
  model)

(methodical/defmethod t2.model/model->namespace :metadata/card
  [_model]
  {:model/PersistedInfo "persisted"})

(methodical/defmethod t2.query/apply-kv-arg [#_model          :metadata/card
                                             #_resolved-query clojure.lang.IPersistentMap
                                             #_k              :default]
  [model honeysql k v]
  ()
  (let [k (if (not (qualified-key? k))
            (keyword "card" (name k))
            k)]
    (next-method model honeysql k v)))

(methodical/defmethod t2.pipeline/build [#_query-type     :toucan.query-type/select.*
                                         #_model          :metadata/card
                                         #_resolved-query clojure.lang.IPersistentMap]
  [query-type model parsed-args honeysql]
  (merge
   (next-method query-type model parsed-args honeysql)
   {:select    [:card/collection_id
                :card/created_at   ; Needed for backfilling :entity_id on demand; see [[metabase.queries.models.card]].
                :card/card_schema  ; Needed for after-select logic to work.
                :card/database_id
                :card/dataset_query
                :card/id
                :card/entity_id
                :card/name
                :card/result_metadata
                :card/table_id
                :card/type
                :card/visualization_settings
                :persisted/active
                :persisted/state
                :persisted/definition
                :persisted/query_hash
                :persisted/table_name]
    :from      [[(t2/table-name :model/Card) :card]]
    :left-join [[(t2/table-name :model/PersistedInfo) :persisted]
                [:= :persisted/card_id :card/id]]}))

(defn- parse-persisted-info-definition [x]
  ((get-in (t2/transforms :model/PersistedInfo) [:definition :out] identity) x))

(t2/define-after-select :metadata/card
  [card]
  (let [card (instance->metadata card :metadata/card)]
    (merge
     (dissoc card :persisted/active :persisted/state :persisted/definition :persisted/query-hash :persisted/table-name)
     (when (:persisted/definition card)
       {:lib/persisted-info {:active     (:persisted/active card)
                             :state      (:persisted/state card)
                             :definition (parse-persisted-info-definition (:persisted/definition card))
                             :query-hash (:persisted/query-hash card)
                             :table-name (:persisted/table-name card)}}))))

;;;
;;; Metric
;;;

(derive :metadata/metric :model/Card)

(t2/define-after-select :metadata/metric
  [metric]
  (instance->metadata metric :metadata/metric))

;;;
;;; Segment
;;;

(derive :metadata/segment :model/Segment)

(methodical/defmethod t2.model/resolve-model :metadata/segment
  [model]
  (t2.model/resolve-model :model/Segment)
  (t2.model/resolve-model :model/Table)
  model)

(methodical/defmethod t2.query/apply-kv-arg [#_model          :metadata/segment
                                             #_resolved-query clojure.lang.IPersistentMap
                                             #_k              :default]
  [model honeysql k v]
  (let [k (if (not (qualified-key? k))
            (keyword "segment" (name k))
            k)]
    (next-method model honeysql k v)))

(methodical/defmethod t2.pipeline/build [#_query-type     :toucan.query-type/select.*
                                         #_model          :metadata/segment
                                         #_resolved-query clojure.lang.IPersistentMap]
  [query-type model parsed-args honeysql]
  (merge
   (next-method query-type model parsed-args honeysql)
   {:select    [:segment/id
                :segment/table_id
                :segment/name
                :segment/description
                :segment/archived
                :segment/definition]
    :from      [[(t2/table-name :model/Segment) :segment]]
    :left-join [[(t2/table-name :model/Table) :table]
                [:= :segment/table_id :table/id]]}))

(t2/define-after-select :metadata/segment
  [segment]
  (instance->metadata segment :metadata/segment))

;;;
;;; Native Query Snippet
;;;

(derive :metadata/native-query-snippet :model/NativeQuerySnippet)

(methodical/defmethod t2.model/resolve-model :metadata/native-query-snippet
  [model]
  (t2/resolve-model :model/NativeQuerySnippet) ; for side-effects
  model)

(methodical/defmethod t2.pipeline/build [#_query-type     :toucan.query-type/select.*
                                         #_model          :metadata/native-query-snippet
                                         #_resolved-query clojure.lang.IPersistentMap]
  [query-type model parsed-args honeysql]
  (merge (next-method query-type model parsed-args honeysql)
         {:select [:id :name :description :content :archived :collection_id :template_tags]}))

(t2/define-after-select :metadata/native-query-snippet
  [snippet]
  (instance->metadata snippet :metadata/native-query-snippet))

;;;
;;; Transforms
;;;

(derive :metadata/transform :model/Transform)

(methodical/defmethod t2.model/resolve-model :metadata/transform
  [model]
  (t2/resolve-model :model/Transform) ; for side-effects
  model)

(methodical/defmethod t2.pipeline/build [#_query-type     :toucan.query-type/select.*
                                         #_model          :metadata/transform
                                         #_resolved-query clojure.lang.IPersistentMap]
  [query-type model parsed-args honeysql]
  (merge (next-method query-type model parsed-args honeysql)
         {:select [:id :name :source :target]}))

(t2/define-after-select :metadata/transform
  [snippet]
  (instance->metadata snippet :metadata/transform))

;;;
;;; MetadataProvider
;;;

(defn- database [database-id]
  (when-not database-id
    (throw (ex-info (format "Cannot use %s with %s with a nil Database ID"
                            `lib.metadata.protocols/database
                            `UncachedApplicationDatabaseMetadataProvider)
                    {})))
  (t2/select-one :metadata/database database-id))

(defn- db-id-key [metadata-type]
  (case metadata-type
    :metadata/table                :db_id
    :metadata/column               :table/db_id
    :metadata/card                 :card/database_id
    :metadata/metric               :database_id
    :metadata/segment              :table/db_id
    :metadata/native-query-snippet nil
    :metadata/transform            nil))

(defn- id-key [metadata-type]
  (case metadata-type
    :metadata/table                :id
    :metadata/column               :field/id
    :metadata/card                 :card/id
    :metadata/metric               :id
    :metadata/segment              :segment/id
    :metadata/native-query-snippet :id
    :metadata/transform            :id))

(defn- name-key [metadata-type]
  (case metadata-type
    :metadata/table                :name
    :metadata/column               :field/name
    :metadata/card                 :card/name
    :metadata/metric               :name
    :metadata/segment              :segment/name
    :metadata/native-query-snippet :name
    :metadata/transform            :name))

(defn- table-id-key [metadata-type]
  ;; types not in the case statement do not support Table ID
  (case metadata-type
    :metadata/column  :field/table_id
    :metadata/metric  :table_id
    :metadata/segment :segment/table_id))

(defn- card-id-key [metadata-type]
    ;; types not in the case statement do not support Card ID
  (case metadata-type
    :metadata/metric :source_card_id))

(defn- active-only-honeysql-filter [metadata-type {:keys [include-sensitive?]}]
  (case metadata-type
    :metadata/table
    [:and
     [:= :active true]
     [:or
      [:= :visibility_type nil]
      [:not-in :visibility_type [:inline ["hidden" "technical" "cruft"]]]]]

    :metadata/column
    (let [excluded-visibility-types (cond-> ["retired"]
                                      (not include-sensitive?) (conj "sensitive"))]
      [:and
       [:= :field/active true]
       [:or
        [:= :field/visibility_type nil]
        [:not-in :field/visibility_type [:inline excluded-visibility-types]]]])

    :metadata/card
    [:= :card/archived false]

    :metadata/metric
    [:= :archived false]

    :metadata/segment
    [:= :segment/archived false]

    #_else
    nil))

(mu/defn- metadata-spec->honey-sql :- [:map
                                       {:closed true}
                                       [:where {:optional true} vector?]]
  "This should match [[metabase.lib.metadata.protocols/default-spec-filter-xform]] as closely as possible."
  [database-id                                                                                                            :- ::lib.schema.id/database
   {metadata-type :lib/type, id-set :id, name-set :name, :keys [table-id card-id include-sensitive?], :as _metadata-spec} :- ::lib.metadata.protocols/metadata-spec]
  (let [database-id-key (db-id-key metadata-type)
        active-only?    (not (or id-set name-set))
        metric?         (= metadata-type :metadata/metric)
        where-clauses   (cond-> []
                          database-id-key        (conj [:= database-id-key database-id])
                          id-set                 (conj [:in (id-key metadata-type) id-set])
                          name-set               (conj [:in (name-key metadata-type) name-set])
                          table-id               (conj [:= (table-id-key metadata-type) table-id])
                          card-id                (conj [:= (card-id-key metadata-type) card-id])
                          active-only?           (conj (active-only-honeysql-filter metadata-type {:include-sensitive? include-sensitive?}))
                          metric?                (conj [:= :type [:inline "metric"]])
                          (and metric? table-id) (conj [:= :source_card_id nil]))]
    (reduce
     sql.helpers/where
     {}
     where-clauses)))

(mu/defn- metadatas
  [database-id                                  :- ::lib.schema.id/database
   {metadata-type :lib/type, :as metadata-spec} :- ::lib.metadata.protocols/metadata-spec]
  (let [query (metadata-spec->honey-sql database-id metadata-spec)]
    (try
      (t2/select metadata-type query)
      (catch Throwable e
        (throw (ex-info "Error fetching metadata with spec"
                        {:metadata-spec metadata-spec, :query query}
                        e))))))

(p/deftype+ UncachedApplicationDatabaseMetadataProvider [database-id]
  lib.metadata.protocols/MetadataProvider
  (database [_this]
    (database database-id))
  (metadatas [_this metadata-spec]
    (metadatas database-id metadata-spec))
  (setting [_this setting-name]
    (setting/get setting-name))

  pretty/PrettyPrintable
  (pretty [_this]
    (list `->UncachedApplicationDatabaseMetadataProvider database-id))

  Object
  (equals [_this another]
    (and (instance? UncachedApplicationDatabaseMetadataProvider another)
         (= database-id (.database-id ^UncachedApplicationDatabaseMetadataProvider another)))))

(defn- application-database-metadata-provider-factory
  "Inner function that constructs a new `MetadataProvider`.
  I couldn't resist the Java naming, `foo-provider-factory-strategy-bean`.

  Call [[application-database-metadata-provider]] instead, which wraps this inner function with optional, dynamically
  scoped caching, to allow reuse of `MetadataProvider`s across the life of an API request."
  [database-id]
  (-> (->UncachedApplicationDatabaseMetadataProvider database-id)
      lib.metadata.cached-provider/cached-metadata-provider
      lib.metadata.invocation-tracker/invocation-tracker-provider))

(def ^:dynamic *metadata-provider-cache*
  "Bind this to a `(atom (clojure.core.cache/basic-cache-factory {}))` or similar cache-atom, and
  [[application-database-metadata-provider]] will use it for caching the `MetadataProvider` for each `database-id`
  over the lifespan of this binding.

  This is useful for an API request, or group for API requests like a dashboard load, to reduce appdb traffic."
  nil)

(defn metadata-provider-cache
  "The currently bound [[*metadata-provider-cache*]], for Potemkin-export friendliness."
  []
  *metadata-provider-cache*)

(defmacro with-metadata-provider-cache
  "Wrapper to create a [[*metadata-provider-cache*]] for the duration of the `body`.

  If there is already a [[*metadata-provider-cache*]], this leaves it in place.

  Note that the metadata provider cache is initialized automatically in a REST API request context by
  the [[metabase.server.middleware.metadata-provider-cache]] middleware; if writing a REST API endpoint you do not
  need to manually initialize one."
  [& body]
  `(binding [*metadata-provider-cache* (or *metadata-provider-cache*
                                           (atom (cache/basic-cache-factory {})))]
     ~@body))

(defmacro with-existing-metadata-provider-cache
  "Wrapper to bind [[*metadata-provider-cache*]] to an existing cache, if you are doing something weird."
  [metadata-provider-cache & body]
  `(binding [*metadata-provider-cache* ~metadata-provider-cache]
     ~@body))

(mu/defn application-database-metadata-provider :- ::lib.schema.metadata/metadata-provider
  "An implementation of [[metabase.lib.metadata.protocols/MetadataProvider]] for the application database.

  Supports caching over a dynamic scope (eg. an API request or group of API requests like a dashboard load) via
  [[*metadata-provider-cache*]]. Outside such a scope, this creates a new `MetadataProvider` for each call.

  On the returned `MetadataProvider`, all operations are cached. You can use the bulk operations to pre-warm the cache
  if you need to."
  [database-id :- ::lib.schema.id/database]
  (if-let [cache-atom *metadata-provider-cache*]
    (cache.wrapped/lookup-or-miss cache-atom database-id application-database-metadata-provider-factory)
    (application-database-metadata-provider-factory database-id)))

;;; do not encode MetadataProviders to JSON, just generate `nil` instead.
(json/add-encoder
 UncachedApplicationDatabaseMetadataProvider
 (fn [_mp json-generator]
   (json/generate-nil nil json-generator)))
