(ns metabase.driver.snowflake-test
  (:require [metabase.test.data.datasets :refer [expect-with-engine]]
            [metabase.test.util :as tu]))

(expect-with-engine :snowflake
                    "UTC"
                    (tu/db-timezone-id))

