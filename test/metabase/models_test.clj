(ns metabase.models-test
  (:require
   [clojure.test :refer :all]
   [metabase.moderation]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(def toucan2-models
  (->> (methodical/primary-methods t2/table-name)
       keys
       (filter keyword)
       (remove #{:default})
       (remove #(isa? % :toucan1/model))))

(deftest toucan2-models-should-derive-test
  (doseq [model toucan2-models]
    (testing (format "base model %s should derive :metabase/model" model)
      (is (true? (isa? model :metabase/model))))))
