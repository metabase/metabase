(ns mage.bot.linear
  (:require
   [babashka.json :as json]
   [clojure.edn :as edn]
   [clojure.string :as str]
   [mage.color :as c]
   [mage.shell :as shell]
   [mage.util :as u]))

(set! *warn-on-reflection* true)

(def ^:private linear-api-url "https://api.linear.app/graphql")

(defn- read-dot-env-key
  "Read a key from the .env file in the project root."
  [key-name]
  (let [path (str u/project-root-directory "/.env")]
    (when (.exists (java.io.File. ^String path))
      (some (fn [line]
              (let [trimmed (str/trim line)]
                (when (and (seq trimmed)
                           (not (str/starts-with? trimmed "#")))
                  (when-let [[_ k v] (re-matches #"(\w+)\s*=\s*(.*)" trimmed)]
                    (when (= k key-name) v)))))
            (str/split-lines (slurp path))))))

(defn- read-lein-env-key
  "Read a key from .lein-env (EDN with keyword keys, e.g. :linear-api-key)."
  [key-name]
  (let [path (str u/project-root-directory "/.lein-env")]
    (when (.exists (java.io.File. ^String path))
      (try
        (let [m (edn/read-string (slurp path))
              kw (keyword (-> key-name
                              str/lower-case
                              (str/replace "_" "-")))]
          (some-> (get m kw) str))
        (catch Exception _e nil)))))

(defn- get-api-key!
  "Get LINEAR_API_KEY from env, .env, or .lein-env. Exit with instructions if not found."
  []
  (or (u/env "LINEAR_API_KEY" (constantly nil))
      (read-dot-env-key "LINEAR_API_KEY")
      (read-lein-env-key "LINEAR_API_KEY")
      (do
        (println (c/red "LINEAR_API_KEY not found in environment, .env, or .lein-env."))
        (println)
        (println "To get a Linear API key:")
        (println "  1. Go to https://linear.app/metabase/settings/account/security/api-keys/new")
        (println "  2. Create a personal API key")
        (println "  3. Add it to .env: LINEAR_API_KEY=lin_api_...")
        (u/exit 1))))

(def ^:private issue-query
  "query IssueByIdentifier($id: String!) {
     searchIssues(term: $id, first: 1) {
       nodes {
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
        result   (shell/sh* {:quiet? true}
                            "curl" "-s" "-X" "POST"
                            linear-api-url
                            "-H" "Content-Type: application/json"
                            "-H" (str "Authorization: " api-key)
                            "-d" payload)
        response (json/read-str (str/join "\n" (:out result))
                                {:key-fn keyword})]
    (when-let [errors (:errors response)]
      (println (c/red "Linear API error:") (pr-str errors))
      (u/exit 1))
    (let [nodes (get-in response [:data :searchIssues :nodes])]
      (when (seq nodes)
        (let [issue (first nodes)]
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
                              (get-in issue [:comments :nodes]))})))))

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
