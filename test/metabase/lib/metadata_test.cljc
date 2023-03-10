(ns metabase.lib.metadata-test
  (:require
   [clojure.test :refer [are deftest is]]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.test-metadata :as meta])
  #?(:cljs (:require [metabase.test-runner.assert-exprs.approximately-equal])))

(deftest ^:parallel field-metadata-test
  (are [x] (=? (merge
                {:lib/type :metadata/field}
                (meta/field-metadata :venues :category-id))
               x)
    (lib.metadata/field meta/metadata-provider (meta/id :venues :category-id))
    (lib.metadata/field meta/metadata-provider (meta/id :venues) "CATEGORY_ID")
    (lib.metadata/field meta/metadata-provider "PUBLIC" "VENUES" "CATEGORY_ID")
    (lib.metadata/field meta/metadata-provider nil "VENUES" "CATEGORY_ID")))

(deftest ^:parallel stage-metadata-test
  (let [query (lib/saved-question-query meta/metadata-provider meta/saved-question)]
    (is (=? {:columns [{:name "ID"}
                       {:name "NAME"}
                       {:name "CATEGORY_ID"}
                       {:name "LATITUDE"}
                       {:name "LONGITUDE"}
                       {:name "PRICE"}]}
            (lib.metadata/stage query -1)))))

(deftest ^:parallel stage-column-metadata-test
  (let [query (lib/saved-question-query meta/metadata-provider meta/saved-question)]
    (are [x] (=? {:lib/type       :metadata/field
                  :display_name   "CATEGORY_ID"
                  :field_ref      [:field "CATEGORY_ID" {:base-type :type/Integer}]
                  :name           "CATEGORY_ID"
                  :base_type      :type/Integer
                  :effective_type :type/Integer
                  :semantic_type  nil}
                 x)
      (lib.metadata/stage-column query "CATEGORY_ID")
      (lib.metadata/stage-column query -1 "CATEGORY_ID"))))
