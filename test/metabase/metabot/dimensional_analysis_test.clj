(ns metabase.metabot.dimensional-analysis-test
  (:require
    [clojure.test :refer :all]
    [metabase.metabot.dimensional-analysis :as mda]
    [metabase.test :as mt]))

(deftest scalar-selection-test
  (testing "A query returning a single item should produce a scalar view."
    (mt/dataset sample-dataset
      (let [query  {:database (mt/id)
                    :type     :native
                    :native   {:query "SELECT COUNT(*) FROM PEOPLE"}}
            {:keys [display]} (-> query mda/native-query->result-metadata mda/select-viz)]
        (is (= :scalar display))))))

(deftest bar-selection-test
  (testing "A query with a single measure and non-specialized dimension produces a bar chart."
    (mt/dataset sample-dataset
      (let [query  {:database (mt/id)
                    :type     :native
                    :native   {:query "SELECT COUNT(*), CATEGORY FROM PRODUCTS GROUP BY CATEGORY"}}
            {:keys [display visualization_settings]} (-> query mda/native-query->result-metadata mda/select-viz)
            {dimensions :graph.dimensions metrics :graph.metrics} visualization_settings]
        (is (= :bar display))
        (is (= 1 (count dimensions)))
        (is (= 1 (count metrics))))))
  (testing "A query with a multiple measures and non-specialized dimension produces a bar chart."
    (mt/dataset sample-dataset
      (let [query  {:database (mt/id)
                    :type     :native
                    :native   {:query "SELECT MIN(RATING), MAX(RATING), AVG(RATING), COUNT(RATING), CATEGORY FROM PRODUCTS GROUP BY CATEGORY"}}
            {:keys [display visualization_settings]} (-> query mda/native-query->result-metadata mda/select-viz)
            {dimensions :graph.dimensions metrics :graph.metrics} visualization_settings]
        (is (= :bar display))
        (is (= 1 (count dimensions)))
        (is (= 4 (count metrics))))))
  (testing (str
             "Note that this is somewhat permissive: rating and price are measures, so if we have a "
             "single dimension these will bot show on the bar chart. Without some sort of unit "
             "analysis (e.g. all measures are currency) this is about as good as we can do.")
    (mt/dataset sample-dataset
      (let [query  {:database (mt/id)
                    :type     :native
                    :native   {:query "SELECT ID, RATING, PRICE, CATEGORY FROM PRODUCTS"}}
            {:keys [display visualization_settings]} (-> query mda/native-query->result-metadata mda/select-viz)
            {dimensions :graph.dimensions metrics :graph.metrics} visualization_settings]
        (is (= :bar display))
        (is (= 1 (count dimensions)))
        (is (= 2 (count metrics)))))))

(deftest line-selection-test
  ;; TODO - "SELECT ID, PRODUCT_ID, TOTAL, CREATED_AT FROM ORDERS"
  ;; fails because PRODUCT_ID isn't picked up as a FK
  (testing "IDs should be discounted since they are relational and not measures or dimensions."
    (mt/dataset sample-dataset
      (let [query  {:database (mt/id)
                    :type     :native
                    :native   {:query "SELECT ID, TOTAL, CREATED_AT FROM ORDERS"}}
            {:keys [display visualization_settings]} (-> query mda/native-query->result-metadata mda/select-viz)
            {dimensions :graph.dimensions metrics :graph.metrics} visualization_settings]
        (is (= :line display))
        (is (= 1 (count dimensions)))
        (is (= 1 (count metrics))))))
  (testing "A query with a single measure and time dimension produces a line chart."
    (mt/dataset sample-dataset
      (let [query  {:database (mt/id)
                    :type     :native
                    :native   {:query "SELECT TOTAL, CREATED_AT FROM ORDERS"}}
            {:keys [display visualization_settings]} (-> query mda/native-query->result-metadata mda/select-viz)
            {dimensions :graph.dimensions metrics :graph.metrics} visualization_settings]
        (is (= :line display))
        (is (= 1 (count dimensions)))
        (is (= 1 (count metrics))))))
  (testing "A query with multiple measures and a time dimension produces a line chart."
    (mt/dataset sample-dataset
      (let [query  {:database (mt/id)
                    :type     :native
                    :native   {:query "SELECT TOTAL, TAX, SUBTOTAL, CREATED_AT FROM ORDERS"}}
            {:keys [display visualization_settings]} (-> query mda/native-query->result-metadata mda/select-viz)
            {dimensions :graph.dimensions metrics :graph.metrics} visualization_settings]
        (is (= :line display))
        (is (= 1 (count dimensions)))
        (is (= 3 (count metrics)))))))

