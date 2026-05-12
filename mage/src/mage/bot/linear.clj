(ns mage.bot.linear
  (:require
   [babashka.http-client :as http]
   [babashka.json :as json]
   [clojure.string :as str]
   [mage.bot.env :as bot-env]
   [mage.color :as c]
   [mage.util :as u]))

(set! *warn-on-reflection* true)

(def ^:private linear-api-url "https://api.linear.app/graphql")

(defn- get-api-key!
  "Get LINEAR_API_KEY using shared env resolution. Exit with instructions if not found."
  []
  (or (bot-env/resolve-env "LINEAR_API_KEY")
      (do
        (println (c/red "LINEAR_API_KEY not found in mise.local.toml, .env, .lein-env, or environment."))
        (println)
        (println "To get a Linear API key:")
        (println "  1. Go to https://linear.app/metabase/settings/account/security/api-keys/new")
        (println "  2. Create a personal API key")
        (println "  3. Add it to .env: LINEAR_API_KEY=lin_api_...")
        (u/exit 1))))

(def ^:private issue-query
  "query IssueByIdentifier($id: String!) {
     issue(id: $id) {
       identifier
       title
       description
       url
       branchName
       state { name }
       comments {
         nodes {
           body
           user { name }
           createdAt
         }
       }
     }
   }")

(defn fetch-issue
  "Fetch a Linear issue by identifier (e.g. MB-12345).
   Returns a map with :identifier, :title, :description, :url, :state, :comments
   or nil if not found."
  [issue-id]
  (let [api-key  (get-api-key!)
        payload  (json/write-str {:query     issue-query
                                  :variables {:id issue-id}})
        resp     (try
                   (http/post linear-api-url
                              {:headers {"Content-Type"  "application/json"
                                         "Authorization" api-key}
                               :body    payload
                               :throw   false})
                   (catch Exception e
                     (println (c/red "Linear API request failed: ") (.getMessage e))
                     (u/exit 1)))
        response (json/read-str (:body resp) {:key-fn keyword})]
    (when-let [errors (:errors response)]
      (println (c/red "Linear API error:") (pr-str errors))
      (u/exit 1))
    (when-let [issue (get-in response [:data :issue])]
      {:identifier  (:identifier issue)
       :title       (:title issue)
       :description (or (:description issue) "")
       :url         (:url issue)
       :branch-name (:branchName issue)
       :state       (get-in issue [:state :name])
       :comments    (mapv (fn [c]
                            {:body       (:body c)
                             :author     (get-in c [:user :name])
                             :created-at (:createdAt c)})
                          (get-in issue [:comments :nodes]))})))

(defn print-issue!
  "Fetch and print a Linear issue. Entry point for the CLI task."
  [{:keys [arguments]}]
  (let [issue-id (first arguments)]
    (when (str/blank? issue-id)
      (println (c/red "Usage: ./bin/mage -fixbot-fetch-issue MB-12345"))
      (u/exit 1))
    (let [issue-id (str/upper-case (str/trim issue-id))]
      (when-not (re-matches #"[A-Z]+-\d+" issue-id)
        (println (c/red "Invalid issue identifier: " issue-id))
        (println "Expected format: MB-12345")
        (u/exit 1))
      (println (c/yellow "Fetching " issue-id "..."))
      (if-let [issue (fetch-issue issue-id)]
        (do
          (println)
          (println (c/bold (c/green (:identifier issue))) " — " (c/bold (:title issue)))
          (println (c/cyan (:url issue)))
          (println (c/yellow "State: ") (:state issue))
          (println (c/yellow "Branch: ") (:branch-name issue))
          (println)
          (println (c/bold "Description:"))
          (println (:description issue))
          (when (seq (:comments issue))
            (println)
            (println (c/bold "Comments:"))
            (doseq [comment (:comments issue)]
              (println)
              (println (c/cyan (:author comment)) " — " (:created-at comment))
              (println (:body comment)))))
        (do
          (println (c/red "Issue not found: " issue-id))
          (u/exit 1))))))
