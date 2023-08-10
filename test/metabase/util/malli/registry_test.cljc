(ns metabase.util.malli.registry-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [malli.core :as mc]
   [malli.error :as me]
   [metabase.util.malli.registry :as mr]))

(mr/def ::int
  :int)

(deftest ^:parallel explainer-test
  (is (= ["should be an integer"]
         (me/humanize (mc/explain ::int "1"))
         (me/humanize ((mr/explainer ::int) "1"))))
  (testing "cache explainers"
    (is (identical? (mr/explainer ::int)
                    (mr/explainer ::int)))))
