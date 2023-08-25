(ns metabase.models-test
  (:require
   [clojure.test :refer :all]
   [metabase.moderation]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(def ^:private toucan2-models
  (->> (methodical/primary-methods t2/table-name)
       keys
       (filter keyword)
       (remove #{:default})))

(deftest ^:parallel toucan2-models-should-derive-test
  (doseq [model toucan2-models]
    (testing (format "base model %s should derive :metabase/model" model)
      (is (isa? model :metabase/model)))))
