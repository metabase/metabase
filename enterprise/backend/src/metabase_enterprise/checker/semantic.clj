(ns metabase-enterprise.checker.semantic
  "Entity validation — the checker's main entry point.

   Creates a store (checker.store) from sources, wraps it in a MetadataProvider
   (checker.provider), then validates every entity:
   - Query validation via deps.analysis/check-entity (MBQL + native SQL)
   - Structural checks (collection_id, dashboard layout, document links)

   Public API:
   - `(check export-dir schema-dir)` — check all entities, returns results map
   - `(setup export-dir schema-dir)` + `(check-one ctx entity-id)` — REPL workflow"
  (:require
   [clojure.string :as str]
   [metabase-enterprise.checker.format.serdes :as serdes]
   [metabase-enterprise.checker.provider :as provider]
   [metabase-enterprise.checker.store :as store]
   [metabase-enterprise.dependencies.analysis :as deps.analysis]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.query-processor.interface :as qp.i]
   ;; sql-tools.init registers multimethod implementations needed by deps.native-validation
   [metabase.sql-tools.init]
   [metabase.util.malli.fn :as mu.fn]))

(set! *warn-on-reflection* true)

;;; ===========================================================================
;;; Reference resolution — resolve portable refs to IDs, collecting failures
;;;
;;; Resolution functions take the store and a `!failures` atom (or nil).
;;; When a ref can't be resolved, a failure map is conj'd onto the atom
;;; for the caller to inspect. The failure maps look like:
;;;   {:type :field :path ["DB" "schema" "table" "field"]}
;;;   {:type :table :path ["DB" "schema" "table"]}
;;;   {:type :database :name "DB"}
;;; ===========================================================================
;;; Entity loading by kind
;;; ===========================================================================

(def ^:private kind->load-fn
  {:dashboard  store/load-dashboard!
   :collection store/load-collection!
   :document   store/load-document!
   :transform  store/load-transform!
   :segment    store/load-segment!
   :measure    store/load-measure!
   :snippet    store/load-snippet!})

;;; ===========================================================================
;;; Common entity checks — apply to any entity type
;;;
;;; These validations run on every entity (cards, dashboards, collections,
;;; metrics, segments, etc.). Add new cross-entity checks here.
;;; ===========================================================================

(defn- validate-collection-id
  "Validate that `collection_id` in `data` points to a known collection.
   Returns a failure map or nil."
  [store data]
  (when-let [coll-id (:collection_id data)]
    (let [kind (store/index-kind-of store coll-id)]
      (cond
        (nil? kind)
        {:type :collection :entity-id coll-id
         :message (str "collection_id " coll-id " not found")}

        (not= :collection kind)
        {:type :collection :entity-id coll-id
         :message (str "collection_id " coll-id " points to a " (name kind) ", not a collection")}))))

(defn- validate-dashboard-id
  "Validate that `dashboard_id` in `data` points to a known dashboard.
   Returns a failure map or nil."
  [store data]
  (when-let [dash-id (:dashboard_id data)]
    (let [kind (store/index-kind-of store dash-id)]
      (cond
        (nil? kind)
        {:type :dashboard :entity-id dash-id
         :message (str "dashboard_id " dash-id " not found")}

        (not= :dashboard kind)
        {:type :dashboard :entity-id dash-id
         :message (str "dashboard_id " dash-id " points to a " (name kind) ", not a dashboard")}))))

(defn- validate-parent-id
  "Validate that `parent_id` on a collection points to a known collection.
   Returns a failure map or nil."
  [store data]
  (when-let [parent-id (:parent_id data)]
    (let [kind (store/index-kind-of store parent-id)]
      (cond
        (nil? kind)
        {:type :collection :entity-id parent-id
         :message (str "parent_id " parent-id " not found")}

        (not= :collection kind)
        {:type :collection :entity-id parent-id
         :message (str "parent_id " parent-id " points to a " (name kind) ", not a collection")}))))

