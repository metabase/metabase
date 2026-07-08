(ns metabase.sample-data.example-content
  "Recreate the bundled Example collection (the content shipped in `sample-content.edn`) on top of an
  already-synced Sample Database.

  On a fresh install `metabase.app-db.custom-migrations/CreateSampleContentV2` inserts the EDN rows
  verbatim into empty tables, so auto-increment reproduces the EDN ids exactly and every embedded
  reference still lines up. On upgrade the tables are not empty, so we insert the same rows but remap
  each id: simple FK columns by lookup, and the Database/Table/Field/Card ids embedded in card and
  dashcard query blobs via the serdes export walkers bound to numeric id maps."
  (:require
   [clojure.edn :as edn]
   [clojure.java.io :as io]
   [clojure.string :as str]
   [clojure.walk :as walk]
   [medley.core :as m]
   [metabase.models.interface :as mi]
   [metabase.models.serialization :as serdes]
   [metabase.settings.core :as setting]
   [metabase.util.date-2 :as u.date]
   [metabase.util.json :as json]
   [metabase.util.log :as log]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(def ^:private sample-content-resource "sample-content.edn")

(defn- load-sample-content []
  (with-open [r (io/reader (io/resource sample-content-resource))]
    (edn/read {:readers {'t u.date/parse}} (java.io.PushbackReader. r))))

(defn- now-for-temporals [row]
  (update-vals row (fn [v] (if (instance? java.time.temporal.Temporal v) :%now v))))

(defn- prep-row
  "Strip the EDN id (let the app DB assign one) and replace temporal literals with `:%now`."
  [row]
  (-> row now-for-temporals (dissoc :id)))

(defn- insert-rows!
  "Insert `rows` (each carrying its original EDN `:id` and `:entity_id`) into `table` after prepping,
  and return a map of `edn-id -> new id` so other rows' numeric FK references can be remapped. The new
  id is recovered by matching the unique `:entity_id` back to the inserted row."
  [table rows]
  (when (seq rows)
    (t2/query {:insert-into table :values (mapv prep-row rows)}))
  (let [eid->new (into {}
                       (map (juxt :entity_id :id))
                       (t2/query {:select [:id :entity_id] :from table
                                  :where [:in :entity_id (mapv :entity_id rows)]}))]
    (into {} (map (fn [r] [(:id r) (eid->new (:entity_id r))])) rows)))

;;; --------------------------------------------- id remapping ----------------------------------------------

(defn- model->map-key [model]
  (case (name model)
    "Card"       :cards
    "Dashboard"  :dashboards
    "Collection" :collections
    nil))

(defn- remap-result-metadata [maps cols]
  (mapv (fn [m]
          (-> m
              (m/update-existing :table_id           #(get (:tables maps) % %))
              (m/update-existing :id                 #(if (number? %) (get (:fields maps) % %) %))
              (m/update-existing :field_ref          serdes/export-mbql)
              (m/update-existing :fk_target_field_id #(if (number? %) (get (:fields maps) % %) %))))
        cols))

(defn- remap-source-card-refs
  "`export-mbql` only remaps a numeric `:source-table` (a table id); a `\"card__N\"` `:source-table` - a card
  that builds on another card - is left carrying the EDN card id. Rewrite each through the card id map so it
  points at the recreated card instead of whatever row happens to occupy the EDN id on an upgraded app db."
  [card-map query]
  (walk/postwalk
   (fn [x]
     (if-let [[_ n] (and (map? x)
                         (string? (:source-table x))
                         (re-matches #"card__(\d+)" (:source-table x)))]
       (let [old-id (parse-long n)]
         (assoc x :source-table (str "card__" (get card-map old-id old-id))))
       x))
   query))

(defn- remap-blob
  "Remap the entity ids embedded in a serialized JSON `blob` string of the given `kind`, returning a
  JSON string. Reuses the serdes export walkers with the FK resolvers bound to return new numeric ids
  (rather than portable references)."
  [maps kind blob]
  (when (some? blob)
    (binding [serdes/*export-database-fk* (fn [_id] (:db maps))
              serdes/*export-field-fk*    (fn [id] (get (:fields maps) id id))
              serdes/*export-table-fk*    (fn [id] (get (:tables maps) id id))
              serdes/*export-fk*          (fn [id model]
                                            (let [k (model->map-key model)]
                                              (if k (get (get maps k) id id) id)))]
      (json/encode
       (case kind
         :mbql       (->> (json/decode+kw blob) serdes/export-mbql (remap-source-card-refs (:cards maps)))
         ;; Remap each parameter's refs in place, preserving the designed order. (export-parameters would reorder
         ;; them by :id - a serialization-stability device we must not inherit, or the filter order is scrambled.)
         :parameters (mapv serdes/export-mbql (json/decode+kw blob))
         :param-maps (serdes/export-parameter-mappings (json/decode+kw blob))
         ;; column_settings keys must stay strings, so decode without keywordizing (as the model does).
         :viz        (serdes/export-visualization-settings (mi/normalize-visualization-settings (json/decode blob)))
         :result-md  (remap-result-metadata maps (json/decode+kw blob)))))))

;;; --------------------------------------------- insertion ----------------------------------------------

(defn- field-id-maps
  "Build `{:db new-db-id :tables {edn-table-id new-table-id} :fields {edn-field-id new-field-id}}` by
  matching the EDN table/field names against the freshly-synced Sample Database."
  [content new-db-id]
  (let [edn-tables    (:metabase_table content)
        edn-fields    (:metabase_field content)
        tname->new    (t2/select-fn->pk :name :model/Table :db_id new-db-id)
        table-id-map  (into {} (keep (fn [{:keys [id name]}]
                                       (when-let [new-id (tname->new name)]
                                         [id new-id])))
                            edn-tables)
        ;; [new-table-id field-name] -> new-field-id
        new-fields    (t2/select :model/Field :table_id [:in (vals table-id-map)])
        nf-index      (into {} (map (fn [f] [[(:table_id f) (:name f)] (:id f)])) new-fields)
        field-id-map  (into {} (keep (fn [{:keys [id table_id name]}]
                                       (when-let [new-tid (table-id-map table_id)]
                                         (when-let [new-fid (nf-index [new-tid name])]
                                           [id new-fid])))
                                     edn-fields))]
    {:db new-db-id :tables table-id-map :fields field-id-map}))

(defn- remap-collection-location
  "Remap the parent ids embedded in a collection `location` path (e.g. \"/2/3/\") through `old->new`, one path
  segment at a time. Remapping per segment (rather than successive string replacement over the id map) avoids a
  newly-assigned id being re-substituted as if it were a still-pending old id."
  [old->new location]
  (if (= "/" location)
    location
    (str "/"
         (->> (str/split location #"/")
              (remove str/blank?)
              (map (fn [segment]
                     (if-let [old-id (parse-long segment)]
                       (str (get old->new old-id old-id))
                       segment)))
              (str/join "/"))
         "/")))

(defn- insert-collections! [content]
  ;; Reuse the existing Example collections (matched by entity id) so user content filed into them survives an
  ;; engine swap; only create one when it's missing. Roots before children so a new child's location path can be
  ;; remapped against ids already assigned.
  (loop [pending (sort-by (comp count :location) (:collection content))
         coll-map {}]
    (if-let [row (first pending)]
      (let [existing (:id (t2/query-one {:select [:id] :from :collection :where [:= :entity_id (:entity_id row)]}))
            new-id   (or existing
                         (let [prepared (-> row prep-row (update :location #(remap-collection-location coll-map %)))]
                           (t2/query {:insert-into :collection :values [prepared]})
                           (:id (t2/query-one {:select [:id] :from :collection :where [:= :entity_id (:entity_id row)]}))))]
        (recur (rest pending) (assoc coll-map (:id row) new-id)))
      coll-map)))

(defn- delete-prior-sample-content!
  "Drop the previously-bundled sample cards and dashboards, matched by their stable EDN entity ids, so reinserting
  them can't collide and stale ones don't linger. User content never carries these entity ids, so it is untouched;
  the Example collections are reused, not deleted. Dashboards are removed before cards because deleting a dashboard
  cascades its dashcards."
  [content]
  (doseq [table [:report_dashboard :report_card]]
    (let [eids (into [] (keep :entity_id) (get content table))]
      (when (seq eids)
        (t2/query {:delete-from table :where [:in :entity_id eids]})))))

(defn- insert-cards! [content maps]
  ;; Phase 1: insert with simple FKs remapped and blobs left as-is (no FK enforcement on JSON), so all
  ;; card ids exist before we rewrite inter-card references in phase 2.
  (let [coll-map (:collections maps)
        rows     (for [card (:report_card content)]
                   (-> card
                       (assoc :database_id (:db maps))
                       (assoc :collection_id (some-> (:collection_id card) coll-map))
                       (assoc :table_id (some-> (:table_id card) (->> (get (:tables maps)))))
                       (assoc :source_card_id nil)))
        card-map (insert-rows! :report_card (vec rows))
        maps     (assoc maps :cards card-map)]
    ;; Phase 2: rewrite query blobs + inter-card refs now that every card id exists.
    (doseq [card (:report_card content)]
      (t2/query {:update :report_card
                 :set    {:dataset_query          (remap-blob maps :mbql       (:dataset_query card))
                          :result_metadata        (remap-blob maps :result-md  (:result_metadata card))
                          :parameters             (remap-blob maps :parameters (:parameters card))
                          :parameter_mappings     (remap-blob maps :param-maps (:parameter_mappings card))
                          :visualization_settings (remap-blob maps :viz        (:visualization_settings card))
                          :source_card_id         (some-> (:source_card_id card) card-map)}
                 :where  [:= :id (card-map (:id card))]}))
    maps))

(defn- insert-dashboards! [content maps]
  (let [coll-map  (:collections maps)
        rows      (mapv (fn [d] (assoc d :collection_id (some-> (:collection_id d) coll-map)))
                        (:report_dashboard content))
        dash-map  (insert-rows! :report_dashboard rows)
        maps      (assoc maps :dashboards dash-map)]
    (doseq [d (:report_dashboard content)]
      (t2/query {:update :report_dashboard
                 :set    {:parameters (remap-blob maps :parameters (:parameters d))}
                 :where  [:= :id (dash-map (:id d))]}))
    maps))

(defn- insert-dashboard-tabs! [content maps]
  (let [dash-map (:dashboards maps)
        rows     (mapv (fn [t] (assoc t :dashboard_id (dash-map (:dashboard_id t))))
                       (:dashboard_tab content))]
    (assoc maps :tabs (insert-rows! :dashboard_tab rows))))

(defn- insert-dashcards! [content maps]
  (let [{:keys [dashboards cards tabs]} maps
        rows (mapv (fn [dc]
                     (-> (prep-row dc)
                         (assoc :dashboard_id (dashboards (:dashboard_id dc)))
                         (assoc :card_id (some-> (:card_id dc) cards))
                         (assoc :dashboard_tab_id (some-> (:dashboard_tab_id dc) tabs))
                         (assoc :parameter_mappings (remap-blob maps :param-maps (:parameter_mappings dc)))
                         (assoc :visualization_settings (remap-blob maps :viz (:visualization_settings dc)))))
                   (:report_dashboardcard content))]
    (when (seq rows)
      (t2/query {:insert-into :report_dashboardcard :values rows}))
    maps))

(defn- insert-dimensions! [content maps]
  (let [fields (:fields maps)
        rows   (mapv (fn [dim]
                       (-> (prep-row dim)
                           (assoc :field_id (fields (:field_id dim)))
                           (m/update-existing :human_readable_field_id #(some->> % (get fields)))))
                     (:dimension content))]
    (when (seq rows)
      (t2/query {:insert-into :dimension :values rows}))))

(defn- grant-example-collection-perms! [content maps]
  (when-let [example-collection-id (some->> (:collection content)
                                            (filter :is_sample)
                                            first :id
                                            (get (:collections maps)))]
    (when-let [group-id (:id (t2/query-one {:select [:id] :from :permissions_group :where [:= :name "All Users"]}))]
      ;; A reused Example collection already carries this grant; only insert when it's missing.
      (when-not (seq (t2/query {:select [1] :from :permissions
                                :where  [:and [:= :collection_id example-collection-id]
                                         [:= :group_id group-id]
                                         [:= :perm_type "perms/collection-access"]]
                                :limit  1}))
        (t2/query {:insert-into :permissions
                   :values      [{:object        (format "/collection/%s/" example-collection-id)
                                  :group_id      group-id
                                  :perm_type     "perms/collection-access"
                                  :perm_value    "read-and-write"
                                  :collection_id example-collection-id}]})))))

(defn- set-example-dashboard-id! [content maps]
  (when-let [dash (first (:report_dashboard content))]
    (when-let [new-id (get (:dashboards maps) (:id dash))]
      (setting/set-value-of-type! :integer :example-dashboard-id new-id))))

(defn recreate-example-content!
  "Recreate the bundled Example collection on the freshly-synced Sample Database `new-db-id`. Mirrors
  the fresh-install seeding, remapping every id reference to point at the new database's tables and
  fields. Best-effort: logs and swallows errors so a content-seeding failure can't break startup."
  [new-db-id]
  (try
    (t2/with-transaction [_conn]
      (let [content (load-sample-content)
            _       (delete-prior-sample-content! content)
            maps    (field-id-maps content new-db-id)
            maps    (assoc maps :collections (insert-collections! content))
            maps    (insert-cards! content maps)
            maps    (insert-dashboards! content maps)
            maps    (insert-dashboard-tabs! content maps)
            maps    (insert-dashcards! content maps)]
        (insert-dimensions! content maps)
        (grant-example-collection-perms! content maps)
        (set-example-dashboard-id! content maps)))
    (log/info "Recreated Sample Database example content")
    (catch Throwable e
      (log/error e "Failed to recreate Sample Database example content"))))
