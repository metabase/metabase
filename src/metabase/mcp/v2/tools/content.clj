(ns metabase.mcp.v2.tools.content
  "The v2 MCP `get_content` tool: a batched, typed fetch over every content type an agent can
   hold a `{type, id}` pair for. Each item is scope-checked, resolved (numeric id or entity_id),
   read-checked, and projected through the shared concise/detailed machinery with per-type
   `include` sections. Items are fault-isolated: one bad id, denied read, or teaching error
   becomes that item's `{type, id, error}` object and never sinks the rest of the batch.

   Per-type notes:
   - question/model/metric ride one Card fetch; `definition` exports the stored numeric-ref
     `dataset_query` to the portable external dialect through the permission-aware content
     store, so referenced entity_ids never leak past the caller's read boundary.
   - dashboard returns the editing skeleton (tabs, parameters with wired dashcard ids, one
     summary row per dashcard) — never the raw REST `dashcards` array.
   - alert/subscription redact recipients for non-admin callers exactly as `/api/pulse` does;
     subscription reads cover live Pulse rows and rows migrated to the notification API."
  (:require
   [clojure.string :as str]
   [metabase.agent-lib.representations.resolve :as repr.resolve]
   [metabase.api.common :as api]
   [metabase.dashboards.models.dashboard :as dashboard]
   [metabase.documents.core :as documents]
   [metabase.documents.prose-mirror :as prose-mirror]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.mcp.scope :as mcp.scope]
   [metabase.mcp.v2.common :as common]
   [metabase.mcp.v2.projections :as projections]
   [metabase.mcp.v2.registry :as registry]
   [metabase.metabot.scope :as metabot.scope]
   [metabase.metabot.tools.shared.content-store :as content-store]
   [metabase.metrics.core :as metrics]
   [metabase.models.interface :as mi]
   [metabase.notification.models :as models.notification]
   [metabase.permissions.core :as perms]
   [metabase.pulse.core :as pulse]
   [metabase.queries.core :as queries]
   [metabase.transforms.core :as transforms]
   [metabase.util :as u]
   [metabase.util.json :as json]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(def ^:private max-items
  "Batch cap for one get_content call."
  10)

(defn- compact
  [m]
  (into {} (remove (comp nil? val)) m))

;;; --------------------------------------------- question / model / metric ----------------------------------------

(def ^:private card-type->tool-type
  {:question "question" :model "model" :metric "metric"})

(defn- card-query
  "The card's own saved query as a lib query, or nil when the stored `dataset_query` is
   empty/broken — reads degrade by dropping the query-derived keys, never by failing."
  [mp dataset-query]
  (when (and mp (map? dataset-query) (seq dataset-query))
    (try
      (lib/query mp (lib-be/normalize-query dataset-query))
      (catch Exception _ nil))))

(defn- card-content-row
  [card]
  (let [dataset-query (:dataset_query card)
        native?       (= :native (some-> (:query_type card) keyword))
        mp            (some-> (:database_id card) lib-be/application-database-metadata-provider)
        query         (card-query mp dataset-query)]
    (assoc card
           :query_summary (some-> query (as-> q (try (lib/describe-query q) (catch Exception _ nil))))
           :template_tags (when native? (not-empty (get-in dataset-query [:native :template-tags])))
           ;; The materialized parameter list — for native cards it is derived from the raw
           ;; template tags above (same data, two views), for MBQL cards it is the stored array.
           :parameters    (if (and native? (empty? (:parameters card)))
                            (not-empty (vec (queries/card-template-tag-parameters card)))
                            (not-empty (:parameters card)))
           ::query query
           ::mp mp)))

(defn- fetch-card
  [tool-type id-or-eid]
  (let [card   (common/resolve-and-read :model/Card id-or-eid
                                        (fn [id] (api/read-check (t2/select-one :model/Card :id id))))
        actual (card-type->tool-type (:type card))]
    (when (not= actual tool-type)
      (common/throw-teaching-error
       (format "Card %s is a %s — request it with type: \"%s\"." (:id card) actual actual)))
    (card-content-row card)))

(defn- card-definition
  [row]
  (when-let [query (::query row)]
    (repr.resolve/try-export-query (::mp row) query content-store/default-store)))

;; The question/model projection (`:question`) is the one canonical card projection, registered
;; in [[metabase.mcp.v2.projections]] because browse_collection shares it. metric/measure/etc.
;; below are get_content's own and registered here.
(def ^:private metric-concise-keys
  [:id :name :type :description :collection_id :database_id :table_id :source_card_id
   :archived :query_summary])

(def ^:private metric-detailed-keys
  (into metric-concise-keys
        [:entity_id :display :creator_id :created_at :updated_at]))

(projections/register-projection!
 :metric
 {:concise  #(compact (select-keys % metric-concise-keys))
  :detailed #(compact (select-keys % metric-detailed-keys))
  :sample   (zipmap metric-detailed-keys (repeat "x"))})

;;; ------------------------------------------------ measure / segment ---------------------------------------------

(def ^:private measure-segment-concise-keys
  [:id :name :description :table_id :archived])

(def ^:private measure-segment-detailed-keys
  (into measure-segment-concise-keys
        [:entity_id :creator_id :created_at :updated_at]))

(doseq [type [:measure :segment]]
  (projections/register-projection!
   type
   {:concise  #(compact (select-keys % measure-segment-concise-keys))
    :detailed #(compact (select-keys % measure-segment-detailed-keys))
    :sample   (zipmap measure-segment-detailed-keys (repeat "x"))}))

(defn- fetch-measure-or-segment
  [model id-or-eid]
  (common/resolve-and-read model id-or-eid
                           (fn [id] (api/read-check (t2/select-one model :id id)))))

(defn- measure-or-segment-definition
  "The measure's aggregation clause / segment's filter clauses in the portable external dialect,
   or nil when the stored definition can't be exported."
  [kind row]
  (try
    (let [table          (t2/select-one :model/Table :id (:table_id row))
          mp             (lib-be/application-database-metadata-provider (:db_id table))
          metadata       (case kind
                           :measure (lib.metadata/measure mp (:id row))
                           :segment (lib.metadata/segment mp (:id row)))
          definition-key (case kind :measure :aggregation :segment :filters)]
      (some-> (repr.resolve/try-export-query mp (:definition metadata) content-store/default-store)
              (get-in ["stages" 0 (name definition-key)])))
    (catch Exception _ nil)))

;;; -------------------------------------------------- dimensions --------------------------------------------------

(defn- dimensions-section
  "The `dimensions` include for metrics and measures: the same permission-filtered
   `dimensions`/`dimension_mappings` pair `GET /api/metric/:id` and `GET /api/measure/:id`
   return — computed on read but, unlike those endpoints, never persisted, so this stays within
   the tool's `readOnlyHint` contract."
  [type row]
  (let [[metadata-type model] (case type
                                "metric"  [:metadata/metric :model/Card]
                                "measure" [:metadata/measure :model/Measure])]
    (when-let [computed (metrics/compute-dimensions metadata-type (:id row))]
      (let [fresh (-> (t2/select-one model :id (:id row))
                      (merge computed)
                      metrics/filter-dimensions-for-user)]
        (compact {:dimensions         (vec (:dimensions fresh))
                  :dimension_mappings (not-empty (vec (:dimension_mappings fresh)))})))))

;;; -------------------------------------------------- collection --------------------------------------------------

(defn- fetch-collection
  [id-or-eid]
  (common/resolve-and-read :model/Collection id-or-eid
                           (fn [id] (api/read-check :model/Collection id))))

;;; --------------------------------------------------- snippet ----------------------------------------------------

(def ^:private snippet-concise-keys
  [:id :name :description :content :collection_id :archived])

(def ^:private snippet-detailed-keys
  (into snippet-concise-keys
        [:entity_id :creator_id :created_at :updated_at]))

(projections/register-projection!
 :snippet
 {:concise  #(compact (select-keys % snippet-concise-keys))
  :detailed #(compact (select-keys % snippet-detailed-keys))
  :sample   (zipmap snippet-detailed-keys (repeat "x"))})

(defn- fetch-snippet
  [id-or-eid]
  (common/resolve-and-read :model/NativeQuerySnippet id-or-eid
                           (fn [id] (api/read-check (t2/select-one :model/NativeQuerySnippet :id id)))))

;;; --------------------------------------------------- document ---------------------------------------------------

(def ^:private document-concise-keys
  [:id :name :collection_id :archived :markdown])

(def ^:private document-detailed-keys
  (into document-concise-keys
        [:entity_id :creator_id :created_at :updated_at]))

(projections/register-projection!
 :document
 {:concise  #(compact (select-keys % document-concise-keys))
  :detailed #(compact (select-keys % document-detailed-keys))
  :sample   (zipmap document-detailed-keys (repeat "x"))})

(defn- fetch-document
  [id-or-eid]
  (let [doc (common/resolve-and-read :model/Document id-or-eid
                                     (fn [id] (documents/get-document id)))]
    (-> (select-keys doc [:id :name :collection_id :archived :entity_id :creator_id
                          :created_at :updated_at])
        ;; `ast->text` flattens the ProseMirror AST to plain prose (headings/lists/emphasis are
        ;; not preserved) — the closest body rendering the codebase has today.
        (assoc :markdown (prose-mirror/ast->text (:document doc))
               ::document doc))))

(defn- document-layout
  "Top-level node outline of the document's ProseMirror AST: one entry per block, with the
   embedded card id for cardEmbed nodes and the block's flattened text."
  [row]
  (mapv (fn [node]
          (compact {:type    (:type node)
                    :card_id (when (= (:type node) prose-mirror/card-embed-type)
                               (get-in node [:attrs :id]))
                    :text    (not-empty (prose-mirror/ast->text node))}))
        (get-in row [::document :document :content])))

;;; --------------------------------------------------- dashboard --------------------------------------------------

(defn- dashcard-kind
  [{:keys [card_id action_id visualization_settings]}]
  (cond
    action_id "action"
    card_id   "card"
    :else     (or (some->> (get-in visualization_settings [:virtual_card :display]) name (str "virtual_"))
                  "virtual")))

(defn- dashcard-card-ref
  "The `{id, name}` card reference for a card-backed dashcard; unreadable cards collapse to
   `{id}` only, as the REST dashboard response does."
  [{:keys [card_id action_id card]}]
  (when (and card_id (not action_id))
    (if (and card (mi/can-read? card))
      {:id (:id card) :name (:name card)}
      {:id card_id})))

(defn- dashcard-summary
  [{:keys [visualization_settings] :as dc}]
  (compact
   {:id                (:id dc)
    :kind              (dashcard-kind dc)
    :card              (dashcard-card-ref dc)
    ;; External link URLs only — a link card's stored entity snapshot may describe something
    ;; this user can't read, so it never rides the summary.
    :text              (when-not (:card_id dc)
                         (or (:text visualization_settings)
                             (get-in visualization_settings [:link :url])))
    :dashboard_tab_id  (:dashboard_tab_id dc)
    :row               (:row dc)
    :col               (:col dc)
    :size_x            (:size_x dc)
    :size_y            (:size_y dc)
    :series            (not-empty
                        (mapv (fn [s] (if (mi/can-read? s) {:id (:id s) :name (:name s)} {:id (:id s)}))
                              (:series dc)))
    :inline_parameters (not-empty (:inline_parameters dc))}))

(defn- dashboard-parameters-summary
  "One row per dashboard parameter: id, name, type, and the ids of the dashcards it is wired
   to (via [[dashboard/dashboard->resolved-params]], the same resolution the QP uses)."
  [dash]
  (let [resolved (dashboard/dashboard->resolved-params dash)]
    (mapv (fn [{param-id :id :as param}]
            (compact
             {:id           param-id
              :name         (:name param)
              :type         (:type param)
              :dashcard_ids (not-empty
                             (vec (sort (distinct (keep (comp :id :dashcard)
                                                        (:mappings (get resolved (u/qualified-name param-id))))))))}))
          (:parameters dash))))

(defn- fetch-dashboard
  [id-or-eid]
  (let [dash (-> (common/resolve-and-read :model/Dashboard id-or-eid
                                          (fn [id] (api/read-check (t2/select-one :model/Dashboard :id id))))
                 (t2/hydrate [:dashcards :series :card] :tabs))]
    (-> (select-keys dash [:id :name :description :entity_id :collection_id :creator_id :archived
                           :created_at :updated_at :width :auto_apply_filters :cache_ttl
                           :collection_position])
        (assoc :tabs       (mapv #(select-keys % [:id :name]) (:tabs dash))
               :parameters (dashboard-parameters-summary dash)
               :dashcards  (mapv dashcard-summary
                                 (sort-by (juxt #(or (:row %) 0) #(or (:col %) 0)) (:dashcards dash)))
               ::dashboard dash))))

(defn- dashboard-layout
  "The `layout` include: tabs with positions and the per-dashcard grid/wiring detail
   `patch_dashcard` edits — parameter mappings, inline parameters, and visualization settings
   (minus stored link-entity snapshots, which bypass read checks)."
  [row]
  (let [dash (::dashboard row)]
    {:tabs      (mapv #(select-keys % [:id :name :position]) (:tabs dash))
     :dashcards (mapv (fn [dc]
                        (-> (select-keys dc [:id :card_id :action_id :dashboard_tab_id :row :col
                                             :size_x :size_y :inline_parameters :parameter_mappings
                                             :visualization_settings])
                            (update :visualization_settings
                                    #(cond-> % (map? (:link %)) (update :link dissoc :entity)))
                            compact))
                      (:dashcards dash))}))

(def ^:private dashboard-concise-keys
  [:id :name :description :tabs :parameters :dashcards])

(def ^:private dashboard-detailed-keys
  (into dashboard-concise-keys
        [:entity_id :collection_id :creator_id :archived :created_at :updated_at :width
         :auto_apply_filters :cache_ttl :collection_position]))

(def ^:private dashboard-sample
  (-> (zipmap dashboard-detailed-keys (repeat "x"))
      (assoc :tabs [{:id 1 :name "x"}]
             :parameters [{:id "x" :name "x" :type "x" :dashcard_ids [1]}]
             :dashcards [{:id 1 :kind "x" :card {:id 1 :name "x"} :text "x" :dashboard_tab_id 1
                          :row 0 :col 0 :size_x 1 :size_y 1 :series [{:id 1 :name "x"}]
                          :inline_parameters ["x"]}])))

(projections/register-projection!
 :dashboard
 {:concise  #(compact (select-keys % dashboard-concise-keys))
  :detailed #(compact (select-keys % dashboard-detailed-keys))
  :sample   dashboard-sample})

;;; ----------------------------------------------------- alert ----------------------------------------------------

(defn- notification-recipient-row
  [recipient]
  (compact {:type                 (some-> (:type recipient) u/qualified-name)
            :user_id              (:user_id recipient)
            :email                (or (get-in recipient [:user :email])
                                      (get-in recipient [:details :value]))
            :permissions_group_id (:permissions_group_id recipient)}))

(defn- notification-handler-rows
  "Projected handler rows with the same recipient redaction `/api/pulse` applies: sandboxed or
   impersonated callers see only themselves among user recipients, non-superusers never see
   cross-tenant users, and when `strip-recipients?` (the caller can read the notification only
   as creator/recipient, not its payload) the recipient lists are removed entirely."
  [handlers strip-recipients?]
  (mapv (fn [handler]
          (compact
           {:id           (:id handler)
            :channel_type (some-> (:channel_type handler) u/qualified-name)
            :channel_id   (:channel_id handler)
            :recipients   (when-not strip-recipients?
                            (cond->> (:recipients handler)
                              (perms/sandboxed-or-impersonated-user?)
                              (filter #(or (nil? (:user_id %)) (= (:user_id %) api/*current-user-id*)))

                              (not api/*is-superuser?*)
                              (filter #(or (nil? (:user_id %))
                                           (= (some-> % :user :tenant_id) (:tenant_id @api/*current-user*))))

                              true
                              (mapv notification-recipient-row)))}))
        handlers))

(defn- hydrate-notification-row
  "The [[models.notification/hydrate-notification]] hydration, without its output schema —
   which rejects `payload_type: notification/dashboard` rows, readable here by design."
  [notification]
  (t2/hydrate notification
              :payload
              :subscriptions
              [:handlers :channel [:recipients :recipients-detail]]))

(defn- notification-content-row
  [notification]
  (let [strip? (and (= :notification/card (:payload_type notification))
                    (not (models.notification/current-user-can-read-payload? notification)))]
    (compact
     {:id            (:id notification)
      :payload_type  (some-> (:payload_type notification) u/qualified-name)
      :active        (:active notification)
      :creator_id    (:creator_id notification)
      :created_at    (:created_at notification)
      :updated_at    (:updated_at notification)
      :payload       (not-empty
                      (compact (select-keys (:payload notification) [:card_id :send_condition :send_once])))
      :subscriptions (mapv #(compact {:type            (some-> (:type %) u/qualified-name)
                                      :cron_schedule   (:cron_schedule %)
                                      :ui_display_type (some-> (:ui_display_type %) u/qualified-name)})
                           (:subscriptions notification))
      :handlers      (notification-handler-rows (:handlers notification) strip?)})))

(defn- fetch-notification
  "Fetch + read-check one notification row of `payload-type` by numeric id. Notifications have
   no entity_id column, so entity_id strings are a teaching error for these types."
  [tool-type payload-type id-or-eid]
  (when-not (int? id-or-eid)
    (common/throw-teaching-error
     (format "%ss take a numeric id — they have no entity_id." (str/capitalize tool-type))))
  (let [notification (t2/select-one :model/Notification :id id-or-eid :payload_type payload-type)]
    (when-not (and notification (mi/can-read? notification))
      (common/throw-not-found (keyword tool-type) id-or-eid))
    (notification-content-row (hydrate-notification-row notification))))

(def ^:private alert-concise-keys
  [:id :active :payload :subscriptions :handlers :creator_id])

(def ^:private alert-detailed-keys
  (into alert-concise-keys [:payload_type :created_at :updated_at]))

(def ^:private alert-sample
  (-> (zipmap alert-detailed-keys (repeat "x"))
      (assoc :payload {:card_id 1 :send_condition "x" :send_once true}
             :subscriptions [{:type "x" :cron_schedule "x" :ui_display_type "x"}]
             :handlers [{:id 1 :channel_type "x" :channel_id 1
                         :recipients [{:type "x" :user_id 1 :email "x" :permissions_group_id 1}]}])))

(projections/register-projection!
 :alert
 {:concise  #(compact (select-keys % alert-concise-keys))
  :detailed #(compact (select-keys % alert-detailed-keys))
  :sample   alert-sample})

;;; ------------------------------------------------- subscription -------------------------------------------------

(defn- subscription-pulse-row
  [pulse-row]
  (let [pulse-row (-> pulse-row
                      pulse/maybe-filter-pulse-recipients
                      pulse/maybe-strip-sensitive-metadata)]
    (compact
     (-> (select-keys pulse-row [:id :name :dashboard_id :skip_if_empty :parameters :collection_id
                                 :entity_id :creator_id :archived :created_at :updated_at])
         (assoc :channels (mapv (fn [channel]
                                  (compact
                                   (-> (select-keys channel [:id :channel_type :schedule_type
                                                             :schedule_hour :schedule_day
                                                             :schedule_frame :enabled :details])
                                       (assoc :recipients
                                              (some->> (:recipients channel)
                                                       (mapv #(compact (select-keys % [:id :email]))))))))
                                (:channels pulse-row))
                :cards (some->> (:cards pulse-row)
                                (mapv #(compact (select-keys % [:id :name :include_csv :include_xls
                                                                :format_rows])))))))))

(defn- subscription-pulse-id
  "Resolve a subscription id argument against the Pulse id space; nil when an entity_id doesn't
   resolve (the notification source is then tried)."
  [id-or-eid]
  (try
    (common/resolve-id-or-404 :model/Pulse id-or-eid)
    (catch clojure.lang.ExceptionInfo e
      (when-not (= 404 (:status-code (ex-data e)))
        (throw e)))))

(defn- fetch-subscription
  "Dashboard subscriptions are a dual-source read: live Pulse rows (the only kind writes create
   today) and rows already migrated to the notification API as `payload_type:
   notification/dashboard`. A Pulse that exists in the pulse id space owns the id — including
   when the caller cannot read it, which collapses to not-found rather than falling through to
   an unrelated notification that happens to share the numeric id."
  [id-or-eid]
  (let [pulse-id (subscription-pulse-id id-or-eid)]
    (if (and pulse-id (t2/exists? :model/Pulse :id pulse-id :alert_condition nil))
      (let [pulse-row (pulse/retrieve-pulse pulse-id)]
        (if (and pulse-row (mi/can-read? pulse-row))
          (subscription-pulse-row pulse-row)
          (common/throw-not-found :subscription id-or-eid)))
      (or (when (int? id-or-eid)
            (let [notification (t2/select-one :model/Notification
                                              :id id-or-eid
                                              :payload_type :notification/dashboard)]
              (when (and notification (mi/can-read? notification))
                (notification-content-row (hydrate-notification-row notification)))))
          (common/throw-not-found :subscription id-or-eid)))))

(def ^:private subscription-pulse-concise-keys
  [:id :name :dashboard_id :channels :cards :skip_if_empty :archived :creator_id])

(def ^:private subscription-pulse-detailed-keys
  (into subscription-pulse-concise-keys
        [:entity_id :collection_id :parameters :created_at :updated_at]))

(def ^:private subscription-sample
  (-> (zipmap subscription-pulse-detailed-keys (repeat "x"))
      (assoc :channels [{:id 1 :channel_type "x" :schedule_type "x" :schedule_hour 1
                         :schedule_day "x" :schedule_frame "x" :enabled true
                         :details {}
                         :recipients [{:id 1 :email "x"}]}]
             :cards [{:id 1 :name "x" :include_csv true :include_xls true :format_rows true}]
             :parameters [{:id "x" :name "x" :type "x"}])))

(projections/register-projection!
 :subscription
 {:concise  (fn [row]
              (if (:handlers row)
                (compact (select-keys row alert-concise-keys))
                (compact (select-keys row subscription-pulse-concise-keys))))
  :detailed (fn [row]
              (if (:handlers row)
                (compact (select-keys row alert-detailed-keys))
                (compact (select-keys row subscription-pulse-detailed-keys))))
  :sample   subscription-sample})

;;; --------------------------------------------------- transform --------------------------------------------------

(defn- fetch-transform
  [id-or-eid]
  (let [transform (common/resolve-and-read :model/Transform id-or-eid
                                           (fn [id] (transforms/get-transform id)))]
    (-> (select-keys transform [:id :name :description :source_type :collection_id :entity_id
                                :source_database_id :target_db_id :run_trigger :creator_id
                                :owner_user_id :owner_email :tag_ids :created_at :updated_at])
        (assoc :target   (:target transform)
               :last_run (some-> (:last_run transform)
                                 (select-keys [:id :status :start_time :end_time :message])
                                 compact)
               ;; The target table is hydrated without its own permission check (the transform
               ;; read-check verifies source tables only), so gate it here.
               :table    (when-let [table (:table transform)]
                           (when (mi/can-read? table)
                             (select-keys table [:id :name :schema :db_id])))
               ::transform transform))))

(defn- transform-definition
  "The transform's source in the external dialect: query sources have their query exported to
   portable form; other source types (e.g. python) pass through as stored."
  [row]
  (let [source (get-in row [::transform :source])]
    (if-let [query (:query source)]
      (let [mp       (some-> (:database query) lib-be/application-database-metadata-provider)
            exported (some->> (card-query mp query)
                              (#(repr.resolve/try-export-query mp % content-store/default-store)))]
        (when exported
          (assoc (dissoc source :query) :query exported)))
      source)))

(def ^:private transform-concise-keys
  [:id :name :description :source_type :target :collection_id :last_run])

(def ^:private transform-detailed-keys
  (into transform-concise-keys
        [:entity_id :source_database_id :target_db_id :run_trigger :creator_id :owner_user_id
         :owner_email :tag_ids :table :created_at :updated_at]))

(def ^:private transform-sample
  (-> (zipmap transform-detailed-keys (repeat "x"))
      (assoc :target {:type "x" :schema "x" :name "x"}
             :last_run {:id 1 :status "x" :start_time "x" :end_time "x" :message "x"}
             :table {:id 1 :name "x" :schema "x" :db_id 1}
             :tag_ids [1])))

(projections/register-projection!
 :transform
 {:concise  #(compact (select-keys % transform-concise-keys))
  :detailed #(compact (select-keys % transform-detailed-keys))
  :sample   transform-sample})

;;; ------------------------------------------------ type dispatch -------------------------------------------------

(def ^:private type->spec
  "Per-type dispatch: the projection key and the fetch fn (id-or-eid -> permission-checked
   content row). `:scope` is the extra runtime scope the type requires on top of the tool's
   base `agent:resource:read`."
  {"question"     {:proj :question   :fetch #(fetch-card "question" %)}
   "model"        {:proj :question   :fetch #(fetch-card "model" %)}
   "metric"       {:proj :metric     :fetch #(fetch-card "metric" %)}
   "measure"      {:proj :measure    :fetch #(fetch-measure-or-segment :model/Measure %)}
   "segment"      {:proj :segment    :fetch #(fetch-measure-or-segment :model/Segment %)}
   "dashboard"    {:proj :dashboard  :fetch fetch-dashboard}
   "document"     {:proj :document   :fetch fetch-document}
   "collection"   {:proj :collection :fetch fetch-collection}
   "snippet"      {:proj :snippet    :fetch fetch-snippet}
   "alert"        {:proj :alert      :fetch #(fetch-notification "alert" :notification/card %)
                   :scope metabot.scope/agent-notification-read}
   "subscription" {:proj :subscription :fetch fetch-subscription
                   :scope metabot.scope/agent-notification-read}
   "transform"    {:proj :transform  :fetch fetch-transform
                   :scope metabot.scope/agent-transforms-read}})

(def ^:private content-types
  (vec (sort (keys type->spec))))

(def ^:private include->types
  "Which types each `include` section applies to. A section is applied to each batch item whose
   type supports it and skipped for the rest, so a mixed-type batch can name a section that only
   some items have; a section no item in the batch supports is a teaching error."
  {"definition" #{"question" "model" "metric" "measure" "segment" "transform"}
   "fields"     #{"question" "model"}
   "parameters" #{"dashboard"}
   "layout"     #{"dashboard" "document"}
   "dimensions" #{"metric" "measure"}})

(defn- check-type-scope!
  [token-scopes type]
  (when-let [scope (get-in type->spec [type :scope])]
    (when-not (mcp.scope/matches? token-scopes scope)
      (throw (ex-info (format "Reading %s content requires the %s scope, which this token was not granted."
                              type scope)
                      {:status-code 403})))))

(defn- check-includes!
  "Reject an `include` section that no item in the batch can supply — a caller typo, rather than
   a mixed-type batch where the section legitimately applies to only some items. `batch-types`
   is the set of item types present in the call."
  [batch-types includes]
  (doseq [inc-name includes]
    (let [applicable (get include->types inc-name)]
      (when-not (some applicable batch-types)
        (common/throw-teaching-error
         (format "`include: \"%s\"` does not apply to type%s %s — it is available for: %s."
                 inc-name
                 (if (= 1 (count batch-types)) "" "s")
                 (str/join ", " (sort batch-types))
                 (str/join ", " (sort applicable))))))))

(defn- build-include
  [type row inc-name]
  (case inc-name
    "definition" (when-let [definition (case type
                                         ("question" "model" "metric") (card-definition row)
                                         "measure"   (measure-or-segment-definition :measure row)
                                         "segment"   (measure-or-segment-definition :segment row)
                                         "transform" (transform-definition row))]
                   {:definition definition})
    "fields"     {:result_metadata (vec (:result_metadata row))}
    "parameters" {:parameters (vec (get-in row [::dashboard :parameters]))}
    "layout"     {:layout (case type
                            "dashboard" (dashboard-layout row)
                            "document"  (document-layout row))}
    "dimensions" (dimensions-section type row)))

;;; -------------------------------------------------- the handler -------------------------------------------------

(defn- content-item-result
  "Build one batch item's result: its projection (with `include` sections or `fields`
   narrowing), or the `{type, id, error}` object that keeps a failing item from sinking the
   rest of the batch."
  [{:keys [include] :as args} token-scopes {:keys [type id fields] :as _item}]
  (try
    (check-type-scope! token-scopes type)
    (let [{:keys [proj fetch]} (type->spec type)
          row (fetch id)]
      (if fields
        (common/select-fields proj (projections/project proj :detailed row) fields
                              {:response-format (:response_format args)
                               :include         include})
        (let [fmt      (common/response-format args)
              ;; Only the sections this item's type supports; the batch may name sections that
              ;; apply to other items (check-includes! has already rejected any that no item has).
              sections (filter #(contains? (get include->types %) type) (distinct include))]
          (-> (projections/project proj fmt row)
              (merge (reduce (fn [acc inc-name]
                               (merge acc (build-include type row inc-name)))
                             {}
                             sections))
              (assoc :type type)))))
    (catch Exception e
      {:type type :id id :error (or (ex-message e) "Internal error")})))

(def ^:private get-content-args-schema
  [:map {:closed true}
   [:items [:sequential {:min 1 :description "The content to fetch — up to 10 items, mixed types allowed (e.g. a dashboard and its questions in one call)."}
            [:map {:closed true}
             [:type (into [:enum {:description "The item's content type, as returned by search/browse_collection."}]
                          content-types)]
             [:id [:or
                   [:int {:description "Numeric id."}]
                   [:string {:min 1 :description "A 21-character entity_id (alerts and migrated subscriptions are numeric-only)."}]]]
             [:fields {:optional true}
              [:maybe [:sequential [:string {:min 1 :description "Dot-paths picked from this type's detailed projection (see the fields catalog resource), item-relative inside arrays. Mutually exclusive with response_format and include."}]]]]]]]
   [:include {:optional true}
    [:maybe [:sequential [:enum {:description "Extra sections, each applied to every item whose type supports it and ignored for the rest — so a mixed-type batch can ask for several at once: definition (query-bearing types, returned in the external dialect the write/execute tools accept), fields (question/model column metadata), parameters (dashboard's full parameter array), layout (dashboard grid + tabs, document block outline), dimensions (metric/measure). A section no item in the batch supports is an error."}
                          "definition" "fields" "parameters" "layout" "dimensions"]]]]
   [:response_format {:optional true}
    [:maybe [:enum {:description "concise (default) returns each type's essential shape; detailed adds entity_id, creator, timestamps, and other secondary columns."}
             "concise" "detailed"]]]])

(registry/deftool get-content
  "Fetch content by {type, id} — the generic typed read for anything discovered via search or browse_collection. Batch up to 10 items of mixed types in one call; each item is permission-checked independently and a bad item returns a per-item {type, id, error} object without failing the batch. Types: question, model, metric, measure, dashboard, document, collection, snippet, segment, alert, subscription, transform. Ids accept numeric ids or 21-char entity_ids. Concise shapes are task-focused: a question carries its source (database/table/source card), display, one-line query summary, raw template tags, and its materialized parameters (the same tags viewed as parameters — not a second concept); a dashboard returns the editing skeleton (tabs, parameters with wired dashcard ids, one summary row per dashcard with position/size/series/inline parameters) rather than the raw REST dashcards; a document returns its body text; alerts and subscriptions return condition, schedule, channels, and recipients (redacted for non-admins); a transform returns source type, target, and its latest run. Use include for on-demand sections — definition returns the query in the same external dialect execute_query and the write tools accept, so read-modify-write round-trips. Reading alerts/subscriptions additionally requires the agent:notification:read scope, transforms agent:transforms:read."
  {:name         "get_content"
   :scope        metabot.scope/agent-resource-read
   :extra-scopes [metabot.scope/agent-notification-read metabot.scope/agent-transforms-read]
   :annotations  {:readOnlyHint true :idempotentHint true}
   :args         get-content-args-schema}
  [{:keys [items include] :as args} {:keys [token-scopes]}]
  (when (> (count items) max-items)
    (common/throw-teaching-error
     (format "`items` accepts at most %d entries per call — you passed %d; split the batch."
             max-items (count items))))
  ;; Surface an invalid response_format once, before any item work.
  (common/response-format args)
  ;; Reject include sections no item in the batch supports, before any per-item work.
  (when (seq include)
    (check-includes! (into #{} (map :type) items) (distinct include)))
  (common/success-content
   (json/encode {:results (mapv #(content-item-result args token-scopes %) items)})))
