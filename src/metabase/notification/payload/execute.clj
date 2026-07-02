(ns metabase.notification.payload.execute
  (:require
   [malli.core :as mc]
   [medley.core :as m]
   [metabase.api.common :as api]
   [metabase.channel.urls :as urls]
   [metabase.dashboards.models.dashboard-card :as dashboard-card]
   [metabase.models.interface :as mi]
   [metabase.models.serialization :as serdes]
   [metabase.models.visualization-settings :as viz-settings]
   [metabase.notification.payload.temp-storage :as notification.temp-storage]
   [metabase.parameters.shared :as shared.params]
   [metabase.query-processor.card :as qp.card]
   [metabase.query-processor.core :as qp]
   [metabase.query-processor.dashboard :as qp.dashboard]
   [metabase.request.core :as request]
   [metabase.system.core :as system]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [toucan2.core :as t2]))

(defn is-card-empty?
  "Check if the card is empty"
  [card]
  (let [result (:result card)]
    (or
     ;; Text cards have no result; treat as empty
     (nil? result)
     (zero? (-> result :row_count))
     ;; Many aggregations result in [[nil]] if there are no rows to aggregate after filters
     (= [[nil]] (-> result :data :rows)))))

(defn- tab->part
  [{:keys [name]}]
  {:text name
   :type :tab-title})

(defn- render-tabs?
  "Check if a dashboard has more than 1 tab, and thus needs them to be rendered.
  We don't need to render the tab title if only 1 exists (issue #45123)."
  [dashboard-or-id]
  (< 1 (t2/count :model/DashboardTab :dashboard_id (u/the-id dashboard-or-id))))

(defn virtual-card-of-type?
  "Check if dashcard is a virtual with type `ttype`, if `true` returns the dashcard, else returns `nil`.

  There are currently 5 types of virtual card: \"text\", \"action\", \"link\", \"placeholder\", and \"heading\"."
  [dashcard ttype]
  (when (= ttype (get-in dashcard [:visualization_settings :virtual_card :display]))
    dashcard))

