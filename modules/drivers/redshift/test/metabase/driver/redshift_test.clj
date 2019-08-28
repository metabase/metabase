(ns metabase.driver.redshift-test
  (:require [metabase.test.data.datasets :refer [expect-with-driver]]
            [metabase.test.util :as tu]))

(expect-with-driver :redshift
  "UTC"
  (tu/db-timezone-id))
