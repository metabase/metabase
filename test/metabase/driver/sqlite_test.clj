(ns metabase.driver.sqlite-test
  (:require [metabase.test.data.datasets :refer [expect-with-engine]]
            [metabase.test.util :as tu]))

(expect-with-engine :sqlite
  "UTC"
  (tu/db-timezone-id))
