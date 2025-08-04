(ns metabase-enterprise.metabot-v3.agentic-question-creation
  "Agentic question creation functionality."
  (:require
   [buddy.core.hash :as buddy-hash]
   [buddy.sign.jwt :as jwt]
   [clj-http.client :as http]
   [clj-time.core :as time]
   [metabase-enterprise.metabot-v3.client :as metabot-v3.client]
   [metabase-enterprise.metabot-v3.config :as metabot-v3.config]
   [metabase-enterprise.metabot-v3.settings :as metabot-v3.settings]
   [metabase.api.common :as api]
   [metabase.premium-features.core :as premium-features]
   [metabase.system.core :as system]
   [metabase.util.json :as json]
   [metabase.util.log :as log]))

(defn- get-ai-service-token
  [user-id metabot-id]
  (let [secret (buddy-hash/sha256 (metabot-v3.settings/site-uuid-for-metabot-tools))
        claims {:user user-id
                :exp (time/plus (time/now) (time/seconds (metabot-v3.settings/metabot-ai-service-token-ttl)))
                :metabot-id metabot-id}]
    (jwt/encrypt claims secret)))

(defn create-question-from-prompt
  "Create a question using the agentic workflow from a natural language prompt."
  [{:keys [prompt auto-execute]
    :or {auto-execute true}}]
  (try
    (let [metabot-id metabot-v3.config/internal-metabot-id
          session-token (get-ai-service-token api/*current-user-id* metabot-id)
          url (str (metabot-v3.settings/ai-service-base-url) "/v1/agentic-question-creation")
          body {:prompt prompt
                :auto_execute auto-execute}
          options {:headers {"Accept" "application/json"
                            "Content-Type" "application/json;charset=UTF-8"
                            "x-metabase-instance-token" (premium-features/premium-embedding-token)
                            "x-metabase-session-token" session-token
                            "x-metabase-url" (system/site-url)}
                  :body (json/encode body)
                  :throw-exceptions false}
          response (http/post url options)]
      (if (= (:status response) 200)
        (json/decode (:body response) true)
        (do
          (log/error "Failed to create question from prompt" {:status (:status response) :body (:body response)})
          {:question_id nil
           :message (format "Error: %s" (:body response))
           :success false})))
    (catch Exception e
      (log/error e "Exception in agentic question creation")
      {:question_id nil
       :message (format "Error: %s" (.getMessage e))
       :success false})))