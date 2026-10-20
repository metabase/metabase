(ns metabase.metabot.tools.save-entity
  "Tool that persists a previously-generated chart into a collection, dashboard, or document.

  The model creates ad-hoc charts with `construct_notebook_query` / `create_chart`;
  those live only in agent memory (`shared/current-charts-state`). This tool turns
  one of them into a real saved question — in a collection, as a question on a
  dashboard, or embedded in a document at a chosen position — and emits an
  `entity_saved` data part so the inline chart can show where it landed. It should
  only be called when the user asks to save the chart."
  (:require
   [metabase.api.common :as api]
   [metabase.collections.models.collection :as collection]
   [metabase.documents.core :as documents]
   [metabase.events.core :as events]
   [metabase.metabot.agent.links :as links]
   [metabase.metabot.agent.streaming :as streaming]
   [metabase.metabot.db :as metabot.db]
   [metabase.metabot.scope :as scope]
   [metabase.metabot.tmpl :as te]
   [metabase.metabot.tools.core :as tools]
   [metabase.metabot.tools.recoverable.common :as recoverable.common]
   [metabase.metabot.tools.shared :as shared]
   [metabase.queries.core :as queries]
   [metabase.query-permissions.core :as query-perms]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.log :as log]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(def ^:private save-entity-schema
  [:map {:closed true}
   ;; stamped onto report_card.metabot_chart_id, a varchar(36) — clamp to fit
   [:chart_id [:string {:min 1 :max 36}]]
   ;; report_card.name is a varchar(254)
   [:name [:string {:min 1 :max 254}]]
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
       [:dashboard_id :int]]]
     ["document"
      [:map {:closed true}
       [:target_type [:= "document"]]
       [:document_id :int]
       [:position {:optional true} [:maybe :int]]]]]]])

(tools/defrecoverable no-personal-collection!
  "A collection destination without a `collection_id` means the personal collection, and this user has none."
  {:payload [:map {:closed true}]}
  [_]
  {:message  "The user has no personal collection, so `collection_id` can't be omitted."
   :recovery [{:uses #{"read_resource"}
               :text (str "Read `metabase://collections?tree=true` with `read_resource` and pass the id of a"
                          " collection with `can_write=true`.")}
              {:uses #{}
               :text "Or ask the user which collection to save it to."}]})

(tools/defrecoverable destination-not-writable!
  "The user may not save to a destination they can see."
  {:payload     [:or
                 [:map {:closed true}
                  [:kind [:enum :collection :dashboard :document]]
                  [:id   :int]]
                 ;; The root collection, which has no id.
                 [:map {:closed true}
                  [:kind [:= :collection]]]]
   :status-code 403}
  [{:keys [kind id]}]
  {:message  (str "The user doesn't have permission to save to "
                  (if id (str (name kind) " " id) "the root collection") ".")
   :recovery [{:uses #{}
               :text (str "Tell the user, and offer to save it to their personal collection instead: a collection"
                          " destination without `collection_id`.")}
              {:uses #{"read_resource"}
               :text (str "To offer another collection, read `metabase://collections?tree=true` with"
                          " `read_resource` and pick one with `can_write=true`.")}]})

(defn- check-writable!
  "Call `check`, a write or create check for `destination`, and report the 403 it throws as
  [[destination-not-writable!]]."
  [destination check]
  (try
    (check)
    (catch clojure.lang.ExceptionInfo e
      (if (= 403 (:status-code (ex-data e)))
        (destination-not-writable! destination)
        (throw e)))))

(defn- check-query-permissions!
  "Throw unless the current user may run `dataset-query`. A refusal ends the turn with a message for the user."
  [dataset-query]
  (try
    (query-perms/check-run-permissions-for-query dataset-query)
    (catch clojure.lang.ExceptionInfo e
      (let [status-code (:status-code (ex-data e))]
        (if (and (int? status-code) (<= 400 status-code 499))
          ;; The query is the chart's, so the agent has no other one to offer.
          (tools/unrecoverable!
           ::no-query-permission
           {:user-message (tru "You can''t save this chart because you don''t have permission to run its query.")
            :cause        e})
          (throw e))))))

(defn- chart-query
  "The query behind `chart`, a chart from agent memory, or nil when it has none."
  [chart]
  (or (first (:queries chart))
      (get (shared/current-queries-state) (:query_id chart))))

(defn- resolve-chart
  "Look up the generated chart from agent memory and return the pieces needed to
  build a card: a legacy `dataset_query` and a `display` keyword. Mirrors the
  lookup in `edit_chart` / `links/resolve-chart-link`."
  [chart-id]
  (let [charts (shared/current-charts-state)
        chart  (get charts chart-id)
        query  (chart-query chart)]
    (when-not query
      (recoverable.common/unknown-chart-id!
       {:chart-id  chart-id
        :available (sort (for [[id held] charts :when (chart-query held)] id))}))
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
      (no-personal-collection! {})))

