(ns metabase.cmd.endpoint-dox-test
  (:require [metabase.cmd.endpoint-dox :as endpoint-dox]
            [clojure.test :refer :all]))

(def endpoints {"Activity"
                [{:ns (find-ns 'metabase.api.activity),
                  :name "GET_",
                  :file "metabase/api/activity.clj",
                  :ns-name "Activity",
                  :column 1,
                  :is-endpoint? true,
                  :line 61,
                  :endpoint-str "### `GET /api/activity/`",
                  :doc "### `GET /api/activity/`\n\nGet recent activity."}
                 {:ns (find-ns 'metabase.api.activity),
                  :name "GET_recent_views",
                  :file "metabase/api/activity.clj",
                  :ns-name "Activity",
                  :column 1,
                  :is-endpoint? true,
                  :line 76,
                  :endpoint-str "### `GET /api/activity/recent_views`",
                  :doc
                  "### `GET /api/activity/recent_views`\n\nGet the list of 10 things the current user has been viewing most recently."}]})

(def section-markdown "## Activity\n\n  - [GET /api/activity/](#get-apiactivity)\n  - [GET /api/activity/recent_views](#get-apiactivityrecentviews)\n\n### `GET /api/activity/`\n\nGet recent activity.\n\n### `GET /api/activity/recent_views`\n\nGet the list of 10 things the current user has been viewing most recently.")

(deftest endpoint-section-test
  (is (= (first (endpoint-dox/endpoint-section endpoints))
         section-markdown)))

