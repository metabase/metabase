(ns metabase.notification.payload.execute
  (:require
   [malli.core :as mc]
   [metabase.api.common :as api]
   [metabase.models.dashboard-card :as dashboard-card]
   [metabase.models.interface :as mi]
   [metabase.models.params.shared :as shared.params]
   [metabase.models.serialization :as serdes]
   [metabase.public-settings :as public-settings]
   [metabase.query-processor :as qp]
   [metabase.query-processor.dashboard :as qp.dashboard]
   [metabase.query-processor.middleware.permissions :as qp.perms]
   [metabase.query-processor.pivot :as qp.pivot]
   [metabase.request.core :as request]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.urls :as urls]
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

  There are currently 4 types of virtual card: \"text\", \"action\", \"link\", \"placeholder\"."
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

(defn- dashcard-link-card->part
  "Convert a dashcard that is a link card to pulse part.

  This function should be executed under pulse's creator permissions."
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

(defn- escape-heading-markdown
  [dashcard]
  (if (= "heading" (get-in dashcard [:visualization_settings :virtual_card :display]))
    ;; If there's no heading text, the heading is empty, so we return nil.
    (when (get-in dashcard [:visualization_settings :text])
      (update-in dashcard [:visualization_settings :text]
                 #(str "## " (shared.params/escape-chars % shared.params/escaped-chars-regex))))
    dashcard))

(defn- escape-markdown-chars?
  "Heading cards should not escape characters."
  [dashcard]
  (not= "heading" (get-in dashcard [:visualization_settings :virtual_card :display])))

(defn process-virtual-dashcard
  "Given a dashcard and the parameters on a dashboard, returns the dashcard with any parameter values appropriately
  substituted into connected variables in the text."
  [dashcard parameters]
  (let [text               (-> dashcard :visualization_settings :text)
        parameter-mappings (:parameter_mappings dashcard)
        tag-names          (shared.params/tag_names text)
        param-id->param    (into {} (map (juxt :id identity) parameters))
        tag-name->param-id (into {} (map (juxt (comp second :target) :parameter_id) parameter-mappings))
        tag->param         (reduce (fn [m tag-name]
                                     (when-let [param-id (get tag-name->param-id tag-name)]
                                       (assoc m tag-name (get param-id->param param-id))))
                                   {}
                                   tag-names)]
    (update-in dashcard [:visualization_settings :text] shared.params/substitute-tags tag->param (public-settings/site-locale) (escape-markdown-chars? dashcard))))

(defn execute-dashboard-subscription-card
  "Returns subscription result for a card.

  This function should be executed under pulse's creator permissions."
  [{:keys [card_id dashboard_id] :as dashcard} parameters]
  (try
    (when-let [card (t2/select-one :model/Card :id card_id :archived false)]
      (let [multi-cards    (dashboard-card/dashcard->multi-cards dashcard)
            result-fn      (fn [card-id]
                             {:card     (if (= card-id (:id card))
                                          card
                                          (t2/select-one :model/Card :id card-id))
                              :dashcard dashcard
                              ;; TODO should this be dashcard?
                              :type     :card
                              :result   (qp.dashboard/process-query-for-dashcard
                                         :dashboard-id  dashboard_id
                                         :card-id       card-id
                                         :dashcard-id   (u/the-id dashcard)
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
                                                             nil))))})
            result         (result-fn card_id)
            series-results (mapv (comp result-fn :id) multi-cards)]
        (when-not (and (get-in dashcard [:visualization_settings :card.hide_empty])
                       (is-card-empty? (assoc card :result (:result result))))
          (update result :dashcard assoc :series-results series-results))))
    (catch Throwable e
      (log/warnf e "Error running query for Card %s" (:card_id dashcard)))))

(defn- dashcard->part
  "Given a dashcard returns its part based on its type.

  The result will follow the pulse's creator permissions."
  [dashcard parameters]
  (assert api/*current-user-id* "Makes sure you wrapped this with a `with-current-user`.")
  (cond
    (:card_id dashcard)
    (let [parameters (merge-default-values parameters)]
      (execute-dashboard-subscription-card dashcard parameters))

    (virtual-card-of-type? dashcard "iframe")
    nil

    (virtual-card-of-type? dashcard "action")
    nil

    (virtual-card-of-type? dashcard "link")
    (dashcard-link-card->part dashcard)

    (virtual-card-of-type? dashcard "placeholder")
    nil

    ;; text cards have existed for a while and I'm not sure if all existing text cards
    ;; will have virtual_card.display = "text", so assume everything else is a text card
    :else
    (let [parameters (merge-default-values parameters)]
      (some-> dashcard
              (process-virtual-dashcard parameters)
              escape-heading-markdown
              :visualization_settings
              (assoc :type :text)))))

(defn- dashcards->part
  [dashcards parameters]
  (let [ordered-dashcards (sort dashboard-card/dashcard-comparator dashcards)]
    (doall (keep #(dashcard->part % parameters) ordered-dashcards))))

(def Part
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

(mu/defn execute-dashboard :- [:sequential Part]
  "Execute a dashboard and return its parts."
  [dashboard-id user-id parameters]
  (request/with-current-user user-id
    (if (render-tabs? dashboard-id)
      (let [tabs               (t2/hydrate (t2/select :model/DashboardTab :dashboard_id dashboard-id) :tab-cards)
            tabs-with-cards    (filter #(seq (:cards %)) tabs)
            should-render-tab? (< 1 (count tabs-with-cards))]
        (doall (flatten (for [{:keys [cards] :as tab} tabs-with-cards]
                          (concat
                           (when should-render-tab?
                             [(tab->part tab)])
                           (dashcards->part cards parameters))))))
      (dashcards->part (t2/select :model/DashboardCard :dashboard_id dashboard-id) parameters))))

;; TODO - this should be done async
;; TODO - this and `execute-multi-card` should be made more efficient: eg. we query for the card several times
(mu/defn execute-card :- [:maybe Part]
  "Returns the result for a card."
  [creator-id :- pos-int?
   card-id :- pos-int?
   & {:as options}]
  (try
    (when-let [{query     :dataset_query
                metadata  :result_metadata
                card-type :type
                :as       card} (t2/select-one :model/Card :id card-id, :archived false)]
      (let [query         (assoc query :async? false)
            process-fn (if (= :pivot (:display card))
                         qp.pivot/run-pivot-query
                         qp/process-query)
            process-query (fn []
                            (binding [qp.perms/*card-id* card-id]
                              (process-fn
                               (qp/userland-query
                                (assoc query
                                       :middleware {:skip-results-metadata?            true
                                                    :process-viz-settings?             true
                                                    :js-int-to-string?                 false
                                                    :add-default-userland-constraints? false})
                                (merge (cond-> {:executed-by creator-id
                                                :context     :pulse
                                                :card-id     card-id}
                                         (= card-type :model)
                                         (assoc :metadata/model-metadata metadata))
                                       {:visualization-settings (:visualization_settings card)}
                                       options)))))
            result        (if creator-id
                            (request/with-current-user creator-id
                              (process-query))
                            (process-query))]
        {:card   card
         :result result
         :type   :card}))
    (catch Throwable e
      (log/warnf e "Error running query for Card %s" card-id))))
