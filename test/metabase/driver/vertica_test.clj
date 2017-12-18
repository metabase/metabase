(ns metabase.driver.vertica-test
  (:require [metabase.test.data.datasets :refer [expect-with-engine]]
            [metabase.test.util :as tu]))

(expect-with-engine :vertica
  "UTC"
  (tu/db-timezone-id))
