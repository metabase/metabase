(ns metabase-enterprise.sandbox.api.metric-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.sandbox.test-util :as met]
   [metabase.test :as mt]
   [metabase.test.data :as data]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2]))

(use-fixtures :once (fixtures/initialize :db :web-server :test-users))

;;; ------------------------------------------------- Helpers -------------------------------------------------

(defn- metric-dimensions
  "Fetch a metric via the API and return just its dimensions."
  [user-kw metric-id]
  (:dimensions (mt/user-http-request user-kw :get 200 (str "metric/" metric-id))))

(defn- dimension-names
  "Extract the set of display-name (or name) values from a seq of dimensions."
  [dims]
  (into #{} (map #(or (:display-name %) (:name %))) dims))

(defn- dimension-group-names
  "Extract the set of group display-names from a seq of dimensions."
  [dims]
  (into #{} (map #(get-in % [:group :display-name])) dims))

;;; ------------------------------------------------- Sandbox Column Filtering Tests -------------------------------------------------

(deftest sandbox-filters-dimension-columns-test
  (testing "Sandboxed user only sees dimensions for columns allowed by the sandbox source card"
    (met/with-gtaps!
      {:gtaps {:venues {:query (data/$ids venues
                                 {:database (data/id)
                                  :type     :query
                                  :query    {:source-table $$venues
                                             :fields       [$id $name $category_id]}})}}}
      (mt/with-temp [:model/Card metric {:name          "Venues Count"
                                         :type          :metric
                                         :database_id   (data/id)
                                         :table_id      (data/id :venues)
                                         :dataset_query {:database (data/id)
                                                         :type     :query
                                                         :query    {:source-table (data/id :venues)
                                                                    :aggregation  [[:count]]}}}]
        (mt/user-http-request :crowberto :get 200 (str "metric/" (:id metric)))
        (let [dims       (metric-dimensions :rasta (:id metric))
              dim-names  (dimension-names dims)]
          (testing "should include columns from sandbox source card"
            (is (contains? dim-names "Name"))
            (is (contains? dim-names "Category ID")))
          (testing "should NOT include columns excluded from sandbox source card"
            (is (not (contains? dim-names "Price")))
            (is (not (contains? dim-names "Latitude")))))))))

(deftest native-sandbox-filters-dimension-columns-test
  (testing "Native query sandbox restricts dimensions by matching column names to field IDs"
    (met/with-gtaps!
      {:gtaps {:venues {:query (mt/native-query
                                {:query "SELECT ID, NAME, CATEGORY_ID FROM VENUES"})}}}
      ;; Run the native sandbox source card to populate its result_metadata
      (let [sandbox (t2/select-one :model/Sandbox :table_id (data/id :venues))]
        (mt/user-http-request :crowberto :post 202 (str "card/" (:card_id sandbox) "/query"))
        (mt/with-temp [:model/Card metric {:name          "Venues Count"
                                           :type          :metric
                                           :database_id   (data/id)
                                           :table_id      (data/id :venues)
                                           :dataset_query {:database (data/id)
                                                           :type     :query
                                                           :query    {:source-table (data/id :venues)
                                                                      :aggregation  [[:count]]}}}]
          (mt/user-http-request :crowberto :get 200 (str "metric/" (:id metric)))
          (let [dims      (metric-dimensions :rasta (:id metric))
                dim-names (dimension-names dims)]
            (testing "should include columns from native sandbox source card"
              (is (contains? dim-names "Name"))
              (is (contains? dim-names "Category ID")))
            (testing "should NOT include columns excluded from native sandbox"
              (is (not (contains? dim-names "Price")))
              (is (not (contains? dim-names "Latitude"))))))))))

(deftest attribute-sandbox-does-not-restrict-columns-test
  (testing "Attribute-based sandbox (no source card) shows all dimension columns"
    (met/with-gtaps!
      {:gtaps      {:venues {:remappings {:cat ["variable" [:field (data/id :venues :category_id) nil]]}}}
       :attributes {"cat" 50}}
      (mt/with-temp [:model/Card metric {:name          "Venues Count"
                                         :type          :metric
                                         :database_id   (data/id)
                                         :table_id      (data/id :venues)
                                         :dataset_query {:database (data/id)
                                                         :type     :query
                                                         :query    {:source-table (data/id :venues)
                                                                    :aggregation  [[:count]]}}}]
        (mt/user-http-request :crowberto :get 200 (str "metric/" (:id metric)))
        (let [dims       (metric-dimensions :rasta (:id metric))
              dim-names  (dimension-names dims)]
          (testing "all columns should be visible since no column-level sandbox restriction"
            (is (contains? dim-names "Name"))
            (is (contains? dim-names "Price"))
            (is (contains? dim-names "Latitude"))))))))

(deftest sandbox-without-feature-blocks-sandboxed-table-dimensions-test
  (testing "When :sandboxes feature is unavailable but sandboxes are configured, dimensions from sandboxed tables are blocked"
    (met/with-gtaps!
      {:gtaps {:venues {:query (data/$ids venues
                                 {:database (data/id)
                                  :type     :query
                                  :query    {:source-table $$venues
                                             :fields       [$id $name $category_id]}})}}}
      (mt/with-temp [:model/Card metric {:name          "Venues Count"
                                         :type          :metric
                                         :database_id   (data/id)
                                         :table_id      (data/id :venues)
                                         :dataset_query {:database (data/id)
                                                         :type     :query
                                                         :query    {:source-table (data/id :venues)
                                                                    :aggregation  [[:count]]}}}]
        ;; Establish dimensions as superuser (with sandboxes feature active, as set by with-gtaps!)
        (let [all-dims (metric-dimensions :crowberto (:id metric))]
          (testing "sanity: superuser sees venues dimensions"
            (is (contains? (dimension-group-names all-dims) "Venues")))
          ;; Now disable the :sandboxes feature and fetch as rasta
          (mt/with-premium-features #{}
            (let [dims   (metric-dimensions :rasta (:id metric))
                  groups (dimension-group-names dims)]
              (testing "dimensions from the sandboxed Venues table should be blocked"
                (is (not (contains? groups "Venues"))))
              (testing "dimensions from non-sandboxed FK-joined tables are still visible"
                (is (contains? groups "Category"))))))))))
