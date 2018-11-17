(ns metabase.driver.sqlite-test
  (:require [metabase.test.data.datasets :refer [expect-with-driver]]
            [metabase.test.util :as tu]))

(expect-with-driver :sqlite
  "UTC"
  (tu/db-timezone-id))
