(ns metabase.cache.models.cache-config-test
  (:require
   [clojure.test :refer :all]
   [metabase.cache.models.cache-config :as cache-config]))

(deftest row->config-preserves-config-key-names-test
  (testing "row->config passes the :config blob's keys through unchanged (metabase#78340)"
    ;; The QP cache middleware (metabase.query-processor.middleware.cache) reads
    ;; :min_duration_ms off the strategy map this function returns. If the two sides
    ;; of that contract ever drift again, minimum-query-duration silently stops being
    ;; enforced -- every query gets cached regardless of how fast it ran -- with no
    ;; error, since the middleware just falls back to a default of 0.
    (is (=? {:model    "question"
             :model_id 1
             :strategy {:type :ttl, :multiplier 200, :min_duration_ms 10}}
            (cache-config/row->config {:model    "question"
                                       :model_id 1
                                       :strategy :ttl
                                       :config   {:multiplier 200, :min_duration_ms 10}})))))
