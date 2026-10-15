(ns metabase-enterprise.library-branching.format.kinds.metric-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.library-branching.format.codec :as codec]
   [metabase-enterprise.library-branching.format.kinds :as kinds]
   [metabase-enterprise.library-branching.format.kinds.metric :as metric]
   [metabase-enterprise.library-branching.format.layout :as layout]
   [metabase-enterprise.library-branching.mutation.core :as mut]
   [metabase.util.malli.registry :as mr]))

(set! *warn-on-reflection* true)

(def ^:private sd "Sample Database")
(def ^:private metric-id "mEtRiCmEtRiCmEtRiCmE1")
(def ^:private card-id "cArDcArDcArDcArDcArD1")
(def ^:private dashboard-id "dAsHbOaRdDaShBoArDdA1")

(def ^:private query
  {:lib/type "mbql/query"
   :database sd
   :stages   [{:lib/type "mbql.stage/mbql" :source-card card-id}]})

(def ^:private item
  {:kind  :metric
   :name  "Revenue"
   :place nil
   :refs  #{[:database [:env [sd]]] [:source-card card-id]}
   :attrs {:display "scalar" :query query}})

(deftest encode-test
  (testing "the document of a metric: the place as collection, no implied :lib/type"
    (is (= {:kind "metric" :id metric-id :name "Revenue" :collection card-id :display "scalar"
            :query {:database sd :stages [{:source-card card-id}]}}
           (codec/encode metric/codec metric-id (assoc item :place card-id)))))
  (testing "decode restores the implied :lib/type keys"
    (is (= [metric-id item]
           (codec/decode metric/codec {:kind "metric" :id metric-id :name "Revenue" :display "scalar"
                                       :query {:database sd :stages [{:source-card card-id}]}})))))

(deftest refs-test
  (testing "the references of a metric: its query, and the other attributes that hold references"
    (is (= #{[:database [:env [sd]]]
             [:source-card card-id]
             [:card dashboard-id]
             [:field [:env [sd "PUBLIC" "ORDERS" "TOTAL"]]]
             [:table [:env [sd "PUBLIC" "ORDERS"]]]}
           (kinds/refs :metric metric-id
                       {:display            "scalar"
                        :query              query
                        :parameters         [{:id "p" :values_source_config {:card_id dashboard-id}}]
                        :dimension_mappings [{:table-id [sd "PUBLIC" "ORDERS"]
                                              :target   ["field" {} [sd "PUBLIC" "ORDERS" "TOTAL"]]}]})))))

(deftest attributes-test
  (testing "the content attributes of a metric"
    (is (= #{:description :display :query :visualization_settings :parameters :parameter_mappings
             :collection_position :collection_preview :dimensions :dimension_mappings}
           (set (keys (:attrs metric/spec))))))
  (testing "a query must have each implied :lib/type"
    (is (mr/validate (codec/schema metric/codec) item))
    (is (not (mr/validate (codec/schema metric/codec) (update-in item [:attrs :query :stages 0] dissoc :lib/type))))
    (is (not (mr/validate (codec/schema metric/codec) (update-in item [:attrs :query] dissoc :lib/type)))))
  (testing "a query is a map with a database and at least one stage"
    (doseq [q [{:lib/type "mbql/query" :database sd :stages []}
               {:lib/type "mbql/query" :stages [{:lib/type "mbql.stage/mbql"}]}
               "SELECT 1"]]
      (is (not (mr/validate (codec/schema metric/codec)
                            (-> item (assoc-in [:attrs :query] q) (assoc :refs (kinds/refs :metric metric-id {:query q})))))
          (pr-str q))))
  (testing "a root-level metric is in library/"
    (is (= {metric-id "library/revenue.metric.yaml"} (layout/layout kinds/codecs {metric-id item})))))

(def ^:private mutations
  [{:name   :query-implied-not-restored
    :doc    "The metric codec does not restore the implied keys of its query."
    :target `metric/decode-attrs
    :edits  [[:replace '(update attrs :query portable/restore-implied) 'attrs]]}
   {:name   :query-implied-written
    :doc    "The metric codec writes the implied keys of its query."
    :target `metric/encode-attrs
    :edits  [[:replace '(update attrs :query portable/omit-implied) 'attrs]]}
   {:name   :only-query-refs
    :doc    "Only the query gives references, so a parameter's values source card is not checked."
    :target `metric/refs
    :edits  [[:replace '(portable/refs (dissoc attrs :query)) #{}]]}])

(deftest metric-mutations-test
  (mut/check mutations {:tests [#'encode-test #'refs-test]}))
