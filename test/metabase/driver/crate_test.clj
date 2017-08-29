(ns metabase.driver.crate-test
  (:require [metabase.test.data.datasets :refer [expect-with-engine]]
            [metabase.test.util :as tu]))

(expect-with-engine :crate
  "UTC"
  (tu/db-timezone-id))