(defn- validate-document-id
  "Validate that `document_id` in `data` points to a known document.
   Returns a failure map or nil."
  [store data]
  (when-let [doc-id (:document_id data)]
    (let [kind (store/index-kind-of store doc-id)]
      (cond
        (nil? kind)
        {:type :document :entity-id doc-id
         :message (str "document_id " doc-id " not found")}

        (not= :document kind)
        {:type :document :entity-id doc-id
         :message (str "document_id " doc-id " points to a " (name kind) ", not a document")}))))

(defn- validate-container-exclusion
  "Validate that a card doesn't have both dashboard_id and document_id set.
   Returns a failure map or nil."
  [_store data]
  (when (and (:dashboard_id data) (:document_id data))
    {:type :container-conflict
     :message "card has both dashboard_id and document_id set — only one container allowed"}))

(defn- validate-container-collection-match
  "Validate that a card nested under a dashboard or document has the same
   collection_id as its container. Returns a failure map or nil."
  [store data]
  (when-let [container-id (or (:dashboard_id data) (:document_id data))]
    (let [container-kind (if (:dashboard_id data) :dashboard :document)
          load-fn        (kind->load-fn container-kind)
          container-data (when load-fn (load-fn store container-id))]
      (when container-data
        (let [container-coll (:collection_id container-data)
              card-coll      (:collection_id data)]
          (when (and card-coll container-coll
                     (not= card-coll container-coll))
            {:type :container-collection-mismatch
             :message (str "card collection_id " card-coll
                           " doesn't match its " (name container-kind)
                           "'s collection_id " container-coll)}))))))

(defn- check-common
  "Run checks that apply to any entity (card, dashboard, metric, etc.).
   Returns a vector of failure maps, or empty vector if all checks pass."
  [store data]
  (filterv some?
           [(validate-collection-id store data)
            (validate-dashboard-id store data)
            (validate-document-id store data)
            (validate-parent-id store data)
            (validate-container-exclusion store data)
            (validate-container-collection-match store data)]))

;;; ===========================================================================
;;; Dashboard-specific checks
;;;
;;; Validates dashboard internal consistency:
;;; - dashcard card_id refs point to known cards
;;; - dashcard dashboard_tab_id refs point to tabs in this dashboard
;;; - dashcard grid positions are within bounds (24-column grid)
;;; ===========================================================================

(def ^:private grid-width
  "Dashboard grid width in columns."
  24)

(defn- validate-dashcard-card-ref
  "Validate that a dashcard's card_id points to a known card.
   Virtual cards (headings, text) have null card_id — that's fine."
  [store dashcard]
  (let [card-id (:card_id dashcard)]
    (when (and card-id (not (store/exists? store :card card-id)))
      {:type :dashcard-card-ref
       :dashcard-entity-id (:entity_id dashcard)
       :entity-id card-id
       :message (str "dashcard " (:entity_id dashcard) " references card " card-id " which is not in the export")})))

(defn- validate-dashcard-tab-ref
  "Validate that a dashcard's dashboard_tab_id references a tab in this dashboard.
   dashboard_tab_id is [dashboard-entity-id, tab-entity-id]."
  [tab-entity-ids dashcard]
  (when-let [tab-ref (:dashboard_tab_id dashcard)]
    (let [tab-eid (if (vector? tab-ref) (second tab-ref) tab-ref)]
      (when (and tab-eid (not (contains? tab-entity-ids tab-eid)))
        {:type :dashcard-tab-ref
         :dashcard-entity-id (:entity_id dashcard)
         :entity-id tab-eid
         :message (str "dashcard " (:entity_id dashcard) " references tab " tab-eid " which is not in this dashboard")}))))

(defn- validate-dashcard-grid
  "Validate that a dashcard's grid position is within bounds."
  [dashcard]
  (let [col    (or (:col dashcard) 0)
        row    (or (:row dashcard) 0)
        size-x (or (:size_x dashcard) 1)
        size-y (or (:size_y dashcard) 1)
        eid    (:entity_id dashcard)]
    (cond
      (neg? col)
      {:type :dashcard-grid :dashcard-entity-id eid
       :message (str "dashcard " eid " has negative col: " col)}

      (> (+ col size-x) grid-width)
      {:type :dashcard-grid :dashcard-entity-id eid
       :message (str "dashcard " eid " extends beyond grid: col=" col " + size_x=" size-x " > " grid-width)}

      (< size-x 1)
      {:type :dashcard-grid :dashcard-entity-id eid
       :message (str "dashcard " eid " has invalid size_x: " size-x)}

      (< size-y 1)
      {:type :dashcard-grid :dashcard-entity-id eid
       :message (str "dashcard " eid " has invalid size_y: " size-y)}

      (neg? row)
      {:type :dashcard-grid :dashcard-entity-id eid
       :message (str "dashcard " eid " has negative row: " row)})))

