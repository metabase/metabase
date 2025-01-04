(ns metabase.cmd.endpoint-dox.yaml-test
  (:require
   [clojure.test :refer :all]
   [metabase.api.activity]
   [metabase.cmd.endpoint-dox.yaml :as endpoint-dox.yaml]))

(comment metabase.api.activity/keep-me)

(def ^:private page
  {:name      "Activity"
   :ns        (find-ns 'metabase.api.activity)
   :paid?     false
   :endpoints [{:ns (find-ns 'metabase.api.activity)
                :metabase.cmd.endpoint-dox.metadata/sort-key [:get "/"]
                :name "GET_"
                :file "metabase/api/activity.clj"
                :ns-name "Activity"
                :column 1
                :is-endpoint? true
                :line 61
                :endpoint-str "## `GET /api/activity/`"
                :doc "## `GET /api/activity/`\n\nGet recent activity."}
               {:ns (find-ns 'metabase.api.activity)
                :metabase.cmd.endpoint-dox.metadata/sort-key [:get "/recent_views"]
                :name "GET_recent_views"
                :file "metabase/api/activity.clj"
                :ns-name "Activity"
                :column 1
                :is-endpoint? true
                :line 76
                :endpoint-str "## `GET /api/activity/recent_views`"
                :doc
                "## `GET /api/activity/recent_views`\n\nGet the list of 10 things the current user has been viewing most recently."}]})

(deftest ^:parallel build-endpoint-link-test
  (testing "Links to endpoint pages are generated correctly."
    (is (= "- [Activity](api/activity.md)"
           (#'endpoint-dox.yaml/build-endpoint-link page)))))

(deftest ^:parallel page-test
  (testing "Endpoint pages are formatted correctly."
    (is (= (str "---\ntitle: \"Activity\"\nsummary: |\n  API endpoints for Activity.\n---\n\n# Activity\n\nAPI endpoints for Activity.\n\n## `GET /api/activity/`\n\nGet recent activity.\n\n## `GET /api/activity/recent_views`\n\nGet the list of 10 things the current user has been viewing most recently."
                (#'endpoint-dox.yaml/endpoint-footer page))
           (endpoint-dox.yaml/page page)))))
