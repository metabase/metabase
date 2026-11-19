(ns metabase.collection-items.spec-test
  (:require
   [clojure.test :refer :all]
   [metabase.collection-items.spec :as collection-items.spec]
   [metabase.models.resolution :as models.resolution]
   [metabase.util.malli.registry :as mr]))

(deftest every-spec-is-valid-test
  (models.resolution/load-all-models!)
  (doseq [model (keys (dissoc (methods collection-items.spec/spec) :default))]
    (testing (pr-str model)
      (is (nil? (mr/explain collection-items.spec/ModelSpec (collection-items.spec/spec model)))))))