(defn- collection-name
  "Current display name of a collection target, for the LLM-facing save summary.
  A `nil` id is the root (\"Our analytics\") collection."
  [collection-id]
  (if (nil? collection-id)
    (:name (collection/root-collection-with-ui-details nil))
    (metabot.db/collection-name collection-id)))

(defn- save-to-collection!
  [{:keys [name description dataset_query display destination]}]
  (let [collection-id (if (contains? destination :collection_id)
                        (:collection_id destination)
                        (personal-collection-id))]
    (when collection-id
      (tools/with-entity {:kind :collection :id collection-id}
        (api/read-check :model/Collection collection-id)))
    (check-writable! (cond-> {:kind :collection} collection-id (assoc :id collection-id))
                     #(api/create-check :model/Card {:collection_id collection-id}))
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
  (let [dashboard-id (:dashboard_id destination)
        dashboard    (tools/with-entity {:kind :dashboard :id dashboard-id}
                       (api/check-not-archived (api/read-check :model/Dashboard dashboard-id)))]
    (check-writable! {:kind :dashboard :id dashboard-id} #(api/write-check dashboard))
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
       :destination-name (metabot.db/dashboard-name dashboard-id)
       :link             (str "metabase://dashboard/" dashboard-id)})))

(defn- save-to-document!
  [{:keys [name description dataset_query display destination]}]
  (let [document-id (:document_id destination)
        document    (tools/with-entity {:kind :document :id document-id}
                      (api/check-not-archived (documents/get-document document-id :log-view? false)))]
    (check-writable! {:kind :document :id document-id} #(api/write-check document))
    (let [card (queries/create-card!
                {:name                   name
                 :description            description
                 :dataset_query          dataset_query
                 :display                display
                 :visualization_settings {}
                 :collection_id          (:collection_id document)
                 :document_id            document-id}
                {:id api/*current-user-id*}
                :delay-event)]
      (documents/add-card-to-document! document-id (:id card) (:position destination))
      {:card             card
       :destination      {:type "document" :id document-id}
       :destination-name (:name document)
       :link             (str "metabase://document/" document-id)})))

(defn- publish-card-create!
  "Publish the `:card-create` event for `card`, which is already committed. A failure is logged, not thrown."
  [card]
  (try
    (events/publish-event! :event/card-create {:object card :user-id api/*current-user-id*})
    (catch Exception e
      ;; Failing the call now would tell the agent nothing was saved, and its retry would save the card twice.
      (log/error e "Failed to publish the card-create event for a card Metabot saved" {:card-id (:id card)}))))

(def ^:private tool-description
  "What the model is told `save_entity` is."
  (str
   "Save a chart you previously created into a collection, a dashboard, or a document.\n"
   "\n"
   "ONLY call this when the user explicitly asks to save, keep, or add the chart\n"
   "somewhere. Reference the chart by the `chart_id` you were given when it was\n"
   "created. Provide a `name` and a concise `description` for the saved question\n"
   "(reuse the chart's description).\n"
   "\n"
   "Choose a `destination`:\n"
   "- To save into a collection, set `target_type` to `collection` and pass a\n"
   "  `collection_id`. Inspect available collections first with\n"
   "  `read_resource` on `metabase://collections?tree=true`. Omit `collection_id`\n"
   "  to use the user's personal collection; pass `null` for the root collection.\n"
   "- To add it to a dashboard, set `target_type` to `dashboard` and pass a\n"
   "  `dashboard_id`. Find dashboards with your search/discovery tool — if that tool is\n"
   "  `search`, restrict `entity_types` to the `dashboard` type. Only offer or use results\n"
   "  with `can_write=true`; results\n"
   "  with `can_write=false` are visible but read-only and cannot be save destinations.\n"
   "- To embed it in a document, set `target_type` to `document` and pass a\n"
   "  `document_id`. Find documents the same way — with `search`, restrict `entity_types` to\n"
   "  the `document` type, just as you would use the `dashboard` type to find dashboards. Search\n"
   "  using any name or topic the user provided. Before calling `save_entity`, you MUST call\n"
   "  `read_resource` on `metabase://document/{id}` for the selected result and inspect its\n"
   "  contents. Only save after that read succeeds and reports `can_write=true`. If it returns\n"
   "  `can_write=false`, an error, or Not found,\n"
   "  discard that search result and do not call `save_entity` with its id. If there are\n"
   "  multiple plausible targets, ask the user which one they mean. Optionally pass `position` — the 0-based index"
   " among the\n"
   "  document's top-level blocks where the chart is inserted (`0` puts it at the\n"
   "  very top). Omit `position` to append the chart at the end. To pick a\n"
   "  meaningful position, first inspect the document's blocks with\n"
   "  `read_resource` on `metabase://document/{id}`.\n"
   "\n"
   "If your only discovery tool returns library data entities (tables, models, metrics) rather\n"
   "than saved content, dashboards and documents aren't discoverable that way — save to a\n"
   "collection instead, or ask the user for the dashboard or document they mean.\n"
   "\n"
   "After saving, tell the user where it went and share the returned link."))

(defrecord SaveEntityTool []
  tools/Tool
  (declaration [_]
    {:name        "save_entity"
     :description tool-description
     :scope       scope/agent-question-create
     :args        save-entity-schema})

  (handle [_ {:keys [chart_id destination description] question-name :name} _ctx]
    (let [{:keys [dataset_query display]} (resolve-chart chart_id)
          _    (check-query-permissions! dataset_query)
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
                          "dashboard"  (save-to-dashboard! args)
                          "document"   (save-to-document! args))]
              (when-let [conversation-id (shared/current-conversation-id)]
                (metabot.db/link-card-to-conversation! (:id (:card saved)) conversation-id chart_id))
              saved))
          _ (publish-card-create! card)
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
                             :destination saved-destination
                             ;; markdown entity link the chain-of-thought renders
                             ;; as the settled "Saved …" step label
                             :title       (te/link question-name link)})]})))

(def save-entity-tool
  "`save_entity`: save a chart from this conversation as a question in a collection, dashboard or document."
  (->SaveEntityTool))
