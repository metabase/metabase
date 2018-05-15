(ns metabase.driver.crate-test
  (:require [metabase.test.data.datasets :refer [expect-with-engine]]
            [metabase.test.data :as data]
            [metabase.test.data.dataset-definitions :as defs]
            [metabase.test.util :as tu]
            [metabase.sync :as sync]))

(expect-with-engine :crate
  "UTC"
  (tu/db-timezone-id))
