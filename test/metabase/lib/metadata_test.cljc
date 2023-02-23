(ns metabase.lib.metadata-test
  #?@
   (:clj
    [(:require
      [clojure.test :as t]
      [metabase.lib :as lib]
      [metabase.lib.metadata :as lib.metadata]
      [metabase.lib.test-metadata :as meta])]
    :cljs
    [(:require
      [cljs.test :as t :include-macros true]
      [metabase.lib :as lib]
      [metabase.lib.metadata :as lib.metadata]
      [metabase.lib.test-metadata :as meta])]))

(t/deftest ^:parallel field-metadata-test
  (t/is (=? (merge
             {:lib/type :metadata/field}
             (meta/field-metadata :venues :category-id))
            (lib.metadata/field-metadata meta/metadata "VENUES" "CATEGORY_ID"))))

(t/deftest ^:parallel field-metadata-from-query-test
  (let [query (lib/query meta/metadata "CATEGORIES")]
    (t/are [x] (=? (merge
                    {:lib/type :metadata/field}
                    (meta/field-metadata :venues :category-id))
                   (lib.metadata/field-metadata x "VENUES" "CATEGORY_ID"))
      query
      (lib/metadata query))))

(t/deftest ^:parallel field-metadata-from-results-metadata-test
  (let [query (lib/saved-question-query meta/saved-question)]
    (t/are [x] (=? {:lib/type       :metadata/field
                    :display_name   "CATEGORY_ID"
                    :field_ref      [:field "CATEGORY_ID" {:base-type :type/Integer}]
                    :name           "CATEGORY_ID"
                    :base_type      :type/Integer
                    :effective_type :type/Integer
                    :semantic_type  nil}
                   (lib.metadata/field-metadata x "CATEGORY_ID"))
      query
      (lib/metadata query))))
