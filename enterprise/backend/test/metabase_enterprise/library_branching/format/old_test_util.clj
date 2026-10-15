(ns metabase-enterprise.library-branching.format.old-test-util
  "A model of the files that remote sync writes (the old format): for the items of a snapshot, the documents that the
  serdes export of master gives, with the keys that the old format has and the new format drops (bookkeeping,
  instance-local and derived values)."
  (:require
   [clojure.string :as str]
   [metabase-enterprise.library-branching.format.writer :as writer]
   [metabase-enterprise.library-branching.snapshot :as snapshot]
   [metabase.util :as u]))

(set! *warn-on-reflection* true)

(def ^:private created-at "2024-08-28T09:46:18.671622Z")

(defn- slug
  [s]
  (str/replace (u/lower-case-en s) #"[^a-z0-9]+" "_"))

(defn- container
  "The collection id of the old format for `place`: nil for an area root, as master writes an item at the root level
  of its namespace."
  [place]
  (when-not (contains? snapshot/area-roots place)
    place))

(defn collection-doc
  "The old document of collection `id`."
  [id {:keys [name place attrs]}]
  (merge {:name             name
          :entity_id        id
          :slug             (slug name)
          :created_at       created-at
          :archived         false
          :is_remote_synced true
          :parent_id        (container place)
          :serdes/meta      [{:model "Collection"}]}
         (select-keys attrs [:description :type :namespace :authority_level])))

(defn metric-doc
  "The old document of metric `id`: a card of type metric."
  [id {:keys [name place attrs]}]
  (merge {:name                   name
          :entity_id              id
          :type                   "metric"
          :created_at             created-at
          :creator_id             "rasta@metabase.com"
          :archived               false
          :collection_id          place
          :collection_preview     true
          :parameters             []
          :parameter_mappings     []
          :dataset_query          (:query attrs)
          :visualization_settings (merge {:column_settings nil} (:visualization_settings attrs))
          :card_schema            24
          :query_type             "query"
          :database_id            "Sample Database"
          :enable_embedding       false
          :public_uuid            nil
          :result_metadata        nil
          :serdes/meta            [{:model "Card"}]}
         (dissoc attrs :query :visualization_settings)))

(defn snippet-doc
  "The old document of snippet `id`."
  [id {:keys [name place attrs]}]
  (merge {:name          name
          :entity_id     id
          :created_at    created-at
          :creator_id    "crowberto@metabase.com"
          :archived      false
          :collection_id (container place)
          :template_tags (:template_tags attrs)
          :serdes/meta   [{:model "NativeQuerySnippet"}]}
         (select-keys attrs [:description :content])))

(defn glossary-doc
  "The old document of glossary term `id`."
  [id {:keys [name attrs]}]
  {:entity_id   id
   :term        name
   :definition  (:definition attrs)
   :created_at  created-at
   :creator_id  "crowberto@metabase.com"
   :serdes/meta [{:model "Glossary"}]})

(defn segment-doc
  "The old document of segment `id`: no table, which Metabase derives from the definition."
  [id {:keys [name attrs]}]
  (merge {:name        name
          :entity_id   id
          :created_at  created-at
          :creator_id  "crowberto@metabase.com"
          :archived    false
          :serdes/meta [{:model "Segment"}]}
         attrs))

(defn measure-doc
  "The old document of measure `id`: no table, which Metabase derives from the definition."
  [id {:keys [name attrs]}]
  (merge {:name        name
          :entity_id   id
          :created_at  created-at
          :creator_id  "crowberto@metabase.com"
          :archived    false
          :serdes/meta [{:model "Measure"}]}
         attrs))

(def ^:private table-flags
  {:description        :description_set
   :caveats            :caveats_set
   :points_of_interest :points_of_interest_set
   :data_layer         :data_layer_set
   :data_source        :data_source_set})

(def ^:private field-flags
  {:description   :description_set
   :semantic_type :semantic_type_set
   :fk_target     :fk_target_field_id_set})

(defn- flags
  [flag-of values]
  (into {} (keep (fn [[k flag]] (when (contains? values k) [flag true]))) flag-of))

(defn table-settings-doc
  "The old document of the settings row of published table `id`: a TableUserSettings file. The display name is set."
  [id {:keys [name place attrs]}]
  (let [values (dissoc attrs :fields)]
    (merge {:table_id      id
            :collection_id place
            :is_published  true
            :display_name  name
            :created_at    created-at
            :serdes/meta   [{:model "TableUserSettings"}]}
           values
           (flags table-flags values))))

(defn flat-fields
  "`{field-key settings}` of the `:fields` attribute `fields` of the table with key `table-key`: the settings of each
  entry that has any, without its nested entries."
  [table-key fields]
  (into {}
        (mapcat (fn [[k entry]]
                  (let [field-key (conj table-key (subs (str k) 1))
                        settings  (dissoc entry :fields)]
                    (cond-> (flat-fields field-key (:fields entry))
                      (seq settings) (conj [field-key settings])))))
        fields))

(defn field-settings-doc
  "The old document of the settings row of the field with natural key `field-key`: a FieldUserSettings file."
  [field-key settings]
  (merge {:field_id    field-key
          :created_at  created-at
          :serdes/meta [{:model "FieldUserSettings"}]}
         (dissoc settings :fk_target :remapping)
         (when-let [target (:fk_target settings)]
           {:fk_target_field_id target})
         (flags field-flags settings)))

(defn dimension-doc
  "The old document of the remapping `remapping` of the field with natural key `field-key`: a Dimension file. The old
  format has no values of an internal remapping."
  [field-key {:keys [type name field]}]
  {:name                    name
   :type                    type
   :entity_id               "DimensionXXXXXXXXXXXX"
   :field_id                field-key
   :human_readable_field_id field
   :created_at              created-at
   :serdes/meta             [{:model "Dimension"}]})

(defn docs
  "The old documents of snapshot `s`, one for each item, and one for each field settings row and each Dimension row of
  a published table."
  [s]
  (vec (mapcat (fn [[id {:keys [kind attrs] :as item}]]
                 (case kind
                   :collection      [(collection-doc id item)]
                   :metric          [(metric-doc id item)]
                   :snippet         [(snippet-doc id item)]
                   :glossary-term   [(glossary-doc id item)]
                   :segment         [(segment-doc id item)]
                   :measure         [(measure-doc id item)]
                   :published-table (cons (table-settings-doc id item)
                                          (for [[field-key settings] (sort-by (comp pr-str key)
                                                                              (flat-fields id (:fields attrs)))
                                                doc                  [(when (seq (dissoc settings :remapping))
                                                                        (field-settings-doc field-key settings))
                                                                      (when-let [r (:remapping settings)]
                                                                        (dimension-doc field-key r))]
                                                :when                doc]
                                            doc))))
               (sort-by (comp pr-str key) s))))

(defn bytes-of
  "The bytes of the old document `doc`."
  ^bytes [doc]
  (writer/write-yaml doc))

(defn files
  "The bytes of the old documents of snapshot `s` ([[docs]])."
  [s]
  (mapv bytes-of (docs s)))
