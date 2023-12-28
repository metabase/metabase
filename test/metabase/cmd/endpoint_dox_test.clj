(ns metabase.cmd.endpoint-dox-test
  (:require
   [clojure.test :refer :all]
   [metabase.api.activity]
   [metabase.cmd.endpoint-dox :as endpoint-dox]
   [metabase.config :as config]))

(deftest capitalize-initialisms-test
  (testing "Select initialisms and acronyms are in all caps."
    (is (= "The GeoJSON has too many semicolons."
           (endpoint-dox/capitalize-initialisms "The Geojson has too many semicolons." endpoint-dox/initialisms)))))

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

(def page-markdown (str "---\ntitle: \"Activity\"\nsummary: |\n  API endpoints for Activity.\n---\n\n# Activity\n\nAPI endpoints for Activity.\n\n## `GET /api/activity/`\n\nGet recent activity.\n\n## `GET /api/activity/recent_views`\n\nGet the list of 10 things the current user has been viewing most recently." (endpoint-dox/endpoint-footer (val (first endpoints)))))

(deftest build-endpoint-link-test
  (testing "Links to endpoint pages are generated correctly."
    (let [[ep ep-data] (first endpoints)]
      (is (= "- [Activity](api/activity.md)"
             (endpoint-dox/build-endpoint-link ep ep-data))))))

(deftest endpoint-page-test
  (testing "Endpoint pages are formatted correctly."
    (is (= (first (for [[ep ep-data] endpoints] (endpoint-dox/endpoint-page ep ep-data)))
           page-markdown))))

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
