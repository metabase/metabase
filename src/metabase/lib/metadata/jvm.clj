(ns metabase.lib.metadata.jvm
  "Implementation(s) of [[metabase.lib.metadata.protocols/MetadataProvider]] only for the JVM."
  (:require
   [clojure.string :as str]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.metadata.cached-provider :as lib.metadata.cached-provider]
   [metabase.lib.metadata.protocols :as lib.metadata.protocols]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.models.interface :as mi]
   [metabase.models.setting :as setting]
   [metabase.plugins.classloader :as classloader]
   [metabase.util :as u]
   [metabase.util.malli :as mu]
   [metabase.util.snake-hating-map :as u.snake-hating-map]
   [methodical.core :as methodical]
   [potemkin :as p]
   [pretty.core :as pretty]
   #_{:clj-kondo/ignore [:discouraged-namespace]}
   [toucan2.core :as t2]
   [toucan2.model :as t2.model]
   [toucan2.pipeline :as t2.pipeline]
   [toucan2.query :as t2.query]))

(set! *warn-on-reflection* true)

(defn- qualified-key? [k]
  (or (qualified-keyword? k)
      (str/includes? k ".")))

(def ^:private ^{:arglists '([k])} memoized-kebab-key
  "Calculating the kebab-case version of a key every time is pretty slow (even with the LRU
  caching [[u/->kebab-case-en]] has), since the keys here are static and finite we can just memoize them forever and
  get a nice performance boost."
  ;; we spent a lot of time messing around with different ways of doing this and this seems to be the fastest. See
  ;; https://metaboat.slack.com/archives/C04CYTEL9N2/p1702671632956539 -- Cam
  (let [cache      (java.util.concurrent.ConcurrentHashMap.)
        mapping-fn (reify java.util.function.Function
                     (apply [_this k]
                       (u/->kebab-case-en k)))]
    (fn [k]
      (.computeIfAbsent cache k mapping-fn))))

(defn instance->metadata
  "Convert a (presumably) Toucan 2 instance of an application database model with `snake_case` keys to a MLv2 style
  metadata instance with `:lib/type` and `kebab-case` keys."
  [instance metadata-type]
  (-> instance
      (update-keys memoized-kebab-key)
      (assoc :lib/type metadata-type)
      u.snake-hating-map/snake-hating-map))

;;;
;;; Database
;;;

(derive :metadata/database :model/Database)

