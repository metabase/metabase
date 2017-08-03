(ns metabase.driver.redshift-test
  (:require [metabase.test.data.datasets :refer [expect-with-engine]]
            [metabase.test.util :as tu]))

(expect-with-engine :redshift
  "UTC"
  (tu/db-timezone-id))
