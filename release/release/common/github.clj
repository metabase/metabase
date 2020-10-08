(ns release.common.github
  (:require [cheshire.core :as json]
            [clj-http.client :as http]
            [clojure.string :as str]
            [release.common :as c]))

(defn github-api-base []
  (str "https://api.github.com/repos/" (c/metabase-repo)))

(defn github-api-request-headers []
  {"Content-Type"  "application/json"
   "Authorization" (format "token %s" (c/env-or-throw :github-token))})

(defn milestones
  "Fetch open GitHub milestones for the current repo."
  []
  (-> (http/get (str (github-api-base) "/milestones") {:headers (github-api-request-headers)})
      :body
      (json/parse-string true)))

(defn matching-milestone
  "Return the GitHub milestone matching the version we're releasing, if any."
  []
  (some
   (fn [{:keys [title], :as milestone}]
     (when (str/starts-with? (c/version) title)
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