(methodical/defmethod t2.model/resolve-model :metadata/database
  [model]
  (classloader/require 'metabase.models.database)
  model)

(methodical/defmethod t2.pipeline/build [#_query-type     :toucan.query-type/select.*
                                         #_model          :metadata/database
                                         #_resolved-query clojure.lang.IPersistentMap]
  [query-type model parsed-args honeysql]
  (merge (next-method query-type model parsed-args honeysql)
         {:select [:id :engine :name :dbms_version :settings :is_audit :details :timezone]}))

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
  (classloader/require 'metabase.models.table)
  model)

(methodical/defmethod t2.pipeline/build [#_query-type     :toucan.query-type/select.*
                                         #_model          :metadata/table
                                         #_resolved-query clojure.lang.IPersistentMap]
  [query-type model parsed-args honeysql]
  (merge (next-method query-type model parsed-args honeysql)
         {:select [:id :db_id :name :display_name :schema :active :visibility_type]}))

(t2/define-after-select :metadata/table
  [table]
  (instance->metadata table :metadata/table))

;;;
;;; Field
;;;

(derive :metadata/column :model/Field)

(methodical/defmethod t2.model/resolve-model :metadata/column
  [model]
  (classloader/require 'metabase.models.dimension
                       'metabase.models.field
                       'metabase.models.field-values
                       'metabase.models.table)
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
   {:select    [:field/base_type
                :field/coercion_strategy
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
  (classloader/require 'metabase.models.card
                       'metabase.models.persisted-info)
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
                :card/database_id
                :card/dataset_query
                :card/id
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

(derive :metadata/metric :model/LegacyMetric)

(methodical/defmethod t2.model/resolve-model :metadata/metric
  [model]
  (classloader/require 'metabase.models.metric)
  model)

(methodical/defmethod t2.query/apply-kv-arg [#_model          :metadata/metric
                                             #_resolved-query clojure.lang.IPersistentMap
                                             #_k              :default]
  [model honeysql k v]
  (let [k (if (not (qualified-key? k))
            (keyword "metric" (name k))
            k)]
    (next-method model honeysql k v)))

(methodical/defmethod t2.pipeline/build [#_query-type     :toucan.query-type/select.*
                                         #_model          :metadata/metric
                                         #_resolved-query clojure.lang.IPersistentMap]
  [query-type model parsed-args honeysql]
  (merge
   (next-method query-type model parsed-args honeysql)
   {:select    [:metric/id
                :metric/table_id
                :metric/name
                :metric/description
                :metric/archived
                :metric/definition]
    :from      [[(t2/table-name :model/LegacyMetric) :metric]]
    :left-join [[(t2/table-name :model/Table) :table]
                [:= :metric/table_id :table/id]]}))

(t2/define-after-select :metadata/metric
  [metric]
  (instance->metadata metric :metadata/metric))

;;;
;;; Segment
;;;

(derive :metadata/segment :model/Segment)

(methodical/defmethod t2.model/resolve-model :metadata/segment
  [model]
  (classloader/require 'metabase.models.segment
                       'metabase.models.table)
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
;;; MetadataProvider
;;;

(p/deftype+ UncachedApplicationDatabaseMetadataProvider [database-id]
  lib.metadata.protocols/MetadataProvider
  (database [_this]
    (when-not database-id
      (throw (ex-info (format "Cannot use %s with %s with a nil Database ID"
                              `lib.metadata.protocols/database
                              `UncachedApplicationDatabaseMetadataProvider)
                      {})))
    (t2/select-one :metadata/database database-id))

  (table   [_this table-id]   (t2/select-one :metadata/table   :id table-id   :db_id       database-id))
  (field   [_this field-id]   (t2/select-one :metadata/column  :id field-id   :table/db_id database-id))
  (card    [_this card-id]    (t2/select-one :metadata/card    :id card-id    :database_id database-id))
  (metric  [_this metric-id]  (t2/select-one :metadata/metric  :id metric-id  :table/db_id database-id))
  (segment [_this segment-id] (t2/select-one :metadata/segment :id segment-id :table/db_id database-id))

  (tables [_this]
    (t2/select :metadata/table
               :db_id           database-id
               :active          true
               :visibility_type [:not-in #{"hidden" "technical" "cruft"}]))

  (fields [_this table-id]
    (t2/select :metadata/column
               :table_id        table-id
               :active          true
               :visibility_type [:not-in #{"sensitive" "retired"}]))

  (metrics [_this table-id]
    (t2/select :metadata/metric :table_id table-id, :archived false))

  (segments [_this table-id]
    (t2/select :metadata/segment :table_id table-id, :archived false))

  (setting [_this setting-name]
    (setting/get setting-name))

  lib.metadata.protocols/BulkMetadataProvider
  (bulk-metadata [_this metadata-type ids]
    (let [database-id-key (case metadata-type
                            :metadata/table :db_id
                            :metadata/card  :database_id
                            :table/db_id)]
      (when (seq ids)
        (t2/select metadata-type
                   database-id-key database-id
                   :id             [:in (set ids)]))))

  pretty/PrettyPrintable
  (pretty [_this]
    (list `->UncachedApplicationDatabaseMetadataProvider database-id))

  Object
  (equals [_this another]
    (and (instance? UncachedApplicationDatabaseMetadataProvider another)
         (= database-id (.database-id ^UncachedApplicationDatabaseMetadataProvider another)))))

(mu/defn application-database-metadata-provider :- lib.metadata/MetadataProvider
  "An implementation of [[metabase.lib.metadata.protocols/MetadataProvider]] for the application database.

  The application database metadata provider implements both of the optional
  protocols, [[metabase.lib.metadata.protocols/CachedMetadataProvider]]
  and [[metabase.lib.metadata.protocols/BulkMetadataProvider]]. All operations are cached; so you can use the bulk
  operations to pre-warm the cache if you need to."
  [database-id :- ::lib.schema.id/database]
  (lib.metadata.cached-provider/cached-metadata-provider
   (->UncachedApplicationDatabaseMetadataProvider database-id)))
