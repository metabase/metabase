(ns metabase.help-assistant.api
  "`/api/help-assistant` endpoints for the prototype Help page assistant."
  (:require
   [clojure.core.async :as a]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.help-assistant.core :as help-assistant]
   [metabase.server.streaming-response :as sr]
   [metabase.util.json :as json]
   [metabase.util.log :as log])
  (:import
   (java.io IOException OutputStream)))

(set! *warn-on-reflection* true)

(def ^:private Source
  [:map {:closed true}
   [:title :string]
   [:url :string]])

(def ^:private Step
  "One thing the assistant did to get an answer: load a skill, search the docs, read a page, check this instance, or
  run out of steps. `:earlier` marks a skill loaded earlier in the conversation. `:check` says what a `check` step
  looked at; its `:label` is the keyword or database it checked, or empty."
  [:map {:closed true}
   [:type [:enum "skill" "search" "read" "check" "limit"]]
   [:label :string]
   [:skill_id {:optional true} :string]
   [:url {:optional true} :string]
   [:check {:optional true} [:enum "logs" "databases" "email_sso" "subscriptions"]]
   [:earlier {:optional true} :boolean]])

(def ^:private ChatRequest
  [:map {:closed true}
   [:messages [:sequential [:map {:closed true}
                            [:role [:enum "user" "assistant"]]
                            [:content :string]]]]
   [:diagnostic_info {:optional true} [:maybe :string]]
   [:loaded_skills {:optional true} [:maybe [:sequential :string]]]
   ;; lets the assistant check this instance's logs, databases and email and sign-in settings
   [:instance_access {:optional true} [:maybe :boolean]]])

(def ^:private ChatResponse
  [:map {:closed true}
   [:reply :string]
   [:sources [:sequential Source]]
   [:steps [:sequential Step]]])

(defn- chat-request [body]
  {:messages         (:messages body)
   :diagnostic-info  (:diagnostic_info body)
   :loaded-skills    (:loaded_skills body)
   :instance-access? (boolean (:instance_access body))})

(api.macros/defendpoint :post "/chat" :- ChatResponse
  "Send the conversation so far to the Help page assistant and get its reply. Admins only."
  [_route-params
   _query-params
   body :- ChatRequest]
  (api/check-superuser)
  (help-assistant/chat (chat-request body)))

(def ^:private ChatEvent
  [:multi {:dispatch :type}
   ["step" [:map [:type [:= "step"]] [:step Step]]]
   ["answer" [:map
              [:type [:= "answer"]]
              [:reply :string]
              [:sources [:sequential Source]]
              [:steps [:sequential Step]]]]
   ["error" [:map
             [:type [:= "error"]]
             [:message :string]
             [:status_code :int]]]])

(defn- sse-line ^String [payload]
  (str "data: " (if (string? payload) payload (json/encode payload)) "\n\n"))

(api.macros/defendpoint :post "/chat/stream" :- (sr/streaming-response-schema ChatEvent)
  "Like `POST /chat`, but streams Server-Sent Events while the assistant works: a `step` event for each step as it
  happens, then an `answer` event with the reply, sources and steps, or an `error` event. The stream ends with
  `[DONE]`. When the client disconnects, the assistant stops. Admins only."
  [_route-params
   _query-params
   body :- ChatRequest]
  (api/check-superuser)
  (sr/streaming-response {:content-type "text/event-stream"} [^OutputStream os canceled-chan]
    (let [disconnected? (volatile! false)
          canceled?     #(or @disconnected? (some? (a/poll! canceled-chan)))
          write!        (fn [payload]
                          ;; steps are written from tool calls, which may run on other threads
                          (locking os
                            (when-not (canceled?)
                              (try
                                (.write os (.getBytes (sse-line payload) "UTF-8"))
                                (.flush os)
                                (catch IOException _
                                  (vreset! disconnected? true))))))]
      (try
        (when-let [result (help-assistant/chat (assoc (chat-request body)
                                                      :on-step   #(write! {:type "step", :step %})
                                                      :canceled? canceled?))]
          (write! (assoc result :type "answer")))
        (catch Exception e
          (let [status-code (or (:status-code (ex-data e)) 500)]
            (when (>= status-code 500)
              (log/error e "Help assistant: chat failed"))
            (write! {:type        "error"
                     :message     (or (ex-message e) "The assistant didn't respond.")
                     :status_code status-code}))))
      (write! "[DONE]"))))

(api.macros/defendpoint :post "/feedback" :- :nil
  "Rate one of the Help page assistant's answers. Admins only."
  [_route-params
   _query-params
   body :- [:map {:closed true}
            [:positive :boolean]
            [:comment {:optional true} [:maybe :string]]
            [:question :string]
            [:answer :string]
            [:sources {:optional true} [:sequential Source]]]]
  (api/check-superuser)
  (help-assistant/log-feedback! body)
  nil)

(api.macros/defendpoint :get "/settings" :- [:map {:closed true}
                                             [:flags_enabled :boolean]]
  "Which optional Help page assistant features are on. Admins only."
  []
  (api/check-superuser)
  {:flags_enabled (some? (help-assistant/flags-dir))})

(api.macros/defendpoint :post "/flag" :- [:map {:closed true}
                                          [:file :string]]
  "Save a chat for review, to turn into an eval case. The chat ends with the flagged answer. Only works when
  `MB_HELP_ASSISTANT_FLAGS_DIR` is set. Admins only."
  [_route-params
   _query-params
   body :- [:map {:closed true}
            [:note :string]
            [:messages [:sequential {:min 1} [:map {:closed true}
                                              [:role [:enum "user" "assistant"]]
                                              [:content :string]
                                              [:steps {:optional true} [:maybe [:sequential Step]]]]]]]]
  (api/check-superuser)
  {:file (help-assistant/save-flag! body)})
