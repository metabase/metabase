(ns metabase.slides.api.generate
  "`POST /api/slides/:id/agent` — streams the slide-deck-building agent as SSE.

   This is the only entry point for AI-driven generation. The agent has tools to
   search Metabase, inspect dashboards/cards, propose an outline, and write
   slides one at a time (each one a layout-template payload, see
   `metabase.slides.layouts`)."
  (:require
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.server.streaming-response :as streaming-response]
   [metabase.slides.agent :as slides.agent]
   [metabase.util.json :as json]
   [metabase.util.log :as log]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2])
  (:import
   (java.io OutputStream)))

(def ^:private AgentOptions
  [:map
   [:prompt ms/NonBlankString]
   [:dashboard_id {:optional true} [:maybe ms/PositiveInt]]
   [:card_ids {:optional true} [:maybe [:sequential ms/PositiveInt]]]])

(defn- sse-event!
  "Write one SSE event to the output stream."
  [^OutputStream os event]
  (let [bytes (.getBytes (str "event: " (or (:type event) "message")
                              "\ndata: " (json/encode event)
                              "\n\n"))]
    (.write os bytes 0 (alength bytes))
    (.flush os)))

#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :post "/:deck-id/agent"
  "Stream a slide-deck-building agent over SSE."
  [{:keys [deck-id]} :- [:map [:deck-id ms/PositiveInt]]
   _query-params
   {:keys [prompt dashboard_id card_ids]} :- AgentOptions]
  (let [deck (api/check-404 (t2/select-one :model/Slides :id deck-id))]
    (api/write-check deck)
    (let [user-id      api/*current-user-id*
          user-perms   @api/*current-user-permissions-set*
          current-user @api/*current-user*]
      (streaming-response/streaming-response
       {:content-type "text/event-stream; charset=utf-8"
        :headers      {"Cache-Control" "no-cache"
                       "X-Accel-Buffering" "no"
                       "Connection" "keep-alive"}}
       [os _canceled-chan]
        (binding [api/*current-user-id*              user-id
                  api/*current-user-permissions-set* (delay user-perms)
                  api/*current-user*                 (delay current-user)]
          (try
            (let [result (slides.agent/run-agent!
                          {:input    {:prompt       prompt
                                      :dashboard_id dashboard_id
                                      :card_ids     card_ids}
                           :on-event (fn [ev] (sse-event! os ev))})]
              (t2/update! :model/Slides deck-id
                          {:name   (:name result)
                           :slides (:slides result)})
              (sse-event! os {:type "saved" :deck_id deck-id}))
            (catch Exception e
              (log/warnf e "Slides agent crashed")
              (sse-event! os {:type "error" :message (or (.getMessage e) "Agent failed")}))
            (finally
              (sse-event! os {:type "end"}))))))))

(def ^{:arglists '([request respond raise])} routes
  "`/api/slides/:id/agent` routes."
  (api.macros/ns-handler *ns* +auth))
