(ns metabase.api.getting-started-guide-test
  (:require [expectations :refer :all]
            [metabase.test.data.users :refer [user->client]]))

;; just make sure the getting started guide endpoint works and returns the correct keys
(expect
  #{:metric_important_fields :most_important_dashboard :things_to_know :important_metrics :important_segments :important_tables :contact}
  (set (keys ((user->client :rasta) :get 200 "getting_started"))))
