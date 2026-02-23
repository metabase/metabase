(ns metabase-enterprise.dependencies.metadata-provider
  "A `MetadataProvider` wrapper that understands how to update entities, and to lazily compute the new metadata for
  updated entities on demand. This is useful when analyzing a tree of dependents, which might depend on each other in
  complex ways.

  Just to illustrate, imagine I change a card A which is used by a transform B whose output table C is used by a card
  D. If I remove a column from card A, and transform B selects all columns, that field needs to disappear from C
  before we can correctly analyze card D.

  By representing the updated entities as lazy `delay`s, this `MetadataProvider` can support analysis of the
  downstream entities in any order."
  (:require
   [medley.core :as m]
   [metabase-enterprise.dependencies.analysis :as deps.analysis]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.metadata.protocols :as lib.metadata.protocols]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [pretty.core :as pretty]))

(set! *warn-on-reflection* true)

(defn- metadatas [delegate overrides {metadata-type :lib/type
                                      search-name :name
                                      :keys [id card-id table-id]
                                      :as metadata-spec}]
  (let [type-overrides  (get overrides metadata-type)
        metadata-keys   (set (or id search-name))]
    (log/tracef "OverridingMetadataProvider request for %s" metadata-spec)
    (cond
      ;; For tables, cards, snippets, transforms, and columns, return overrides if present and looking for specific
      ;; keys and delegate if not.
      (and (#{:metadata/table :metadata/card :metadata/transform :metadata/native-query-snippet :metadata/column} metadata-type)
           (seq metadata-keys))
      (let [overrides       (if (seq id)
                              (select-keys type-overrides id)

                              (into {} (keep #(when-let [x (deref %)]
                                                (when (search-name (:name x))
                                                  [(:name x) %])))
                                    (vals type-overrides)))
            override-key    (if (seq id) :id :name)
            overridden-keys (set (keys overrides))
            missing-keys    (remove overridden-keys metadata-keys)]
        (log/tracef "Overridden keys %s; missing keys %s" (sort overridden-keys) (sort missing-keys))
        (cond-> (map deref (vals overrides))
          (seq missing-keys)
          (concat (lib.metadata.protocols/metadatas delegate {:lib/type    metadata-type
                                                              override-key (set missing-keys)}))))

      ;; if fetching all tables or transforms, get every override and everything from the delegate and then dedupe
      (and (empty? metadata-keys)
           (#{:metadata/table :metadata/transform} metadata-type))
      (as-> (vals type-overrides) entities
        (into [] (map force) entities)
        (into entities (lib.metadata.protocols/metadatas delegate metadata-spec))
        (m/distinct-by :id entities))

      ;; For columns, return overrides if they're present.
      (= metadata-type :metadata/column)
      (if-let [overridden-columns (cond
                                    card-id  (get-in overrides [::card-columns  card-id])
                                    table-id (get-in overrides [::table-columns table-id]))]
        @overridden-columns
        (lib.metadata.protocols/metadatas delegate metadata-spec))

      :else (throw (ex-info "Unknown :lib/metadata type for OverridingMetadataProvider" metadata-spec)))))

(declare all-overrides setup-transform! setup-transforms!)

(deftype OverridingMetadataProvider [delegate *overrides returned-columns-fn]
  lib.metadata.protocols/MetadataProvider
  (database [_this] (lib.metadata.protocols/database delegate))
  (metadatas [this metadata-spec]
    (setup-transforms! this)
    (metadatas delegate @*overrides metadata-spec))
  (setting [_this setting-key]
    (lib.metadata.protocols/setting delegate setting-key))

  ;; Cached things are direct delegation.
  lib.metadata.protocols/CachedMetadataProvider
  (cached-metadatas [_this metadata-type metadata-ids]
    (lib.metadata.protocols/cached-metadatas delegate metadata-type metadata-ids))
  (store-metadata! [_this a-metadata]
    (lib.metadata.protocols/store-metadata! delegate a-metadata))
  (cached-value [_this k not-found]
    (lib.metadata.protocols/cached-value delegate k not-found))
  (cache-value! [_this k v]
    (lib.metadata.protocols/cache-value! delegate k v))
  (has-cache? [_this]
    (lib.metadata.protocols/has-cache? delegate))
  (clear-cache! [_this]
    (lib.metadata.protocols/clear-cache! delegate))

  pretty/PrettyPrintable
  (pretty [this]
    (list `overriding-metadata-provider (all-overrides this) delegate)))

(defmulti add-override
  "Given an `OverridingMetadataProvider`, an `entity-type` and that entity, add this entity as an override."
  {:arglists '([metadata-provider entity-type id updates-or-nil])}
  (fn [_mp entity-type _id _updates]
    entity-type))

(defn- inner-mp [^OverridingMetadataProvider mp]
  (.delegate mp))

(defn- with-overrides [^OverridingMetadataProvider mp kvs]
  (swap! (.*overrides mp)
         #(reduce (fn [m [ks v]]
                    (assoc-in m ks v))
                  % kvs)))

(defn- returned-columns [^OverridingMetadataProvider mp queryable]
  (let [returned-columns-fn (.returned-columns-fn mp)]
    (or (and returned-columns-fn (returned-columns-fn mp queryable))
        (deps.analysis/returned-columns (:engine (lib.metadata/database mp))
                                        (lib/query mp queryable)))))

(defmethod add-override :card [^OverridingMetadataProvider mp _entity-type id updates]
  (with-overrides mp
    ;; If the `updates` contain `:result-metadata`, we want to use that. Similarly, if the user provides a way to
    ;; calculate `result-metadata`, we should use that function.  However, any `:result-metadata` from the inner-mp
    ;; should be ignored.
    {[:metadata/card id] (delay (let [temp (merge (when id
                                                    (-> (inner-mp mp)
                                                        (lib.metadata/card id)))
                                                  updates)
                                      result-metadata (or (:result-metadata updates)
                                                          (and (.returned-columns-fn mp)
                                                               (returned-columns mp temp)))]
                                  (assoc temp :result-metadata result-metadata)))
     ;; This uses the outer OMP and so the overrides are visible!
     [::card-columns id] (delay (returned-columns mp (lib.metadata/card mp id)))}))

(defonce ^:private last-fake-id (atom 2000000000))

(defn- fake-id []
  (swap! last-fake-id inc))

(defn- setup-transform!
  [^OverridingMetadataProvider mp s+n->table {:keys [source target] :as _transform}]
  ;; See if the output table exists in the underlying MetadataProvider.
  ;; - If the table doesn't exist, invent an ID for it.
  ;; - Always add an override for the table, even if it already existed.
  ;; - Compare the transform's output columns to the fields that exist in the metadata.
  ;;   - For any newly added fields, invent an ID and add an override for the field.
  ;;   - For any removed fields that used to exist, add an override for their ID that is nil!
  ;;   - Add an internal [::table-columns table-id] with the list of output columns.
  ;; Note that this assumes that all other overrides are already loaded!
  (let [existing-table (get s+n->table [(:schema target) (:name target)])
        output-table   (or existing-table
                           (merge (select-keys target [:schema :name])
                                  {:lib/type        :metadata/table
                                   :id              (fake-id)
                                   :db-id           (:id (lib.metadata/database (inner-mp mp)))
                                   :display-name    (:name target)
                                   :visibility-type nil}))
        existing-cols  (when existing-table
                         (lib/returned-columns (lib/query (inner-mp mp) existing-table)))
        output-cols    (delay
                         ;; Note that this will analyze the query with any upstream changes included!
                         (let [new-cols (returned-columns mp (:query source))
                               by-name  (m/index-by :lib/desired-column-alias existing-cols)]
                           (into [] (for [col new-cols
                                          :let [old-col (by-name (:lib/desired-column-alias col))]]
                                      (merge (select-keys col [:display-name
                                                               :base-type :effective-type :semantic-type])
                                             {:name     (:lib/desired-column-alias col)
                                              :lib/type :metadata/column
                                              :id       (or (:id old-col) (fake-id))
                                              :table-id (:id output-table)
                                              :active   true})))))
        outputs-by-id   (delay (m/index-by :id @output-cols))]
    ;; NOTE: Any newly added output columns can't be looked up directly by ID, with this version.
    ;; The `output-cols` code above can be adapted to add them to the `*overrides` atom, but YAGNI for now.
    (with-overrides mp
      (into {[:metadata/table (:id output-table)] (delay output-table)
             [::table-columns (:id output-table)] output-cols}
            ;; For each pre-existing output column, we need to add an override for a direct read by ID.
            ;; If the column does not exist in the output, return the original with :active false
            (map (fn [existing-col]
                   [[:metadata/column (:id existing-col)]
                    (delay (or (get @outputs-by-id (:id existing-col))
                               (assoc existing-col :active false)))]))
            existing-cols))))

(defn- setup-transforms! [^OverridingMetadataProvider mp]
  (locking mp
    (when-not (-> (.*overrides mp) deref ::setup-complete)
      (swap! (.*overrides mp) assoc ::setup-complete true)
      (let [;; Fetching all the pre-existing tables.
            ;; TODO: Once Cam's new by-name logic in the `MetadataProvider` lands, we can use that here.
            tables     (lib.metadata/tables (inner-mp mp))
            s+n->table (m/index-by (juxt :schema :name) tables)]
        (doseq [transform (-> (.*overrides mp) deref :metadata/transform vals)]
          (setup-transform! mp s+n->table (deref transform)))))))

(defmethod add-override :transform [^OverridingMetadataProvider mp _entity-type id updates]
  ;; Transforms are complicated:
  ;; 1. Treated as a card on the input side.
  ;; 2. The returned-columns of that card become the columns of the output table.
  ;; 3. The output table is constructed from the transform.
  ;; 4. Its fields are adapted from the transform's input card.
  ;; All of these can be wrapped in delays and therefore computed lazily on demand.
  ;;
  ;; The trouble is that a transform does not know the output table's ID, nor its field IDs.
  ;; A modified transform might produce a new table, or have new fields or removed fields.
  ;; The OverridingMetadataProvider has to account for all of this when it returns tables or fields by ID, or gets
  ;; the column list for a table.
  ;;
  ;; This is achieved by putting `[:metadata/transform id]` into overrides for all transforms, and then one-time
  ;; logic that runs before the first use of the OverridingMetadataProvider as a MetadataProvider will walk all the
  ;; transforms and make sure their tables etc. are overridden properly.
  (let [transform (merge (when id
                           (lib.metadata/transform (inner-mp mp) id))
                         updates)]
    (with-overrides mp
      {;; The transform itself, merged with the incoming updates.
       [:metadata/transform id] (delay transform)
       #_#_[::transform-columns id] (delay (->> (lib.metadata/transform mp id)
                                                :source
                                                :query
                                                (lib/query mp)
                                                lib/returned-columns))})))

(defmethod add-override :table [^OverridingMetadataProvider mp _entity-type id updates]
  (when (seq updates)
    (throw (ex-info "Updating a table directly is not supported" {:table-id id, :edited updates})))
  (with-overrides mp
    {[:metadata/table id] (delay (log/warnf "Can't happen: Table %d dep should be replaced by its transform" id)
                                 (lib.metadata/table (inner-mp mp) id))
     [::table-columns id] (delay
                            (log/warnf "Can't happen: Table %d ::table-columns should be replaced by its transform" id)
                            (lib.metadata/fields (inner-mp mp) id))}))

(defmethod add-override :snippet [^OverridingMetadataProvider mp _entity-type id updates]
  (with-overrides mp
    {[:metadata/native-query-snippet id] (delay (merge (when id
                                                         (lib.metadata/native-query-snippet (inner-mp mp) id))
                                                       (u/normalize-map updates)))}))

(defmethod add-override :dashboard [^OverridingMetadataProvider mp _entity-type _id _updates]
  mp)

(defmethod add-override :document [^OverridingMetadataProvider mp _entity-type _id _updates]
  mp)

(defmethod add-override :sandbox [^OverridingMetadataProvider mp _entity-type _id _updates]
  mp)

(defmethod add-override :segment [^OverridingMetadataProvider mp _entity-type id updates]
  {[:metadata/segment id] (delay (merge (when id
                                          (lib.metadata/segment (inner-mp mp) id))
                                        updates))})

(defn all-overrides
  "Returns all the overrides by ID, in the same form as the map input to [[with-deps]]:
  `{:card [1 2 3], :transform [45 99]}."
  [^OverridingMetadataProvider override-metadata-provider]
  (-> (.*overrides override-metadata-provider)
      deref
      (dissoc ::setup-complete)
      (update-vals keys)
      (update-keys {:metadata/card                 :card
                    :metadata/transform            :transform
                    :metadata/native-query-snippet :snippet})
      (select-keys [:card :transform :snippet])))

(defn override-metadata-provider
  "Given an underlying `MetadataProvider`, wraps it to support in-memory overrides of cards, fields, etc.

  Important note: all overrides must be added first, before this is used as a `MetadataProvider`.  The easiest way to
  do that is to pass in updated entities and/or dependent ids, which will be immediately added as overrides."
  [{:keys [base-provider updated-entities dependent-ids returned-columns-fn]}]
  (let [^OverridingMetadataProvider omp (->OverridingMetadataProvider base-provider
                                                                      (atom {})
                                                                      returned-columns-fn)]
    (doseq [[entity-type updates] updated-entities
            updated-entity        updates]
      (add-override omp entity-type (:id updated-entity) updated-entity))
    (doseq [[entity-type dependents] dependent-ids
            :let  [updated (into #{} (map :id) (get updated-entities entity-type))]
            id    dependents
            :when (not (updated id))]
      (add-override omp entity-type id nil))
    omp))