(defn- check-dashboard
  "Run dashboard-specific semantic checks on loaded dashboard data.
   Returns a vector of failure maps."
  [store data]
  (let [tabs          (:tabs data)
        dashcards     (:dashcards data)
        tab-entity-ids (into #{} (keep :entity_id) tabs)]
    (into []
          (keep identity)
          (mapcat (fn [dc]
                    [(validate-dashcard-card-ref store dc)
                     (validate-dashcard-tab-ref tab-entity-ids dc)
                     (validate-dashcard-grid dc)])
                  dashcards))))

;;; ===========================================================================
;;; Document-specific checks
;;;
;;; Documents contain ProseMirror content with embedded card references.
;;; cardEmbed nodes have attrs.id which is a serdes portable ref:
;;;   [{:model "Card" :id "entity-id"}]
;;; ===========================================================================

(defn- extract-card-embeds
  "Walk a ProseMirror content tree and extract card entity-ids from cardEmbed nodes."
  [node]
  (when (map? node)
    (let [embeds (when (= "cardEmbed" (:type node))
                   (let [refs (get-in node [:attrs :id])]
                     (keep (fn [ref]
                             (when (and (map? ref) (= "Card" (:model ref)))
                               (:id ref)))
                           (if (sequential? refs) refs [refs]))))
          child-embeds (mapcat extract-card-embeds (:content node))]
      (concat embeds child-embeds))))

(defn- extract-entity-links
  "Walk a ProseMirror content tree and extract entity references from link hrefs.
   Links like /dashboard/ABC or /question/ABC reference entities by entity_id."
  [node]
  (when (map? node)
    (let [;; Check marks on text nodes for links
          mark-links (when-let [marks (:marks node)]
                       (keep (fn [mark]
                               (when (= "link" (:type mark))
                                 (when-let [href (get-in mark [:attrs :href])]
                                   (when-let [[_ kind eid] (re-matches #"/(dashboard|question|card|collection)/(.+)" (str href))]
                                     {:kind (case kind
                                              "dashboard"  :dashboard
                                              "question"   :card
                                              "card"       :card
                                              "collection" :collection)
                                      :entity-id eid}))))
                             marks))
          child-links (mapcat extract-entity-links (:content node))]
      (concat mark-links child-links))))

(defn- check-document
  "Run document-specific semantic checks. Validates embedded card refs and entity links."
  [store data]
  (let [doc       (:document data)
        card-eids (extract-card-embeds doc)
        links     (extract-entity-links doc)]
    (into []
          cat
          [;; Check card embeds
           (keep (fn [card-eid]
                   (when-not (store/exists? store :card card-eid)
                     {:type :document-card-ref
                      :entity-id card-eid
                      :message (str "document embeds card " card-eid " which is not in the export")}))
                 card-eids)
           ;; Check entity links in href attributes
           (keep (fn [{:keys [kind entity-id]}]
                   (when-not (store/exists? store kind entity-id)
                     {:type :document-link
                      :entity-id entity-id
                      :message (str "document links to " (name kind) " " entity-id " which is not in the export")}))
                 links)])))

;;; ===========================================================================
;;; deps.analysis helpers
;;; ===========================================================================

(defn- partition-errors
  "Split a set of check-entity errors into :bad-refs (MBQL issues) and
   :native-errors (SQL validation issues like :missing-column, :syntax-error)."
  [errors]
  (let [{native true, mbql false} (group-by #(contains? #{:missing-column :syntax-error :missing-table-alias} (:type %))
                                            errors)]
    {:bad-refs      (vec mbql)
     :native-errors (when (seq native) (set native))}))

(defn- humanize-source-entity
  "Replace synthetic :source-entity-id integers with portable refs (entity-ids
   or path strings) so error output is meaningful."
  [store error]
  (if-let [src-id (:source-entity-id error)]
    (let [kind   (:source-entity-type error)
          ref    (case kind
                   :table (some->> (store/id->ref store :table src-id) (str/join "."))
                   :card  (or (store/id->ref store :card src-id) src-id)
                   src-id)]
      (assoc error :source-entity-id ref))
    error))

(defn- humanize-errors
  "Translate all synthetic IDs in a set of errors back to portable refs."
  [store errors]
  (when errors
    (into (empty errors) (map #(humanize-source-entity store %)) errors)))

;;; ===========================================================================
;;; Transform-specific checks
;;;
;;; Transforms have a source query (native or MBQL) and a target table.
;;; We validate the database ref and the source query via deps.analysis.
;;; ===========================================================================

(defn- check-transform
  "Run transform-specific semantic checks via deps.analysis/check-entity.
   Loads the transform from the store (which caches and assigns IDs), then
   delegates query validation to deps.analysis.
   Returns a result map with :unresolved, :native-errors, :bad-refs, :error, :sql keys."
  [store provider entity-id]
  (let [data (store/load-transform! store entity-id)]
    (if (not= "query" (get-in data [:source :type]))
      ;; Non-query transforms (e.g. python) — no query to validate
      {:unresolved []}
      ;; Query-based transforms — validate via deps.analysis
      (let [db-name      (or (get-in data [:source :query :database])
                             (:source_database_id data))
            unresolved   (atom [])
            transform-id (:id data)
            sql          (get-in data [:source :query :stages 0 :native])]
        ;; Check database ref
        (when (and db-name (not (store/exists? store :database db-name)))
          (swap! unresolved conj {:type :database :name db-name
                                  :message (str "transform references database " db-name " which is not in the schema")}))
        ;; Resolution failures from converting transform metadata
        (let [transform-meta (provider/transform-metadata store data)]
          (swap! unresolved into (or (:provider/resolution-failures transform-meta) []))
          ;; Validate via deps.analysis
          (let [errors (try
                         (deps.analysis/check-entity provider :transform transform-id)
                         (catch Exception e
                           #{{:type :validation-exception-error :message (.getMessage e)}}))
                {:keys [bad-refs native-errors]} (partition-errors errors)
                native-errors (humanize-errors store native-errors)
                bad-refs      (mapv #(humanize-source-entity store %) bad-refs)]
            (cond-> {:unresolved @unresolved}
              (seq bad-refs)      (assoc :bad-refs bad-refs)
              (seq native-errors) (assoc :native-errors native-errors)
              sql                 (assoc :sql sql))))))))

;;; ===========================================================================
;;; Non-card entity checking — load from files, run common + type-specific checks
;;; ===========================================================================

(defn- id->path
  "Convert an integer ID back to a human-readable path string for error messages."
  [store id id-type]
  (case id-type
    :table    (some->> (store/id->ref store :table id) (str/join "."))
    :field    (some->> (store/id->ref store :field id) (str/join "."))
    :card     (when-let [eid (store/id->ref store :card id)]
                (or (:name (store/cached-entity store :card eid)) eid))
    :database (store/id->ref store :database id)
    nil))

(declare extract-refs-from-card)

(defn- merge-refs
  "Merge multiple ref maps, concatenating and deduplicating each key."
  [& ref-maps]
  (reduce (fn [acc m]
            (reduce-kv (fn [a k v]
                         (if (seq v)
                           (update a k (fn [existing]
                                         (vec (distinct (into (or existing []) v)))))
                           a))
                       acc m))
          {} ref-maps))

(declare extract-entity-refs-from-raw-data)

(defn- extract-refs-from-query
  ([store query] (extract-refs-from-query store query nil #{}))
  ([store query provider visited]
   (let [table-ids  (lib/all-source-table-ids query)
         card-ids   (lib/all-source-card-ids query)
         cols       (try (lib/returned-columns query) (catch Exception _ nil))
         tables     (mapv #(id->path store % :table) table-ids)
         fields     (when cols (->> cols (keep :id) (mapv #(id->path store % :field))))
         cards      (mapv #(id->path store % :card) card-ids)
         transitive (when provider
                      (for [cid card-ids :when (not (visited cid))]
                        (extract-refs-from-card store provider cid (conj visited cid))))
         direct     {:tables       (vec (remove nil? tables))
                     :fields       (vec (remove nil? fields))
                     :source-cards (vec (remove nil? cards))}]
     (apply merge-refs direct transitive))))

(defn- extract-refs-from-card [store provider card-id visited]
  (try
    (when-let [card (lib.metadata/card provider card-id)]
      (let [;; Get the raw card data from the store for entity ref extraction
            eid         (store/id->ref store :card card-id)
            raw-data    (when eid (store/cached-entity store :card eid))
            entity-refs (when raw-data (extract-entity-refs-from-raw-data raw-data))
            query-refs  (when-let [dq (:dataset-query card)]
                          (extract-refs-from-query store (lib/query provider dq) provider visited))]
        (merge-refs (or query-refs {}) entity-refs)))
    (catch Exception _ {})))

(defn- extract-entity-refs-from-raw-data
  "Extract snippet, measure, metric, and segment references from raw card data.
   These are extracted from the YAML structure before resolution, since the
   resolved lib query normalizes them away."
  [data]
  (let [stages (get-in data [:dataset_query :stages])]
    (reduce
     (fn [acc stage]
       (let [;; Snippets from template-tags
             snippets (->> (vals (:template-tags stage))
                           (filter #(= "snippet" (get % :type)))
                           (keep :snippet-name))
             ;; Measures and metrics from aggregation clauses
             agg-refs (->> (:aggregation stage)
                           (filter vector?)
                           (keep (fn [clause]
                                   (let [tag (first clause)]
                                     (case (str tag)
                                       "measure" {:kind :measures  :ref (last clause)}
                                       "metric"  {:kind :metrics   :ref (last clause)}
                                       nil)))))
             ;; Segments from filter clauses
             seg-refs (->> (:filters stage)
                           (filter vector?)
                           (keep (fn [clause]
                                   (when (= "segment" (str (first clause)))
                                     {:kind :segments :ref (last clause)}))))]
         (cond-> acc
           (seq snippets) (update :snippets into snippets)
           (seq agg-refs) (as-> a (reduce (fn [m {:keys [kind ref]}]
                                            (update m kind (fnil conj []) ref))
                                          a agg-refs))
           (seq seg-refs) (update :segments into (map :ref seg-refs)))))
     {}
     (or stages []))))

;;; ===========================================================================
;;; Type-specific checks
;;; ===========================================================================

(defn- check-card-specific
  "Card-specific checks: query validation via deps.analysis + ref extraction."
  [store provider data]
  (let [card-id         (:id data)
        card-meta       (provider/card-metadata store data)
        resolution-failures (:provider/resolution-failures card-meta)
        errors          (when-not (:provider/missing-database card-meta)
                          (try
                            (deps.analysis/check-entity provider :card card-id)
                            (catch Exception e
                              #{{:type :validation-exception-error :message (.getMessage e)}})))
        {:keys [bad-refs native-errors]} (partition-errors errors)
        native-errors   (humanize-errors store native-errors)
        bad-refs        (mapv #(humanize-source-entity store %) bad-refs)
        query-refs      (try
                          (let [card  (lib.metadata/card provider card-id)
                                query (lib/query provider (:dataset-query card))]
                            (extract-refs-from-query store query provider #{card-id}))
                          (catch Exception _ nil))
        entity-refs     (extract-entity-refs-from-raw-data data)
        refs            (when query-refs
                          (cond-> query-refs
                            (seq (:snippets entity-refs))  (assoc :snippets (vec (distinct (:snippets entity-refs))))
                            (seq (:measures entity-refs))  (assoc :measures (vec (:measures entity-refs)))
                            (seq (:metrics entity-refs))   (assoc :metrics (vec (:metrics entity-refs)))
                            (seq (:segments entity-refs))  (assoc :segments (vec (:segments entity-refs)))))]
    {:card-id         card-id
     :unresolved      (into (or resolution-failures [])
                            (when (:provider/missing-database card-meta)
                              [{:type :database :name (:provider/missing-database card-meta)}]))
     :refs            refs
     :bad-refs        bad-refs
     :native-errors   native-errors
     :error           (when (:provider/missing-database card-meta)
                        (str "Unknown database: " (:provider/missing-database card-meta)))}))

;;; ===========================================================================
;;; Unified entity checking
;;; ===========================================================================

(defn- check-entity
  "Check a single entity by kind. Runs common checks on all entities,
   plus type-specific checks (query validation for cards/transforms,
   structural checks for dashboards/documents).
   Returns [entity-id result-map]."
  [store provider kind entity-id]
  (try
    (let [load-fn        (or (kind->load-fn kind) store/load-card!)
          data           (load-fn store entity-id)
          _              (provider/set-database! provider (provider/database-name-for-entity store kind data))
          common         (check-common store data)
          type-specific  (case kind
                           :card       (check-card-specific store provider data)
                           :dashboard  {:unresolved (check-dashboard store data)}
                           :document   {:unresolved (check-document store data)}
                           :transform  (check-transform store provider entity-id)
                           {})
          all-unresolved (into common (:unresolved type-specific))
          result         (cond-> {:name          (or (:name data) entity-id)
                                  :entity-id     entity-id
                                  :unresolved    all-unresolved
                                  :native-errors (:native-errors type-specific)
                                  :bad-refs      (:bad-refs type-specific)
                                  :error         (:error type-specific)
                                  :sql           (:sql type-specific)}
                           (:card-id type-specific) (assoc :card-id (:card-id type-specific))
                           (:refs type-specific)    (assoc :refs (:refs type-specific))
                           (not= kind :card)        (assoc :kind kind))]
      [entity-id result])
    (catch Exception e
      [entity-id {:name       entity-id
                  :entity-id  entity-id
                  :kind       (when (not= kind :card) kind)
                  :error      (.getMessage e)}])
    (finally
      (provider/clear-database! provider))))

(defn- check-duplicate-entity-ids
  "Check for duplicate entity_ids in the index. Returns a map of
   synthetic key → result for each duplicate group."
  [index]
  (when-let [dupes (:duplicates index)]
    (into {}
          (for [{:keys [kind ref files]} dupes]
            [(str "duplicate:" ref)
             {:name       (str "Duplicate " (name kind) " entity_id: " ref)
              :entity-id  ref
              :kind       kind
              :error      (str "entity_id " ref " appears in " (count files) " files: "
                               (str/join ", " files))}]))))

(def ^:private checked-kinds
  "Entity kinds that the checker validates, in processing order."
  [:card :dashboard :collection :document :measure :segment :transform])

(defn check-entities
  "Check all entities: cards, dashboards, collections, documents, transforms, etc.
   Returns `{entity-id result-map}`. See the Results processing section for the
   result-map shape.

   `schema-source` — a SchemaSource for resolving databases/tables/fields
   `assets-source` — an AssetsSource for resolving cards/snippets/transforms/segments
   `index`         — a file index (see store/make-store)
   `entity-ids`    — optional seq of entity-ids to check (defaults to all entities)"
  ([schema-source assets-source index]
   (check-entities schema-source assets-source index nil))
  ([schema-source assets-source index entity-ids]
   (binding [mu.fn/*enforce* false
             qp.i/*skip-middleware-because-app-db-access* true]
     (let [store    (store/make-store schema-source assets-source index)
           provider (provider/make-provider store)
           results  (if entity-ids
                      ;; Check specific entities — look up their kind
                      (into {}
                            (for [eid entity-ids
                                  :let [kind (or (store/index-kind-of store eid) :card)]]
                              (check-entity store provider kind eid)))
                      ;; Check all entities by kind
                      (into {}
                            (for [kind checked-kinds
                                  eid  (store/all-refs store kind)]
                              (check-entity store provider kind eid))))
           dupes    (check-duplicate-entity-ids index)]
       (merge results dupes)))))

;;; ===========================================================================
;;; Results processing — pure functions on result data
;;;
;;; Result map shape (per entity):
;;;
;;;   :name           string   — entity name
;;;   :entity-id      string   — portable entity ID
;;;   :card-id        int?     — synthetic integer ID (cards only)
;;;   :kind           keyword? — :dashboard, :transform, etc. (non-card entities)
;;;   :error          string?  — fatal error message (e.g. unknown database)
;;;   :unresolved     [map]    — unresolved reference failures
;;;                              each {:type kw, :path vec?, :entity-id str?,
;;;                                    :name str?, :message str?}
;;;   :bad-refs       [map]    — query issues from deps.analysis
;;;                              (e.g. {:type :validation-exception-error, :message str})
;;;   :native-errors  #{map}   — native SQL errors from deps.analysis
;;;                              (e.g. {:type :missing-column, :name str,
;;;                                     :source-entity-type kw?, :source-entity-id str?})
;;;   :refs           map?     — extracted references for display (cards only)
;;;                              {:tables [str], :fields [str], :source-cards [str]}
;;;   :sql            string?  — source SQL (transforms with native queries)
;;;
;;; Summary map shape (from summarize-results):
;;;
;;;   :total          int — total entities checked
;;;   :ok             int — entities with no issues
;;;   :errors         int — entities with fatal errors
;;;   :unresolved     int — entities with unresolved references
;;;   :native-errors  int — entities with native SQL errors
;;;   :issues         int — entities with bad refs / query issues
;;; ===========================================================================

(defn result-status
  "Compute the status of a single entity result.
   Returns :error, :unresolved, :native-errors, :issues, or :ok (checked in priority order)."
  [result]
  (cond
    (:error result)               :error
    (seq (:unresolved result))    :unresolved
    (seq (:native-errors result)) :native-errors
    (seq (:bad-refs result))      :issues
    :else                         :ok))

(defn summarize-results
  "Summarize check results into counts by status."
  [results]
  (let [by-status (group-by (comp result-status second) results)]
    {:total         (count results)
     :ok            (count (get by-status :ok))
     :errors        (count (get by-status :error))
     :unresolved    (count (get by-status :unresolved))
     :native-errors (count (get by-status :native-errors))
     :issues        (count (get by-status :issues))}))

(defn results-by-status
  "Group results by status. Returns map of status → seq of [entity-id result]."
  [results]
  (group-by (comp result-status second) results))

(defn format-result
  "Format a single entity result as a human-readable string."
  [[entity-id result]]
  (let [lines (atom [(str "=== " (:name result) " [" entity-id "] ===")
                     (if-let [kind (:kind result)]
                       (str "  Kind: " (name kind))
                       (str "  Card ID: " (:card-id result)))])
        {:keys [tables fields source-cards]} (:refs result)]
    (when (seq tables)
      (swap! lines conj (str "  Tables: " (str/join ", " tables))))
    (when (seq fields)
      (swap! lines conj (str "  Fields: " (str/join ", " fields))))
    (when (seq source-cards)
      (swap! lines conj (str "  Source Cards: " (str/join ", " source-cards))))
    (when-let [unresolved (:unresolved result)]
      (swap! lines conj "  UNRESOLVED REFERENCES:")
      (doseq [{:keys [type path entity-id name message]} unresolved]
        (swap! lines conj (str "    - " (clojure.core/name type) ": "
                               (or (some->> path (str/join ".")) entity-id name message)))))
    (when (seq (:native-errors result))
      (swap! lines conj "  NATIVE SQL ERRORS:")
      (doseq [err (:native-errors result)]
        (swap! lines conj (str "    - " (pr-str err))))
      (when-let [sql (:sql result)]
        (swap! lines conj (str "  SQL: " sql))))
    (swap! lines conj (case (result-status result)
                        :error        (str "  ERROR: " (:error result))
                        :unresolved   "  Status: MISSING REFS"
                        :native-errors "  Status: NATIVE SQL ERRORS"
                        :issues       (str "  Status: ISSUES FOUND\n"
                                           (str/join "\n" (map #(str "    - " (pr-str %)) (:bad-refs result))))
                        :ok           "  Status: OK"))
    (str/join "\n" @lines)))

(defn format-error
  "Format a single card error concisely for LLM consumption.
   Returns nil for :ok results. Only includes actionable error information."
  [[entity-id result]]
  (let [status (result-status result)]
    (when (not= :ok status)
      (let [kind-label (if-let [kind (:kind result)] (name kind) "card")
            lines (atom [(str kind-label ": " (:name result) " (entity_id: " entity-id ")")])]
        (when-let [unresolved (seq (:unresolved result))]
          (doseq [{:keys [type path entity-id name message]} unresolved]
            (swap! lines conj (str "  unresolved " (clojure.core/name type) ": "
                                   (or (some->> path (str/join ".")) entity-id name message)))))
        (when (seq (:bad-refs result))
          (doseq [ref (:bad-refs result)]
            (swap! lines conj (str "  bad ref: " (pr-str ref)))))
        (when (seq (:native-errors result))
          (doseq [err (:native-errors result)]
            (swap! lines conj (str "  sql error: " (pr-str (dissoc err :source-entity-type :source-entity-id)))))
          (when-let [sql (:sql result)]
            (swap! lines conj (str "  sql: " sql))))
        (when (:error result)
          (swap! lines conj (str "  error: " (:error result))))
        (str/join "\n" @lines)))))

(defn- make-sources-and-index
  "Build schema and assets sources from `schema-dir` and `export-dir`,
   and a merged file index."
  [export-dir schema-dir]
  (let [schema-source (serdes/make-database-source schema-dir)
        assets-source (serdes/make-source export-dir)
        schema-index  (serdes/source-index schema-source)
        assets-index  (serdes/source-index assets-source)
        index         (merge schema-index (select-keys assets-index [:card :dashboard :collection :document :measure :segment :snippet :transform :duplicates]))]
    {:schema-source schema-source :assets-source assets-source :index index}))

(defn check
  "Check entities in an export directory against database schemas.

   `export-dir`  — directory containing serdes-exported entities (collections/)
   `schema-dir`  — directory containing serdes-exported database schemas
   `entity-ids`  — optional seq of entity-ids to check (defaults to all entities)

   Returns `{:results results-map}` where results-map is `{entity-id result-map}`.
   See the Results processing section above for the result-map and summary-map shapes."
  ([export-dir schema-dir]
   (let [{:keys [schema-source assets-source index]} (make-sources-and-index export-dir schema-dir)]
     {:results (check-entities schema-source assets-source index)}))
  ([export-dir schema-dir entity-ids]
   (let [{:keys [schema-source assets-source index]} (make-sources-and-index export-dir schema-dir)]
     {:results (check-entities schema-source assets-source index entity-ids)})))

(defn setup
  "Create a store and provider for REPL iteration.
   Returns {:store store :provider provider :index index}.

   Usage:
     (def ctx (setup \"/path/to/export\" \"/path/to/schemas\"))
     (check-one ctx \"entity-id\")
     (check-one ctx \"entity-id\" :verbose true)"
  [export-dir schema-dir]
  (let [{:keys [schema-source assets-source index]} (make-sources-and-index export-dir schema-dir)
        store    (binding [mu.fn/*enforce* false]
                   (store/make-store schema-source assets-source index))
        provider (provider/make-provider store)]
    {:store store :provider provider :index index}))

(defn check-one
  "Check a single entity by entity-id using a pre-built context from [[setup]].
   Looks up the entity's kind from the store. Returns the result map.
   With :verbose true, also prints formatted output."
  [{:keys [store provider]} entity-id & {:keys [verbose]}]
  (binding [mu.fn/*enforce* false
            qp.i/*skip-middleware-because-app-db-access* true]
    (let [kind   (or (store/index-kind-of store entity-id) :card)
          [_ result] (check-entity store provider kind entity-id)]
      (when verbose
        #_{:clj-kondo/ignore [:discouraged-var]}
        (println (format-result [entity-id result])))
      result)))

(comment
  ;; REPL workflow:
  (check "/Users/dan/projects/work/stats-remote-sync"
         "/tmp/metadata/metadata/databases")
  (setup
   "/Users/dan/projects/work/stats-remote-sync"
   "/Users/dan/projects/work/stats-remote-sync/databases")

  (check-one (setup "/Users/dan/projects/work/stats-remote-sync"
                    "/tmp/metadata/metadata/databases")
             "2MNFkdc6EvgmUJU4E0ytF"))
