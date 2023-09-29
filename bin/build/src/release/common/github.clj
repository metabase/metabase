(ns release.common.github
  (:require
   [cheshire.core :as json]
   [clj-http.client :as http]
   [clojure.string :as str]
   [metabuild-common.core :as u]
   [release.common :as c]))

(defn github-api-base
  "First part of the URL for the GitHub API."
  []
  (str "https://api.github.com/repos/" (c/metabase-repo)))

(defn github-api-request-headers
  "Headers to send when making GitHub API requests."
  []
  {"Content-Type"  "application/json"
   "Authorization" (format "token %s" (u/env-or-throw :github-token))})

(defn- GET [endpoint]
  (-> (http/get (str (github-api-base) endpoint) {:headers (github-api-request-headers)})
      :body
      (json/parse-string true)))

(defn milestones
  "Fetch open GitHub milestones for the current repo."
  []
  (GET "/milestones"))

(defn matching-milestone
  "Return the GitHub milestone matching the version we're releasing, if any."
  []
  (some
   (fn [{:keys [title], :as milestone}]
     (when (str/starts-with? (c/github-milestone) title)
       milestone))
   (milestones)))

(defn milestone-issues
  "Fetch the issues in the GitHub `milestone` corresponding to this release."
  []
  (when-let [{milestone-number :number} (matching-milestone)]
    (-> (http/get (format "%s/issues?milestone=%d&state=closed" (github-api-base) milestone-number)
                  {:headers (github-api-request-headers)})
        :body
        (json/parse-string true))))

(defn issue-type
  "Whether this issue is a `:bug` (if it has a `Type:Bug` tag) or `:enhancement` (if it does not)."
  [{:keys [labels]}]
  (if (some
       (fn [{label-name :name}]
         (= label-name "Type:Bug"))
       labels)
    :bug
    :enhancement))

(defn recent-tags
  "Recent tags (as a sequence of tag strings) from the GitHub API."
  []
  (map :tag_name (GET "/releases")))
