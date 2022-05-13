(ns metabase.cmd.endpoint-dox-test
  (:require [clojure.test :refer :all]
            [metabase.cmd.endpoint-dox :as endpoint-dox]
            [metabase.config :as config]))

(def endpoints {"Activity"
                [{:ns (find-ns 'metabase.api.activity),
                  :name "GET_",
                  :file "metabase/api/activity.clj",
                  :ns-name "Activity",
                  :column 1,
                  :is-endpoint? true,
                  :line 61,
                  :endpoint-str "## `GET /api/activity/`",
                  :doc "## `GET /api/activity/`\n\nGet recent activity."}
                 {:ns (find-ns 'metabase.api.activity),
                  :name "GET_recent_views",
                  :file "metabase/api/activity.clj",
                  :ns-name "Activity",
                  :column 1,
                  :is-endpoint? true,
                  :line 76,
                  :endpoint-str "## `GET /api/activity/recent_views`",
                  :doc
                  "## `GET /api/activity/recent_views`\n\nGet the list of 10 things the current user has been viewing most recently."}]})

(def page-markdown "# Activity\n\n  - [GET /api/activity/](#get-apiactivity)\n  - [GET /api/activity/recent_views](#get-apiactivityrecent_views)\n\n## `GET /api/activity/`\n\nGet recent activity.\n\n## `GET /api/activity/recent_views`\n\nGet the list of 10 things the current user has been viewing most recently.")

(deftest endpoint-page-test
  (testing "Markdown for a generated docs page."
    ;; Note that if we change the Activity endpoint (or introduce another endpoint before Activity,
    ;; we may need to update the page-markdown string above.
  (is (= (first (for [[ep ep-data] endpoints] (endpoint-dox/endpoint-page ep ep-data)))
         page-markdown)))

(deftest include-ee-test
  (testing "Enterprise API endpoints should be included (#22396)"
    (when config/ee-available?
      (is (some (fn [an-endpoint]
                  ;; this is just a random EE endpoint namespace; if it gets moved or removed just pick a different
                  ;; namespace here I guess
                  (when (= (the-ns 'metabase-enterprise.advanced-permissions.api.application)
                           (:ns an-endpoint))
                    an-endpoint))
                (#'endpoint-dox/collect-endpoints))))))
