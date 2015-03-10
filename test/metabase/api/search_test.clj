(ns metabase.api.search-test
  "Tests for /api/search endpoints."
  (:require [expectations :refer :all]
            [korma.core :refer :all]
            [metabase.db :refer :all]
            [metabase.test.util :refer [match-$ expect-eval-actual-first random-name]]
            [metabase.test-data :refer :all]))

;; ## GET /api/search/model_choices
(expect
    {:choices {:metabase {:card "Cards"
                          :dashboard "Dashboards"
                          :database "Databases"
                          :field "Fields"
                          :table "Tables"}}}
  ((user->client :lucky) :get 200 "search/model_choices"))
