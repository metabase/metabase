(ns metabase.query_processor.qp-middleware-test
  (:require [clj-time.coerce :as tc]
            [expectations :refer [expect]]
            [metabase.driver :as driver]
            [metabase.models.setting :as setting]
            [metabase.query-processor.middleware
             [add-row-count-and-status :as add-row-count-and-status]
             [add-settings :as add-settings]
             [catch-exceptions :as catch-exceptions]
             [format-rows :as format-rows]]))

(defrecord ^:private TestDriver []
  clojure.lang.Named
  (getName [_] "TestDriver"))

(extend TestDriver
  driver/IDriver
  {:features (constantly #{:set-timezone})})



;; add-settings/add-settings




;; add-row-count-and-status




;; format-rows/format-rows
