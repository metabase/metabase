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
   [metabase.app-db.core :as mdb]
   [metabase.collections.db :as collections.db]
   [metabase.collections.models.collection :as collection]
   [metabase.dashboards.db :as dashboards.db]
   [metabase.documents.core :as documents]
   [metabase.events.core :as events]
   [metabase.metabot.agent.links :as links]
   [metabase.metabot.agent.streaming :as streaming]
   [metabase.metabot.db :as metabot.db]
   [metabase.metabot.scope :as scope]
   [metabase.metabot.tmpl :as te]
   [metabase.metabot.tools.core :as tools]
   [metabase.metabot.tools.error :as tools.error]
   [metabase.metabot.tools.recoverable.common :as recoverable.common]
   [metabase.metabot.tools.shared :as shared]
   [metabase.queries.core :as queries]
   [metabase.query-permissions.core :as query-perms]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.log :as log]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(def ^:private chart-id-schema
  "A chart ID must fit `report_card.metabot_chart_id`, a `varchar(36)`."
  [:string {:min 1 :max 36}])

(defn- h2-app-db?
  "Return whether the app DB is H2, which counts VARCHAR limits in UTF-16 units.
  PostgreSQL and MySQL count Unicode code points."
  []
  (= :h2 (mdb/db-type)))