(defn- merge-default-values
  "For the specific case of Dashboard Subscriptions we should use `:default` parameter values as the actual `:value` for
  the parameter if none is specified. Normally the FE client will take `:default` and pass it in as `:value` if it
  wants to use it (see #20503 for more details) but this obviously isn't an option for Dashboard Subscriptions... so
  go thru `parameters` and change `:default` to `:value` unless a `:value` is explicitly specified."
  [parameters]
  (for [{default-value :default, :as parameter} parameters]
    (merge
     (when default-value
       {:value default-value})
     (dissoc parameter :default))))

(defn- link-card-entity->url
  [{:keys [db_id id model] :as _entity}]
  (case model
    "card"       (urls/card-url id)
    "dataset"    (urls/card-url id)
    "collection" (urls/collection-url id)
    "dashboard"  (urls/dashboard-url id)
    "database"   (urls/database-url id)
    "table"      (urls/table-url db_id id)))

(defn- link-card->text-part
  [{:keys [entity url] :as _link-card}]
  (let [url-link-card? (some? url)]
    {:text (str (format
                 "### [%s](%s)"
                 (if url-link-card? url (:name entity))
                 (if url-link-card? url (link-card-entity->url entity)))
                (when-let [description (if url-link-card? nil (:description entity))]
                  (format "\n%s" description)))
     :type :text}))

(defn dashcard-link-card->part
  "Convert a dashcard that is a link card into a `:text` part (markdown `### [name](url)`), or nil
  if it links to an entity the current user can't read. Used by both the email/notification
  pipeline and the backend PDF renderer.

  This function should be executed under pulse's creator permissions (`with-current-user`)."
  [dashcard]
  (assert api/*current-user-id* "Makes sure you wrapped this with a `with-current-user`.")
  (let [link-card (get-in dashcard [:visualization_settings :link])]
    (cond
      (some? (:url link-card))
      (link-card->text-part link-card)

      ;; if link card link to an entity, update the setting because
      ;; the info in viz-settings might be out-of-date
      (some? (:entity link-card))
      (let [{:keys [model id]} (:entity link-card)
            instance           (t2/select-one
                                (serdes/link-card-model->toucan-model model)
                                (dashboard-card/link-card-info-query-for-model model id))]
        (when (mi/can-read? instance)
          (link-card->text-part (assoc link-card :entity instance)))))))

(defn- resolve-inline-parameters
  "Resolves the full parameter definitions for inline parameters on a dashcard, and adds them to the dashcard's
  visualization settings so that they can be rendered in a subscription."
  [dashcard parameters]
  (let [inline-parameters-ids (set (:inline_parameters dashcard))
        inline-parameters     (filter #(inline-parameters-ids (:id %)) parameters)]
    (assoc-in dashcard [:visualization_settings :inline_parameters] inline-parameters)))

(defn- escape-markdown-chars?
  "Heading cards should not escape characters."
  [dashcard]
  (not= "heading" (get-in dashcard [:visualization_settings :virtual_card :display])))

(defn process-virtual-dashcard
  "Given a virtual (text or heading) dashcard and the parameters on a dashboard, returns the dashcard with any
  parameter values appropriately substituted into connected variables in the text."
  [dashcard parameters]
  (let [text                  (-> dashcard :visualization_settings :text)
        parameter-mappings    (:parameter_mappings dashcard)
        tag-names             (shared.params/tag-names text)
        param-id->param       (into {} (map (juxt :id identity) parameters))
        tag-name->param-id    (into {} (map (juxt (comp second :target) :parameter_id) parameter-mappings))
        tag->param            (reduce (fn [m tag-name]
                                        (when-let [param-id (get tag-name->param-id tag-name)]
                                          (assoc m tag-name (get param-id->param param-id))))
                                      {}
                                      tag-names)]
    (update-in dashcard [:visualization_settings :text] shared.params/substitute-tags tag->param (system/site-locale) (escape-markdown-chars? dashcard))))

(defn- fixup-viz-settings
  "The viz-settings from :data :viz-settings might be incorrect if there is a cached of the same query.
  See #58469 and #64687.
  TODO (Ngoc 2026-04-23) -- now that the QP cache preserves fresh viz-settings on cache hit
  (#72922), this hack is likely redundant. Confirm with coverage and remove."
  [qp-result]
  (update-in qp-result [:data :viz-settings] merge (-> (get-in qp-result [:json_query :viz-settings])
                                                       viz-settings/db->norm)))

(defn- format-qp-result
  "Extracts only the keys that the notification pipeline needs from a QP result.
  The full QP result contains many internal bookkeeping keys that are irrelevant
  to rendering notifications, so we select just the ones downstream consumers use."
  [qp-result]
  (-> (select-keys qp-result [:status :row_count :database_id :error
                              :notification/truncated? :data.rows-file-size])
      (assoc :data (select-keys (:data qp-result)
                                [:cols :rows :viz-settings :results_metadata :insights
                                 :results_timezone :format-rows? :pivot-export-options]))))

(def cells-to-disk-threshold
  "Maximum cells (rows * columns) to hold in memory when running notification queries. After this, query results are
  streamed straight to disk. See [[metabase.notification.payload.temp-storage]] for more details."
  20000)

(def ^:private squeezed-spill-threshold
  "Once a notification is already holding [[cells-to-disk-threshold]] cells in memory across all its cards, additional
  cards spill at this much lower per-card cell count - so many small cards can't collectively exhaust memory. We keep
  a floor (rather than spilling everything) so trivially tiny results aren't needlessly written to disk."
  500)

(defn- new-spill-budget
  "Build the shared [[metabase.notification.payload.temp-storage/ResidentBudget]] for one notification's cards."
  []
  (notification.temp-storage/make-resident-budget
   {:per-card     cells-to-disk-threshold
    :resident-cap cells-to-disk-threshold
    :floor        squeezed-spill-threshold}))

(defn execute-dashboard-subscription-card
  "Returns subscription result for a card.

  `spill-budget` is the shared [[metabase.notification.payload.temp-storage/ResidentBudget]] for the whole
  notification, so memory held by sibling cards influences when this card spills to disk. When omitted (e.g. executing a
  card in isolation), a private budget is used so only the per-card spill limit applies.

  This function should be executed under pulse's creator permissions."
  ([dashcard parameters]
   (execute-dashboard-subscription-card dashcard parameters (new-spill-budget)))
  ([{:keys [card_id dashboard_id] :as dashcard} parameters spill-budget]
   (log/with-context {:card_id card_id}
     (try
       (when-let [card (t2/select-one :model/Card :id card_id :archived false)]
         (let [dashboard      (t2/select-one :model/Dashboard :id dashboard_id)
               multi-cards    (dashboard-card/dashcard->multi-cards dashcard)
               result-fn      (fn [card-id]
                                (let [card (if (= card-id (:id card))
                                             card
                                             (t2/select-one :model/Card :id card-id))]
                                  {:card     card
                                   :dashcard dashcard
                                   ;; TODO should this be dashcard?
                                   :type     :card
                                   :result   (-> (qp.dashboard/process-query-for-dashcard
                                                  :dashboard     dashboard
                                                  :card          card
                                                  :dashcard      dashcard
                                                  :context       :dashboard-subscription
                                                  :export-format :api
                                                  :parameters    parameters
                                                  :constraints   {}
                                                  :middleware    {:process-viz-settings?             true
                                                                  :js-int-to-string?                 false
                                                                  :add-default-userland-constraints? false}
                                                  :make-run      (fn make-run [qp _export-format]
                                                                   (^:once fn* [query info]
                                                                     (qp
                                                                      (qp/userland-query query info)
                                                                      ;; Pass streaming rff with 2000 row threshold
                                                                      (notification.temp-storage/notification-rff
                                                                       {:budget spill-budget}
                                                                       {:dashboard_id dashboard_id
                                                                        :card_id card-id
                                                                        :dashcard_id (u/the-id dashcard)})))))
                                                 fixup-viz-settings
                                                 format-qp-result)}))
               result         (result-fn card_id)
               series-results (mapv (comp result-fn :id) multi-cards)]
           (log/debugf "Dashcard has %d series" (count multi-cards))
           (log/debugf "Result has %d rows" (-> result :result :row_count))
           (doseq [series-result series-results]
             (log/with-context {:series_card_id (-> series-result :card :id)}
               (log/debugf "Series result has %d rows" (-> series-result :result :row_count))))
           (when-not (and (get-in dashcard [:visualization_settings :card.hide_empty])
                          (is-card-empty? (assoc card :result (:result result))))
             (update result :dashcard assoc :series-results series-results))))
       (catch Throwable e
         (log/warnf e "Error running query for Card %s" (:card_id dashcard)))))))

(defn- dashcard->part
  "Given a dashcard returns its part based on its type.

  `spill-budget` is the notification-wide [[metabase.notification.payload.temp-storage/ResidentBudget]] shared across
  all dashcards.

  The result will follow the pulse's creator permissions."
  [dashcard parameters spill-budget]
  (assert api/*current-user-id* "Makes sure you wrapped this with a `with-current-user`.")
  (cond
    (:card_id dashcard)
    (log/with-context {:card_id (:card_id dashcard)}
      (let [parameters (merge-default-values parameters)]
        ;; Streaming to disk is now handled by the query processor rff
        (-> (execute-dashboard-subscription-card dashcard parameters spill-budget)
            (m/update-existing :dashcard resolve-inline-parameters parameters))))

    (virtual-card-of-type? dashcard "iframe")
    nil

    (virtual-card-of-type? dashcard "action")
    nil

    (virtual-card-of-type? dashcard "link")
    (dashcard-link-card->part dashcard)

    (virtual-card-of-type? dashcard "placeholder")
    nil

    (virtual-card-of-type? dashcard "heading")
    (let [parameters (merge-default-values parameters)]
      (some-> dashcard
              (process-virtual-dashcard parameters)
              (resolve-inline-parameters parameters)
              :visualization_settings
              (assoc :type :heading)))

    ;; text cards have existed for a while and I'm not sure if all existing text cards
    ;; will have virtual_card.display = "text", so assume everything else is a text card
    :else
    (let [parameters (merge-default-values parameters)]
      (some-> dashcard
              (process-virtual-dashcard parameters)
              :visualization_settings
              (assoc :type :text)))))

(defn- dashcards->part
  "Render `dashcards` to parts, sharing `spill-budget` across them so memory held by earlier cards can push later (large)
  cards to spill to disk instead of collectively exhausting heap. The budget is created once per dashboard (spanning all
  tabs) by the caller, not here, so a multi-tab dashboard shares a single budget."
  [dashcards parameters spill-budget]
  (let [ordered-dashcards (sort dashboard-card/dashcard-comparator dashcards)]
    (doall (keep #(dashcard->part % parameters spill-budget) ordered-dashcards))))

(mr/def ::Part
  "Part."
  [:multi {:dispatch :type}
   [:card      [:map {:closed true}
                [:type                      [:= :card]]
                [:card                      :map]
                [:result                    [:maybe :map]]
                [:dashcard {:optional true} [:maybe :map]]]]
   [:text      [:map
                [:text :string]
                [:type [:= :text]]]]
   [:tab-title [:map {:closed true}
                [:text :string]
                [:type [:= :tab-title]]]]
   [::mc/default :map]])

(mu/defn execute-dashboard :- [:sequential ::Part]
  "Execute a dashboard and return its parts.

  `spill-budget` is the shared [[metabase.notification.payload.temp-storage/ResidentBudget]] for the whole dashboard
  (all tabs), so cards can't collectively exhaust heap regardless of how they're split into tabs. The 3-arity uses the
  production default ([[new-spill-budget]]); pass your own (e.g. with lower limits) to the 4-arity for testing."
  ([dashboard-id user-id parameters]
   (execute-dashboard dashboard-id user-id parameters (new-spill-budget)))
  ([dashboard-id user-id parameters spill-budget]
   (request/with-current-user user-id
     (if (render-tabs? dashboard-id)
       (let [tabs               (t2/hydrate (t2/select :model/DashboardTab :dashboard_id dashboard-id) :tab-cards)
             tabs-with-cards    (filter #(seq (:cards %)) tabs)
             should-render-tab? (< 1 (count tabs-with-cards))]
         (doall (flatten (for [{:keys [cards] :as tab} tabs-with-cards]
                           (do
                             (log/debugf "Rendering tab %s with %d cards" (:name tab) (count cards))
                             (concat
                              (when should-render-tab?
                                [(tab->part tab)])
                              (dashcards->part cards parameters spill-budget)))))))
       (let [dashcards (t2/select :model/DashboardCard :dashboard_id dashboard-id)]
         (log/debugf "Rendering dashboard with %d cards" (count dashcards))
         (dashcards->part dashcards parameters spill-budget))))))

(mu/defn execute-card :- [:maybe ::Part]
  "Returns the result for a card."
  [creator-id :- pos-int?
   card-id :- pos-int?]
  (let [card   (t2/select-one :model/Card card-id)
        result (request/with-current-user creator-id
                 (-> (qp.card/process-query-for-card card :api
                                                     ;; TODO rename to :notification?
                                                     :context     :pulse
                                                     :constraints {}
                                                     :middleware  {:skip-results-metadata?            false
                                                                   :process-viz-settings?             true
                                                                   :js-int-to-string?                 false
                                                                   :add-default-userland-constraints? false}
                                                     :make-run    (fn make-run [qp _export-format]
                                                                    (^:once fn* [query info]
                                                                      (qp
                                                                       (qp/userland-query query info)
                                                                       ;; Pass streaming rff with 2000 row threshold
                                                                       ;; a standalone card has no sibling cards, so it
                                                                       ;; uses its own (unshared) spill budget
                                                                       (notification.temp-storage/notification-rff
                                                                        {:budget (new-spill-budget)}
                                                                        {:card-id card-id})))))
                     fixup-viz-settings
                     format-qp-result))]
    (log/debugf "Result has %d rows" (:row_count result))
    {:card   card
     :result result
     :type   :card}))
