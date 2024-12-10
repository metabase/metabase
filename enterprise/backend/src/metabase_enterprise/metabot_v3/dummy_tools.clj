(ns metabase-enterprise.metabot-v3.dummy-tools
  (:require
   [cheshire.core :as json]
   [metabase-enterprise.metabot-v3.tools.create-dashboard-subscription]
   [metabase-enterprise.metabot-v3.tools.query]
   [metabase-enterprise.metabot-v3.tools.who-is-your-favorite]
   [metabase.api.common :as api]
   [toucan2.core :as t2]))

(defn- get-current-user
  [_ _ context]
  {:output (if-let [{:keys [id email first_name last_name]}
                    (or (some-> api/*current-user* deref)
                        (t2/select-one [:model/User :id :email :first_name :last_name] api/*current-user-id*))]
             {:id id
              :name (str first_name " " last_name)
              :email_address email}
             {:error "current user not found"})
   :context context})

(defn- get-dashboard-details
  [_ {:keys [dashboard_id]} context]
  {:output (or (t2/select-one [:model/Dashboard :id :description :name] dashboard_id)
               {:error "dashboard not found"})
   :context context})

(defn- dummy-tool-messages
  [tool-id arguments content]
  (let [call-id (random-uuid)]
    [{:content    nil
      :role       :assistant,
      :tool_calls [{:id        call-id
                    :name      tool-id
                    :arguments (json/generate-string arguments)}]}

     {:content      (json/generate-string content)
      :role         :tool,
      :tool_call_id call-id}]))

(defn- dummy-get-current-user
  [context]
  (let [content (:output (get-current-user :get-current-user {} context))]
    (dummy-tool-messages :get-current-user {} content)))

(defn- dummy-get-dashboard-details
  [context]
  (reduce (fn [messages viewed]
            (if-let [dashboard-id (when (= (:type viewed) :dashboard)
                                    (:ref viewed))]
              (let [arguments {:dashboard_id dashboard-id}
                    content (-> (get-dashboard-details :get-dashboard-details arguments context)
                                :output)]
                (into messages (dummy-tool-messages :get-dashboard-details arguments content)))
              messages))
          []
          (:user-is-viewing context)))

(def ^:private dummy-tool-registry
  [dummy-get-current-user
   dummy-get-dashboard-details])

(defn invoke-dummy-tools
  "Invoke `tool` with `context` if applicable and return the resulting context."
  [context]
  (let [context (or (not-empty context)
                    ;; for testing purposes, pretend the user is viewing dashboard with ID 14
                    {:user-is-viewing [{:type :dashboard
                                        :ref 14
                                        :parameters []
                                        :is-embedded false}]})]
    (reduce (fn [messages tool]
              (into messages (tool context)))
            []
            dummy-tool-registry)))