(def ^:private save-entity-schema
  [:map {:closed true}
   [:chart_id chart-id-schema]
   [:name [:and {:json-schema {:type "string" :minLength 1 :maxLength 254}}
           :string
           [:fn {:error/fn (fn [{:keys [value]} _]
                             (if (mr/validate ms/NonBlankString value)
                               (str "must contain 1 to 254 "
                                    (if (h2-app-db?) "UTF-16 code units" "Unicode code points"))
                               "must be a non-blank string"))}
            (fn [^String s]
              (and (mr/validate ms/NonBlankString s)
                   (<= (if (h2-app-db?) (.length s) (.codePointCount s 0 (.length s))) 254)))]]]
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
  "The user has no personal collection to use when `collection_id` is omitted."
  {:payload [:map {:closed true}]}
  [_]
  {:message  "The user has no personal collection, so `collection_id` can't be omitted."
   :recovery [{:uses #{"read_resource"}
               :text (str "Read `metabase://collections?tree=true` with `read_resource` and pass the ID of a"
                          " collection with `can_write=true`.")}
              {:uses #{}
               :text "Or ask the user which collection to save it to."}]})

(tools/defrecoverable destination-not-writable!
  "The user can see the destination but cannot save to it."
  {:payload     [:or
                 [:map {:closed true}
                  [:kind [:enum :collection :dashboard :document]]
                  [:id   :int]
                  [:has-personal-collection? :boolean]]
                 ;; The root collection has no ID.
                 [:map {:closed true}
                  [:kind [:= :collection]]
                  [:has-personal-collection? :boolean]]]
   :status-code 403}
  [{:keys [kind id has-personal-collection?]}]
  {:message  (str "The user doesn't have permission to save to "
                  (if id (str (name kind) " " id) "the root collection") ".")
   :recovery [(if has-personal-collection?
                {:uses #{}
                 :text (str "Tell the user and offer to save the chart to their personal collection."
                            " Omit `collection_id` from a collection destination to use it.")}
                {:uses #{}
                 :text "Choose another collection, or ask the user which collection to save the chart to."})
              {:uses #{"read_resource"}
               :text (str "To offer another collection, read `metabase://collections?tree=true` with"
                          " `read_resource` and pick one with `can_write=true`.")}]})

(defn- check-writable!
  "Convert a 403 from `check` into [[destination-not-writable!]].
  `check` must be a write or create permission check for `destination`."
  [destination check]
  (try
    (check)
    (catch clojure.lang.ExceptionInfo e
      (if (= 403 (:status-code (ex-data e)))
        (destination-not-writable!
         (assoc destination :has-personal-collection?
                (some? (collection/user->personal-collection api/*current-user-id*))))
        (throw e)))))

(tools/defrecoverable save-rejected!
  "The save request was rejected with an API client error."
  {:payload [:map {:closed true} [:message :string]]}
  [{:keys [message]}]
  {:message message :recovery []})

(defn- do-with-save-rejections
  "Return `thunk`'s result, converting undeclared API 4xx failures into recoverable save errors."
  [thunk]
  (try
    (thunk)
    (catch clojure.lang.ExceptionInfo e
      (let [data (ex-data e)
            status-code (:status-code data)]
        (if (and (not (contains? data tools.error/error-key))
                 (int? status-code) (<= 400 status-code 499))
          (save-rejected! {:message (ex-message e)})
          (throw e))))))

(tools/defrecoverable invalid-query!
  "The query cannot be saved until its invalid content is corrected."
  {:payload [:map {:closed true} [:message :string]]}
  [{:keys [message]}]
  {:message message
   :recovery [{:uses #{"construct_notebook_query"}
               :text (str "Use `construct_notebook_query` to make a chart without the invalid query content,"
                          " then retry with its chart ID.")}]})

(defn- check-query-permissions!
  "Require permission to run `dataset-query`.
  A permission refusal ends the turn; invalid query content can be corrected by the agent."
  [dataset-query]
  (try
    (query-perms/check-run-permissions-for-query dataset-query)
    (catch clojure.lang.ExceptionInfo e
      (let [status-code (:status-code (ex-data e))]
        (cond
          (= 403 status-code)
          (tools/unrecoverable!
           ::no-query-permission
           {:user-message (tru "You can''t save this chart because you don''t have permission to run its query.")
            :cause        e})

          (and (int? status-code) (<= 400 status-code 499))
          (invalid-query! {:message (ex-message e)})

          :else
          (throw e))))))

(defn- chart-query
  "Return the query for `chart`, or nil if none is available."
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
        :available (sort (for [[id held] charts
                               :when (and (mr/validate chart-id-schema id) (chart-query held))]
                           id))}))
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
    (:name (collections.db/collection collection-id))))

(tools/defrecoverable destination-archived!
  "The destination is in the trash."
  {:payload [:map {:closed true}
             [:kind [:enum :dashboard :document]]
             [:id :int]]
   :status-code 404}
  [{:keys [kind id]}]
  {:message (str (case kind :dashboard "Dashboard" :document "Document") " " id " is in the trash.")
   :recovery [{:uses #{}
               :text "Ask the user to restore it or choose another destination."}]})

(defn- check-not-archived!
  "Reject a destination in the trash and return it otherwise."
  [destination entity]
  (when (:archived entity)
    (destination-archived! destination))
  entity)

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
        dashboard    (check-not-archived!
                      {:kind :dashboard :id dashboard-id}
                      (tools/with-entity {:kind :dashboard :id dashboard-id}
                        (api/read-check :model/Dashboard dashboard-id)))]
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
       :destination-name (:name (dashboards.db/dashboard dashboard-id))
       :link             (str "metabase://dashboard/" dashboard-id)})))

(defn- save-to-document!
  [{:keys [name description dataset_query display destination]}]
  (let [document-id (:document_id destination)
        document    (check-not-archived!
                     {:kind :document :id document-id}
                     (tools/with-entity {:kind :document :id document-id}
                       (documents/get-document document-id :log-view? false)))]
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
  "Publish the `:event/card-create` event for a card that has already been committed.
  Log failures without throwing."
  [card]
  (try
    (events/publish-event! :event/card-create {:object card :user-id api/*current-user-id*})
    (catch Exception e
      ;; The agent may retry a failed call and save a second copy of the card.
      (log/error e "Failed to publish the card-create event for a card saved by Metabot" {:card-id (:id card)}))))

(def ^:private tool-description
  "Describe how to call `save_entity`."
  (str
   "Save a chart to a collection, dashboard or document. Use a chart that you previously created.\n"
   "\n"
   "ONLY call this when the user explicitly asks to save, keep or add the chart somewhere.\n"
   "Use the `chart_id` that you received when the chart was created. Provide a `name` and a concise\n"
   "`description` for the saved question, reusing the chart's description.\n"
   "\n"
   "Choose a `destination`:\n"
   "- To save into a collection, set `target_type` to `collection` and pass a\n"
   "  `collection_id`. Inspect available collections first with\n"
   "  `read_resource` on `metabase://collections?tree=true`. Omit `collection_id`\n"
   "  to use the user's personal collection; pass `null` for the root collection.\n"
   "- To add it to a dashboard, set `target_type` to `dashboard` and pass a\n"
   "  `dashboard_id`. Find dashboards with your search or discovery tool. If you use `search`,\n"
   "  restrict `entity_types` to the `dashboard` type. Only offer or use results with `can_write=true`;\n"
   "  results with `can_write=false` are visible but read-only and cannot be save destinations.\n"
   "- To embed it in a document, set `target_type` to `document` and pass a\n"
   "  `document_id`. Find documents with your search or discovery tool. If you use `search`,\n"
   "  restrict `entity_types` to the `document` type and search using any name or topic that the\n"
   "  user provided. Before calling `save_entity`, you MUST call `read_resource` on\n"
   "  `metabase://document/{id}` for the selected result and inspect its contents. Only save after\n"
   "  that read succeeds and reports `can_write=true`. If it returns `can_write=false`, an error\n"
   "  or Not found, discard the result and do not call `save_entity` with its ID. Ask the user\n"
   "  which document they mean if several results are plausible. You can pass `position`, the\n"
   "  0-based index among the document's top-level blocks where the chart is inserted (`0` puts\n"
   "  it at the top). Omit `position` to append the chart at the end. Read the document's blocks\n"
   "  with `read_resource` on `metabase://document/{id}` before choosing a position.\n"
   "\n"
   "If your only discovery tool returns library data entities (tables, models or metrics), it\n"
   "cannot find dashboards or documents. Save to a collection instead, or ask the user for the\n"
   "dashboard or document they mean.\n"
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
          (do-with-save-rejections
           #(t2/with-transaction [_conn]
              (let [saved (case (:target_type destination)
                            "collection" (save-to-collection! args)
                            "dashboard"  (save-to-dashboard! args)
                            "document"   (save-to-document! args))]
                (when-let [conversation-id (shared/current-conversation-id)]
                  (metabot.db/link-card-to-conversation! (:id (:card saved)) conversation-id chart_id))
                saved)))
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
  "Save a chart from this conversation as a question in a collection, dashboard or document."
  (->SaveEntityTool))
