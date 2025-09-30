(ns metabase.query-processor.middleware.visualization-settings-test
  "Tests for visualization settings processing"
  (:require
   [clojure.test :refer :all]
   [metabase.lib.core :as lib]
   [metabase.lib.test-metadata :as meta]
   [metabase.lib.test-util :as lib.tu]
   [metabase.models.visualization-settings :as mb.viz]
   [metabase.query-processor.middleware.visualization-settings :as viz-settings]
   [metabase.test :as mt]
   [metabase.util :as u]))

(defn- update-viz-settings
  ([query] (update-viz-settings query true))
  ([query remove-global?]
   (let [mp    (or (:lib/metadata query)
                   meta/metadata-provider)
         query (lib/query mp query)]
     (cond-> (:viz-settings ((viz-settings/update-viz-settings query identity) {}))
       remove-global?
       (dissoc ::mb.viz/global-column-settings)))))

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
  {::mb.viz/column-settings
   {{::mb.viz/field-id field-id-1}
    {::mb.viz/column-title "Price",
     ::mb.viz/number-style "currency",
     ::mb.viz/currency-style "code",
     ::mb.viz/currency "EUR",
     ::mb.viz/currency-in-header false}
    {::mb.viz/field-id field-id-2}
    {::mb.viz/column-title "Rating",
     ::mb.viz/show-mini-bar true,
     ::mb.viz/number-separators ",.",
     ::mb.viz/number-style "percent",
     ::mb.viz/decimals 2,
     ::mb.viz/suffix " happiness"}}})

