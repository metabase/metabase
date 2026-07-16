(ns metabase.metabot.tools.save-entity
  "Tool that persists a previously-generated chart into a collection or dashboard.

  The model creates ad-hoc charts with `construct_notebook_query` / `create_chart`;
  those live only in agent memory (`shared/current-charts-state`). This tool turns
  one of them into a real saved question, either in a collection or as a question on
  a dashboard, and emits an `entity_saved` data part so the inline chart can show
  where it landed. It should only be called when the user asks to save the chart."
  (:require
   [metabase.api.common :as api]
   [metabase.collections.models.collection :as collection]
   [metabase.events.core :as events]
   [metabase.metabot.agent.links :as links]
   [metabase.metabot.agent.streaming :as streaming]
   [metabase.metabot.scope :as scope]
   [metabase.metabot.tmpl :as te]
   [metabase.metabot.tools.shared :as shared]
   [metabase.queries.core :as queries]
   [metabase.query-permissions.core :as query-perms]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(def ^:private save-entity-schema
  [:map {:closed true}
   ;; stamped onto report_card.metabot_chart_id, a varchar(36) — clamp to fit
   [:chart_id [:string {:min 1 :max 36}]]
   [:name :string]
   [:description :string]
   [:destination
    [:multi {:dispatch :target_type}
     ["collection"
      [:map {:closed true}
       [:target_type [:= "collection"]]
       ;; omit for the user's personal collection; explicit null for the root collection
       [:collection_id {:optional true} [:maybe :int]]]]
     ["dashboard"
      [:map {:closed true}
       [:target_type [:= "dashboard"]]
       [:dashboard_id :int]]]]]])

(defn- agent-error! [msg]
  (throw (ex-info msg {:agent-error? true :status-code 400})))

(defn- resolve-chart
  "Look up the generated chart from agent memory and return the pieces needed to
  build a card: a legacy `dataset_query` and a `display` keyword. Mirrors the
  lookup in `edit_chart` / `links/resolve-chart-link`."
  [chart-id]
  (let [chart (get (shared/current-charts-state) chart-id)
        query (or (first (:queries chart))
                  (get (shared/current-queries-state) (:query_id chart)))]
    (when-not query
      (agent-error!
       (tru (str "No generated chart found with id `{0}`. Create a chart with "
                 "`construct_notebook_query` first, then save it using the id it returns.")
            chart-id)))
    ;; agent-created charts carry the display in `:visualization_settings :chart_type`;
    ;; charts seeded from the frontend viewing context (`seed-charts`) leave that nil
    ;; and keep the raw config under `:chart_config` instead
    {:dataset_query (links/->legacy-mbql query)
     :display       (or (some-> (get-in chart [:visualization_settings :chart_type]) keyword)
                        (some-> (get-in chart [:chart_config :display_type]) keyword)
                        :table)}))

(defn- personal-collection-id []
  (or (:id (collection/user->personal-collection api/*current-user-id*))
      ;; API-key users have no personal collection; without this check the nil would
      ;; silently save into the root collection instead
      (agent-error!
       (tru (str "The current user has no personal collection. Pass an explicit "
                 "`collection_id` (or `null` for the root collection) instead.")))))

(defn- collection-name
  "Current display name of a collection target, for the LLM-facing save summary.
  A `nil` id is the root (\"Our analytics\") collection."
  [collection-id]
  (if (nil? collection-id)
    (:name (collection/root-collection-with-ui-details nil))
    (t2/select-one-fn :name :model/Collection :id collection-id)))

(defn- save-to-collection!
  [{:keys [name description dataset_query display destination]}]
  (let [collection-id (if (contains? destination :collection_id)
                        (:collection_id destination)
                        (personal-collection-id))]
    (query-perms/check-run-permissions-for-query dataset_query)
    (api/create-check :model/Card {:collection_id collection-id})
    (let [card (queries/create-card!
                {:name                   name
                 :description            description
                 :dataset_query          dataset_query
                 :display                display
                 :visualization_settings {}
                 :collection_id          collection-id}
                {:id api/*current-user-id*}
                :delay-event)]
      {:card             card
       :destination      {:type "collection" :id collection-id}
       :destination-name (collection-name collection-id)
       :link             (str "metabase://question/" (:id card))})))

(defn- save-to-dashboard!
  [{:keys [name description dataset_query display destination]}]
  (let [dashboard-id (:dashboard_id destination)]
    (when-not dashboard-id
      (agent-error! (tru "A `dashboard_id` is required when saving to a dashboard.")))
    (query-perms/check-run-permissions-for-query dataset_query)
    (api/write-check :model/Dashboard dashboard-id)
    (let [card (queries/create-card!
                {:name                   name
                 :description            description
                 :dataset_query          dataset_query
                 :display                display
                 :visualization_settings {}
                 :dashboard_id           dashboard-id}
                {:id api/*current-user-id*}
                :delay-event)]
      {:card             card
       :destination      {:type "dashboard" :id dashboard-id}
       :destination-name (t2/select-one-fn :name :model/Dashboard :id dashboard-id)
       :link             (str "metabase://dashboard/" dashboard-id)})))

(mu/defn ^{:tool-name "save_entity"
           :scope     scope/agent-question-create}
  save-entity-tool
  "Save a chart you previously created into a collection or a dashboard.

  ONLY call this when the user explicitly asks to save, keep, or add the chart
  somewhere. Reference the chart by the `chart_id` you were given when it was
  created. Provide a `name` and a concise `description` for the saved question
  (reuse the chart's description).

  Choose a `destination`:
  - To save into a collection, set `target_type` to `collection` and pass a
    `collection_id`. Inspect available collections first with
    `read_resource` on `metabase://collections?tree=true`. Omit `collection_id`
    to use the user's personal collection; pass `null` for the root collection.
  - To add it to a dashboard, set `target_type` to `dashboard` and pass a
    `dashboard_id`. Find dashboards with `search` or `read_resource`.

  After saving, tell the user where it went and share the returned link."
  [{:keys [chart_id destination description] question-name :name} :- save-entity-schema]
  (try
    (let [{:keys [dataset_query display]} (resolve-chart chart_id)
          args {:name          question-name
                :description    description
                :dataset_query  dataset_query
                :display        display
                :destination    destination}
          ;; Create the card and stamp which conversation + generated chart it came
          ;; from in ONE transaction, so a reloaded conversation can't observe the
          ;; card without its origin. The stamp is a raw table update — it should not
          ;; run the Card model's heavy before-update pipeline. The `:card-create`
          ;; event is delayed until after the transaction commits so subscribers see
          ;; the card.
          {:keys [card link destination-name] saved-destination :destination}
          (t2/with-transaction [_conn]
            (let [saved (case (:target_type destination)
                          "collection" (save-to-collection! args)
                          "dashboard"  (save-to-dashboard! args))]
              (when-let [conversation-id (shared/current-conversation-id)]
                (t2/update! (t2/table-name :model/Card) (:id (:card saved))
                            {:metabot_conversation_id conversation-id
                             :metabot_chart_id        chart_id}))
              saved))
          _ (events/publish-event! :event/card-create
                                   {:object card :user-id api/*current-user-id*})
          instruction-text (te/lines
                            (str "Saved \"" question-name "\" to " destination-name ".")
                            ""
                            (str "Tell the user it was saved and share this link: "
                                 (te/link question-name link)))]
      {:output            (str "<result>\nSaved as card " (:id card)
                               " in " destination-name ".\n</result>\n"
                               "<instructions>\n" instruction-text "\n</instructions>")
       :structured-output {:result-type   :saved-entity
                           :card-id       (:id card)
                           :collection-id (:collection_id card)
                           :destination   saved-destination}
       :data-parts        [(streaming/entity-saved-part
                            {:chart_id    chart_id
                             :card_id     (:id card)
                             :destination saved-destination})]})
    (catch Exception e
      (log/error e "Error saving entity")
      (if (:agent-error? (ex-data e))
        {:output (ex-message e)}
        {:output (str "Failed to save: " (or (ex-message e) "Unknown error"))}))))