(deftest table-selection-test
  (testing "When no dimensions are present, produce a table display"
    (mt/dataset sample-dataset
      (let [query  {:database (mt/id)
                    :type     :native
                    :native   {:query "SELECT ID FROM ORDERS"}}
            {:keys [display]} (-> query mda/native-query->result-metadata mda/select-viz)]
        (is (= :table display))))
    (mt/dataset sample-dataset
      (let [query  {:database (mt/id)
                    :type     :native
                    :native   {:query "SELECT TOTAL FROM ORDERS"}}
            {:keys [display]} (-> query mda/native-query->result-metadata mda/select-viz)]
        (is (= :table display))))
    (mt/dataset sample-dataset
      (let [query  {:database (mt/id)
                    :type     :native
                    :native   {:query "SELECT ID, TOTAL FROM ORDERS"}}
            {:keys [display]} (-> query mda/native-query->result-metadata mda/select-viz)]
        (is (= :table display)))))
  (testing "When multiple dimensions are present, produce a table display."
    (mt/dataset sample-dataset
      (let [query  {:database (mt/id)
                    :type     :native
                    :native   {:query "SELECT TITLE, CATEGORY FROM PRODUCTS"}}
            {:keys [display]} (-> query mda/native-query->result-metadata mda/select-viz)]
        (is (= :table display))))
    (mt/dataset sample-dataset
      (let [query  {:database (mt/id)
                    :type     :native
                    :native   {:query "SELECT ID, TITLE, CATEGORY FROM PRODUCTS"}}
            {:keys [display]} (-> query mda/native-query->result-metadata mda/select-viz)]
        (is (= :table display))))
    (mt/dataset sample-dataset
      (let [query  {:database (mt/id)
                    :type     :native
                    :native   {:query "SELECT ID, RATING, PRICE, TITLE, CATEGORY FROM PRODUCTS"}}
            {:keys [display]} (-> query mda/native-query->result-metadata mda/select-viz)]
        (is (= :table display))))))

(deftest state-test
  (testing "A metric with a state dimension should present as a US map"
    ;; TODO - Do we have non-US state situations?
    (mt/dataset sample-dataset
      (let [query  {:database (mt/id)
                    :type     :native
                    :native   {:query "SELECT TOTAL, STATE FROM PEOPLE LEFT JOIN ORDERS ON PEOPLE.id = ORDERS.USER_ID"}}
            {:keys [display]} (-> query mda/native-query->result-metadata mda/select-viz)]
        (is (= :map display)))))
  (testing "A state dimension with multiple metrics will show as a bar chart"
    (mt/dataset sample-dataset
      (let [query  {:database (mt/id)
                    :type     :native
                    :native   {:query "SELECT TAX, TOTAL, STATE FROM PEOPLE LEFT JOIN ORDERS ON PEOPLE.id = ORDERS.USER_ID"}}
            {:keys [display]} (-> query mda/native-query->result-metadata mda/select-viz)]
        (is (= :bar display))))))

(deftest todo-lon-lat-test
  (testing "ATM, a metric with longitude and latitude displays as a table."
    ;; TODO - In the future, we should convert this to a pin map. I _think_ for a pin map
    ;; we don't even need metrics. We just put pins wherever there are lon/lat points.
    ;; This may not be what is desired, based on the metrics. ¯\_(ツ)_/¯
    (mt/dataset sample-dataset
      (let [query  {:database (mt/id)
                    :type     :native
                    :native   {:query "SELECT TOTAL, LONGITUDE, LATITUDE FROM PEOPLE LEFT JOIN ORDERS ON PEOPLE.id = ORDERS.USER_ID"}}
            {:keys [display]} (-> query mda/native-query->result-metadata mda/select-viz)]
        (is (= :table display))))))
