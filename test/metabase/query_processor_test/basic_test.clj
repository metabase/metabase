(ns metabase.query-processor-test.basic-test
  (:require [clojure.test :refer :all]
            [metabase.test :as mt]
            [schema.core :as s]))

(deftest basic-test
  (is (schema= {:status (s/eq :completed)
                s/Keyword s/Any}
               (mt/run-mbql-query venues))))

;; NOCOMMIT
(defn x []
  (dev/process-query-debug
   (mt/mbql-query venues {:fields [$name]})))
