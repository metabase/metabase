(ns metabase.slides.api.generate
  "`/api/slides/:id/agent` (streaming agent) and `/api/slides/generate` (legacy
   one-shot)."
  (:require
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.server.streaming-response :as streaming-response]
   [metabase.slides.agent :as slides.agent]
   [metabase.slides.ai :as slides.ai]
   [metabase.util.json :as json]
   [metabase.util.log :as log]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2])
  (:import
   (java.io OutputStream)))

;;; --------------------------------------- /api/slides/generate (one-shot) ------------------------------------------

(def ^:private GenerateOptions
  [:map
   [:prompt ms/NonBlankString]
   [:card_ids {:optional true} [:maybe [:sequential ms/PositiveInt]]]
   [:dashboard_ids {:optional true} [:maybe [:sequential ms/PositiveInt]]]])

(defn- readable [entities]
  (filter (fn [e] (try (api/read-check e) true (catch Exception _ false))) entities))

(defn- fetch-cards [card-ids]
  (when (seq card-ids)
    (readable (t2/select [:model/Card :id :name :description :display :collection_id :card_schema]
                         :id [:in card-ids] :archived false))))

(defn- fetch-dashboards [dashboard-ids]
  (when (seq dashboard-ids)
    (readable (t2/select [:model/Dashboard :id :name :description :collection_id]
                         :id [:in dashboard-ids] :archived false))))

(defn- cards-on-dashboards [dashboards]
  (when (seq dashboards)
    (let [ids (->> (t2/select [:model/DashboardCard :card_id]
                              :dashboard_id [:in (map :id dashboards)])
                   (keep :card_id) distinct)]
      (fetch-cards ids))))

(defn- dedupe-by-id [xs]
  (->> xs (group-by :id) vals (map first)))

#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :post "/generate"
  "One-shot deck generation. Kept for fallback / scripts."
  [_route-params
   _query-params
   {:keys [prompt card_ids dashboard_ids]} :- GenerateOptions]
  (let [picked     (fetch-cards card_ids)
        dashboards (fetch-dashboards dashboard_ids)
        cards      (dedupe-by-id (concat picked (cards-on-dashboards dashboards)))]
    (slides.ai/generate-deck {:prompt prompt :cards cards :dashboards dashboards})))

;;; ----------------------------------------- /api/slides/:id/agent (SSE) -------------------------------------------

(def ^:private AgentOptions
  [:map
   [:prompt ms/NonBlankString]
   [:dashboard_id {:optional true} [:maybe ms/PositiveInt]]
   [:card_ids {:optional true} [:maybe [:sequential ms/PositiveInt]]]])

(defn- sse-event!
  "Write one SSE event to the output stream. Each event is `event: <type>\\ndata: <json>\\n\\n`."
  [^OutputStream os event]
  (let [bytes (.getBytes (str "event: " (or (:type event) "message")
                              "\ndata: " (json/encode event)
                              "\n\n"))]
    (.write os bytes 0 (alength bytes))
    (.flush os)))

#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :post "/:deck-id/agent"
  "Stream a slide-deck-building agent over SSE.

   The agent has tools to search Metabase, inspect dashboards/cards, propose an
   outline, and write slides one at a time. Each step emits an SSE event so the
   client can show progress live."
  [{:keys [deck-id]} :- [:map [:deck-id ms/PositiveInt]]
   _query-params
   {:keys [prompt dashboard_id card_ids]} :- AgentOptions]
  (let [deck (api/check-404 (t2/select-one :model/Slides :id deck-id))]
    (api/write-check deck)
    (let [user-id    api/*current-user-id*
          user-perms @api/*current-user-permissions-set*
          current-user @api/*current-user*]
      (streaming-response/streaming-response
       {:content-type "text/event-stream; charset=utf-8"
        :headers      {"Cache-Control" "no-cache"
                       "X-Accel-Buffering" "no"
                       "Connection" "keep-alive"}}
       [os _canceled-chan]
        (binding [api/*current-user-id* user-id
                  api/*current-user-permissions-set* (delay user-perms)
                  api/*current-user* (delay current-user)]
          (try
            (let [result (slides.agent/run-agent!
                          {:input {:prompt prompt
                                   :dashboard_id dashboard_id
                                   :card_ids card_ids}
                           :on-event (fn [ev] (sse-event! os ev))})]
              ;; Persist the final deck
              (t2/update! :model/Slides deck-id
                          {:name (:name result)
                           :slides (:slides result)})
              (sse-event! os {:type "saved" :deck_id deck-id}))
            (catch Exception e
              (log/warnf e "Slides agent crashed")
              (sse-event! os {:type "error"
                              :message (or (.getMessage e) "Agent failed")}))
            (finally
              (sse-event! os {:type "end"}))))))))

(def ^{:arglists '([request respond raise])} routes
  "`/api/slides/{generate,*/agent}` routes."
  (api.macros/ns-handler *ns* +auth))
