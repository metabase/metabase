(ns metabase.query-processor.middleware.visualization-settings-test
  "Tests for visualization settings processing"
  (:require [clojure.test :refer :all]
            [metabase.models :refer [Card Field]]
            [metabase.query-processor.middleware.visualization-settings :as viz-settings]
            [metabase.shared.models.visualization-settings :as mb.viz]
            [metabase.test :as mt]))

(defn- update-viz-settings [query]
  (-> (mt/test-qp-middleware viz-settings/update-viz-settings query)
      :metadata
      :data
      :ordered-col-viz-settings
      (into [])))

(defn- field-id->db-column-ref
  [field-id]
  (mb.viz/norm->db-column-ref (mb.viz/field-id->column-ref field-id)))

(defn- db-viz-settings
  [field-id-1 field-id-2]
  (let [column-ref-1 (field-id->db-column-ref field-id-1)
        column-ref-2 (field-id->db-column-ref field-id-2)]
    {:column_settings
     {column-ref-1 {:column_title "Price",
                    :number_style "currency",
                    :currency_style "code",
                    :currency "EUR",
                    :currency_in_header false},
      column-ref-2 {:column_title "Rating",
                    :show_mini_bar true,
                    :number_separators ",.",
                    :number_style "percent",
                    :decimals 2,
                    :suffix " happiness"}}}))

(defn- processed-viz-settings
  [field-id-1 field-id-2]
  [{{::mb.viz/field-id field-id-1},
    {::mb.viz/column-title "Price",
     ::mb.viz/number-style "currency",
     ::mb.viz/currency-style "code",
     ::mb.viz/currency "EUR",
     ::mb.viz/currency-in-header false}}
   {{::mb.viz/field-id field-id-2},
    {::mb.viz/column-title "Rating",
     ::mb.viz/show-mini-bar true,
     ::mb.viz/number-separators ",.",
     ::mb.viz/number-style "percent",
     ::mb.viz/decimals 2,
     ::mb.viz/suffix " happiness"}}])

(defn- test-query
  ([field-ids card-id viz-settings]
   (test-query field-ids card-id viz-settings :query))

  ([field-ids card-id viz-settings query-type]
   (let [query {:type query-type
                :query {:fields (into [] (map #(vector :field % nil) field-ids))}
                :viz-settings viz-settings
                :info {:context :xlsx-download}}]
     (if card-id
       (assoc-in query [:info :card-id] card-id)
       query))))

(deftest card-viz-settings-test
  (mt/with-everything-store
    (mt/with-temp* [Field [{field-id-1 :id}]
                    Field [{field-id-2 :id}]]
      (testing "Viz settings for a saved card are fetched from the DB and normalized"
        (mt/with-temp Card [{card-id :id} {:visualization_settings (db-viz-settings field-id-1 field-id-2)}]
          (let [query    (test-query [field-id-1 field-id-2] card-id {})
                result   (update-viz-settings query)
                expected (processed-viz-settings field-id-1 field-id-2)]
            (is (= expected result)))))

      (testing "Viz settings for an unsaved card are fetched from the query map"
        (let [viz-settings {::mb.viz/column-settings (into {} (processed-viz-settings field-id-1 field-id-2))}
              query        (test-query [field-id-1 field-id-2] nil viz-settings)
              result       (update-viz-settings query)
              expected     (processed-viz-settings field-id-1 field-id-2)]
          (is (= expected result))))

      (testing "Viz settings for an unsaved card are ordered by the :fields key in the query"
        (let [viz-settings {::mb.viz/column-settings (into {} (processed-viz-settings field-id-1 field-id-2))}
              query        (test-query [field-id-2 field-id-1] nil viz-settings)
              result       (update-viz-settings query)
              expected     (reverse (processed-viz-settings field-id-1 field-id-2))]
          (is (= expected result)))))

    (mt/with-temp* [Field [{field-id-1 :id} {:settings {:column_title "Test"}}]
                    Field [{field-id-2 :id} {:settings {:decimals 4, :scale 10}}]]
      (testing "Field settings in the DB are incorporated into visualization settings with a lower
               precedence than card settings"
        (testing "for a saved card"
          (mt/with-temp Card [{card-id :id} {:visualization_settings (db-viz-settings field-id-1 field-id-2)}]
            (let [query (test-query [field-id-1 field-id-2] card-id {})
                  result (update-viz-settings query)
                  expected (assoc-in (processed-viz-settings field-id-1 field-id-2) [1 {::mb.viz/field-id field-id-2} ::mb.viz/scale] 10)]
              (is (= expected result)))))

        (testing "for an unsaved card"
          (let [viz-settings {::mb.viz/column-settings (into {} (processed-viz-settings field-id-1 field-id-2))}
                query        (test-query [field-id-1 field-id-2] nil viz-settings)
                result       (update-viz-settings query)
                expected     (assoc-in (processed-viz-settings field-id-1 field-id-2) [1 {::mb.viz/field-id field-id-2} ::mb.viz/scale] 10)]
            (is (= expected result))))))))

(def ^:private test-native-query-viz-settings
  {:table.columns
   [{:name "ID", :enabled true}
    {:name "TAX", :enabled true}
    {:name "SUBTOTAL", :enabled true}],
   ::mb.viz/column-settings
   {{::mb.viz/column-name "SUBTOTAL"}, {::mb.viz/column-title "Subtotal" ::mb.viz/number-style "currency" ::mb.viz/decimals 2},
    {::mb.viz/column-name "TAX"}, {::mb.viz/column-title "Tax" ::mb.viz/number-style "currency"},
    {::mb.viz/column-name "ID"}, {}}})

(def ^:private expected-native-query-viz-settings
  [{{::mb.viz/column-name "ID"} {}}
   {{::mb.viz/column-name "TAX"} {::mb.viz/column-title "Tax" ::mb.viz/number-style "currency"}}
   {{::mb.viz/column-name "SUBTOTAL"}, {::mb.viz/column-title "Subtotal" ::mb.viz/number-style "currency" ::mb.viz/decimals 2}}])

(deftest native-query-viz-settings-test
  (testing "Viz settings for native queries are fetched from the query map and ordered by the :table.columns key"
    (let [query        (test-query [] nil test-native-query-viz-settings :native)
          result       (update-viz-settings query)]
      (is (= expected-native-query-viz-settings result)))))
