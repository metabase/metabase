(ns metabase.driver.generic-sql.query-processor-test
  (:require [clojure.tools.logging :as log]
            [colorize.core :as color]
            [expectations :refer :all]
            [metabase.driver :as driver]
            [metabase.driver.query-processor :refer [max-result-bare-rows]]
            [metabase.test.data :as d]
            [metabase.test.data.datasets :as datasets]))

;; # ERROR RESPONSES

;; Check that we get an error response formatted the way we'd expect
(expect
    {:status :failed
     :error  (str
              ;; column should look like "null.NAME" because the Field will have no associated Table name from expansion and will get
              ;; pased to korma as :null.NAME
              "Column \"null.NAME\" not found; SQL statement:\nSELECT \"CHECKINS\".\"ID\", CAST(\"CHECKINS\".\"DATE\" AS DATE), "
              "\"CHECKINS\".\"VENUE_ID\", \"CHECKINS\".\"USER_ID\" FROM \"CHECKINS\" WHERE (\"null\".\"NAME\" = ?) LIMIT "
              max-result-bare-rows)}
  ;; This will print a stacktrace. Better to reassure people that that's on purpose than to make people question whether the tests are working
  (do (log/info (color/green "NOTE: The following stacktrace is expected <3"))
      (datasets/with-dataset :generic-sql
        (driver/process-query {:database (d/db-id)
                               :type     :query
                               :query    {:source_table (d/id :checkins)
                                          :filter       ["=" (d/id :venues :name) 1] ; wrong Field
                                          :aggregation  ["rows"]}}))))