(defn- test-query
  ([field-ids card-id viz-settings]
   (test-query field-ids card-id viz-settings :query))

  ([field-ids card-id viz-settings query-type]
   (let [query  (merge
                 {:type       query-type
                  :middleware {:process-viz-settings? true}}
                 (if (= query-type :native)
                   {:native {:query "SELECT X"}}
                   {:query (-> {:source-table 1}
                               (u/assoc-dissoc :fields (not-empty (into [] (map #(vector :field % nil) field-ids)))))}))
         query' (if card-id
                  (assoc-in query [:info :card-id] card-id)
                  query)]
     (if viz-settings (assoc query' :viz-settings viz-settings) query'))))

(def ^:private card-viz-settings-test-mock-metadata-provider
  (lib.tu/mock-metadata-provider
   meta/metadata-provider
   {:fields (for [field [{:id 1, :settings {:column_title "Test"}}
                         {:id 2, :settings {:decimals 4, :scale 10}}
                         {:id 3, :settings {:number_style "percent"}}]]
              (merge (meta/field-metadata :venues :name) field))}))

(deftest ^:parallel card-viz-settings-test
  (testing "Field settings in the DB are incorporated into visualization settings with a lower
               precedence than card settings"
    (testing "for a saved card"
      (let [mp       (lib.tu/mock-metadata-provider
                      card-viz-settings-test-mock-metadata-provider
                      {:cards [{:id                     1
                                :database-id            1
                                :dataset-query          {:database 1, :type :native, :native {:query "X"}}
                                :visualization-settings (db-viz-settings 1 2)}]})
            query    (lib/query mp (test-query [1 2 3] 1 nil))
            result   (update-viz-settings query)
            expected (-> (processed-viz-settings 1 2)
                         (assoc-in [::mb.viz/column-settings {::mb.viz/field-id 2} ::mb.viz/scale] 10)
                         (assoc-in [::mb.viz/column-settings {::mb.viz/field-id 3} ::mb.viz/number-style] "percent"))]
        (is (= expected result))))))

(deftest ^:parallel card-viz-settings-test-2
  (testing "Field settings in the DB are incorporated into visualization settings with a lower
               precedence than card settings"
    (testing "for an unsaved card"
      (let [viz-settings (into {} (processed-viz-settings 1 2))
            query        (lib/query
                          card-viz-settings-test-mock-metadata-provider
                          (test-query [1 2 3] nil viz-settings))
            result       (update-viz-settings query)
            expected     (-> (processed-viz-settings 1 2)
                             (assoc-in [::mb.viz/column-settings {::mb.viz/field-id 2} ::mb.viz/scale] 10)
                             (assoc-in [::mb.viz/column-settings {::mb.viz/field-id 3} ::mb.viz/number-style] "percent"))]
        (is (= expected result))))))

(deftest ^:parallel card-viz-settings-test-3
  (testing "Field settings in the DB are incorporated into visualization settings with a lower
               precedence than card settings"
    (testing "for a saved card"
      (let [mp       (lib.tu/mock-metadata-provider
                      card-viz-settings-test-mock-metadata-provider
                      {:cards [{:id                     1
                                :datset-query           {:database 1, :type :native, :native {:query "X"}}
                                :database-id            1
                                :visualization-settings (db-viz-settings 1 2)}]})
            query    (lib/query mp (test-query [1 2 3] 1 nil))
            result   (update-viz-settings query)
            expected (-> (processed-viz-settings 1 2)
                         (assoc-in [::mb.viz/column-settings {::mb.viz/field-id 2} ::mb.viz/scale] 10)
                         (assoc-in [::mb.viz/column-settings {::mb.viz/field-id 3} ::mb.viz/number-style] "percent"))]
        (is (= expected result))))))

(deftest ^:parallel card-viz-settings-test-4
  (testing "Field settings in the DB are incorporated into visualization settings with a lower
               precedence than card settings"
    (testing "for an unsaved card"
      (let [viz-settings (into {} (processed-viz-settings 1 2))
            query        (lib/query
                          card-viz-settings-test-mock-metadata-provider
                          (test-query [1 2 3] nil viz-settings))
            result       (update-viz-settings query)
            expected     (-> (processed-viz-settings 1 2)
                             (assoc-in [::mb.viz/column-settings {::mb.viz/field-id 2} ::mb.viz/scale] 10)
                             (assoc-in [::mb.viz/column-settings {::mb.viz/field-id 3} ::mb.viz/number-style] "percent"))]
        (is (= expected result))))))

(def ^:private test-native-query-viz-settings
  {::mb.viz/column-settings
   {{::mb.viz/column-name "ID"} {},
    {::mb.viz/column-name "TAX"} {::mb.viz/column-title "Tax" ::mb.viz/number-style "currency"},
    {::mb.viz/column-name "SUBTOTAL"} {::mb.viz/column-title "Subtotal" ::mb.viz/number-style "currency" ::mb.viz/decimals 2}}})

(deftest ^:parallel native-query-viz-settings-test
  (testing "Viz settings for native queries are pulled out of the query map but not modified"
    (let [query  (test-query [] nil test-native-query-viz-settings :native)
          result (update-viz-settings query)]
      (is (= test-native-query-viz-settings result)))))

(deftest includes-global-settings-test
  (testing "Viz settings include global viz settings, in a normalized form"
    (let [mp                  (lib.tu/mock-metadata-provider
                               meta/metadata-provider
                               {:fields (for [field [{:id 1}
                                                     {:id 2}]]
                                          (merge (meta/field-metadata :venues :id) field))
                                :cards  [{:id                     1
                                          :database-id            1
                                          :dataset-query          {:database 1, :type :native, :native {:query "X"}}
                                          :visualization_settings (db-viz-settings 1 2)}]})
          global-viz-settings #:type{:Number   {:number_separators ".,"}
                                     :Currency {:currency "BIF"}}]
      (mt/with-temporary-setting-values [custom-formatting global-viz-settings]
        (let [query    (lib/query mp (test-query [1 2] 1 nil))
              result   (update-viz-settings query false)
              expected (assoc (processed-viz-settings 1 2)
                              ::mb.viz/global-column-settings #:type{:Number   {::mb.viz/number-separators ".,"}
                                                                     :Currency {::mb.viz/currency "BIF"}})]
          (is (= expected result)))))))
