(ns metabase.lib.extraction-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [medley.core :as m]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.test-metadata :as meta]
   [metabase.lib.test-util :as lib.tu]
   #?@(:cljs ([metabase.test-runner.assert-exprs.approximately-equal]))))

(deftest ^:parallel column-extraction-test-1-datetime-column
  (testing "extract on a regular datetime column without aggregations adds the column in this stage"
    (let [query       (lib/query meta/metadata-provider (meta/table-metadata :orders))
          columns     (lib/returned-columns query)
          created-at  (m/find-first #(= (:name %) "CREATED_AT") columns)
          extractions (lib/column-extractions query created-at)
          by-tag      (m/index-by :tag extractions)]
      (is (=? [{:tag :hour-of-day,     :column created-at, :display-name "Hour of day"}
               {:tag :day-of-month,    :column created-at, :display-name "Day of month"}
               {:tag :day-of-week,     :column created-at, :display-name "Day of week"}
               {:tag :month-of-year,   :column created-at, :display-name "Month of year"}
               {:tag :quarter-of-year, :column created-at, :display-name "Quarter of year"}
               {:tag :year,            :column created-at, :display-name "Year"}]
              extractions))
      (testing "extracting :month-of-year"
        (is (=? [:month-name {} [:get-month {} [:field {} (meta/id :orders :created-at)]]]
                (lib/extraction-expression (:month-of-year by-tag))))
        (is (=? {:stages [{:expressions
                           [[:month-name {:lib/expression-name "Month of year"}
                             [:get-month {} [:field {} (meta/id :orders :created-at)]]]]}]}
                (lib/extract query -1 (:month-of-year by-tag)))))
      (testing "extracting :day-of-week"
        (is (=? [:day-name {} [:get-day-of-week {} [:field {} (meta/id :orders :created-at)]]]
                (lib/extraction-expression (:day-of-week by-tag))))
        (is (=? {:stages [{:expressions
                           [[:day-name {:lib/expression-name "Day of week"}
                             [:get-day-of-week {} [:field {} (meta/id :orders :created-at)]]]]}]}
                (lib/extract query -1 (:day-of-week by-tag)))))
      (testing "extracting :quarter-of-year"
        (is (=? [:quarter-name {} [:get-quarter {} [:field {} (meta/id :orders :created-at)]]]
                (lib/extraction-expression (:quarter-of-year by-tag))))
        (is (=? {:stages [{:expressions
                           [[:quarter-name {:lib/expression-name "Quarter of year"}
                             [:get-quarter {} [:field {} (meta/id :orders :created-at)]]]]}]}
                (lib/extract query -1 (:quarter-of-year by-tag)))))
      (doseq [[tag expr label] [[:year         :get-year "Year"]
                                [:day-of-month :get-day  "Day of month"]
                                [:hour-of-day  :get-hour "Hour of day"]]]
        (testing (str "extracting " tag)
          (is (=? [expr {} [:field {} (meta/id :orders :created-at)]]
                  (lib/extraction-expression (get by-tag tag))))
          (is (=? {:stages [{:expressions [[expr {:lib/expression-name label}
                                            [:field {} (meta/id :orders :created-at)]]]}]}
                  (lib/extract query -1 (get by-tag tag)))))))))

(deftest ^:parallel duplicate-names-test
  (testing "extracting the same field twice disambiguates the expression names"
    (let [;; The standard ORDERS query but with a :day-of-month extraction already applied.
          query (-> (lib/query meta/metadata-provider (meta/table-metadata :orders))
                    (lib/expression -1 "Day of month"
                                    (lib/get-day (meta/field-metadata :orders :created-at))))]
      (is (=? {:stages [{:expressions [;; The original
                                       [:get-day {:lib/expression-name "Day of month"}
                                        [:field {} (meta/id :orders :created-at)]]
                                       ;; The newly added one
                                       [:get-day {:lib/expression-name "Day of month_2"}
                                        [:field {} (meta/id :orders :created-at)]]]}]}
              (->> (lib/returned-columns query)
                   (m/find-first #(= (:name %) "CREATED_AT"))
                   (lib/column-extractions query)
                   (m/find-first (comp #{:day-of-month} :tag))
                   (lib/extract query -1)))))))

(deftest ^:parallel extract-relevant-units-test-1-time
  (let [ship-time (assoc (meta/field-metadata :orders :created-at)
                         :id             9999001
                         :name           "SHIP_TIME"
                         :display-name   "Ship time"
                         :base-type      :type/Time
                         :effective-type :type/Time
                         :semantic-type  :type/Time)
        mp        (lib/composed-metadata-provider
                    (lib.tu/mock-metadata-provider {:fields [ship-time]})
                    meta/metadata-provider)
        query     (lib/query mp (lib.metadata/table mp (meta/id :orders)))]
    (is (=? [{:tag :hour-of-day}]
            (->> (lib/returned-columns query)
                 (m/find-first #(= (:name %) "SHIP_TIME"))
                 (lib/column-extractions query))))))

(deftest ^:parallel extract-relevant-units-test-2-date
  (let [arrival   (assoc (meta/field-metadata :orders :created-at)
                         :id             9999001
                         :name           "ARRIVAL_DATE"
                         :display-name   "Expected arrival"
                         :base-type      :type/Date
                         :effective-type :type/Date
                         :semantic-type  :type/Date)
        mp        (lib/composed-metadata-provider
                    (lib.tu/mock-metadata-provider {:fields [arrival]})
                    meta/metadata-provider)
        query     (lib/query mp (lib.metadata/table mp (meta/id :orders)))]
    (is (=? [{:tag :day-of-month}
             {:tag :day-of-week}
             {:tag :month-of-year}
             {:tag :quarter-of-year}
             {:tag :year}]
            (->> (lib/returned-columns query)
                 (m/find-first #(= (:name %) "ARRIVAL_DATE"))
                 (lib/column-extractions query))))))

(def ^:private homepage
  (assoc (meta/field-metadata :people :email)
         :id             9999001
         :name           "HOMEPAGE"
         :display-name   "Homepage URL"
         :base-type      :type/Text
         :effective-type :type/Text
         :semantic-type  :type/URL))

(defn- homepage-provider
  ([] (homepage-provider meta/metadata-provider))
  ([base-provider]
   (lib/composed-metadata-provider
     (lib.tu/mock-metadata-provider {:fields [homepage]})
     base-provider)))

(deftest ^:parallel extract-from-url-test
  ;; There's no URL columns in the same dataset, but let's pretend there's one called People.HOMEPAGE.
  (testing "Extracting a URL column"
    (let [mp          (homepage-provider)
          query       (lib/query mp (lib.metadata/table mp (meta/id :people)))
          extractions (->> (lib/returned-columns query)
                           (m/find-first #(= (:name %) "HOMEPAGE"))
                           (lib/column-extractions query))
          by-tag      (m/index-by :tag extractions)]
      (is (=? #{:domain :subdomain :host} (set (keys by-tag))))
      (testing "to :domain"
        (is (=? [:domain {} [:field {} 9999001]]
                (lib/extraction-expression (:domain by-tag))))
        (is (=? {:stages [{:expressions [[:domain {:lib/expression-name "Domain"}
                                          [:field {} 9999001]]]}]}
                (lib/extract query -1 (:domain by-tag)))))
      (testing "to :subdomain"
        (is (=? [:subdomain {} [:field {} 9999001]]
                (lib/extraction-expression (:subdomain by-tag))))
        (is (=? {:stages [{:expressions [[:subdomain {:lib/expression-name "Subdomain"}
                                          [:field {} 9999001]]]}]}
                (lib/extract query -1 (:subdomain by-tag)))))
      (testing "to :host"
        (is (=? [:host {} [:field {} 9999001]]
                (lib/extraction-expression (:host by-tag))))
        (is (=? {:stages [{:expressions [[:host {:lib/expression-name "Host"}
                                          [:field {} 9999001]]]}]}
                (lib/extract query -1 (:host by-tag))))))))

(deftest ^:parallel extracting-from-urls-requires-regex-feature-test
  (let [query-regex    (lib/query (homepage-provider) (meta/table-metadata :people))
        no-regex       (homepage-provider (meta/updated-metadata-provider update :features disj :regex))
        query-no-regex (lib/query no-regex (meta/table-metadata :people))]
    (testing "when the database supports :regex URL extraction is available"
      (is (=? [{:tag :domain,    :display-name "Domain"}
               {:tag :subdomain, :display-name "Subdomain"}
               {:tag :host,      :display-name "Host"}]
              (->> (lib/returned-columns query-regex)
                   (m/find-first #(= (:name %) "HOMEPAGE"))
                   (lib/column-extractions query-regex)))))
    (testing "when the database does not support :regex URL extraction is not available"
      (is (empty? (->> (lib/returned-columns query-no-regex)
                       (m/find-first #(= (:name %) "HOMEPAGE"))
                       (lib/column-extractions query-no-regex)))))))

(deftest ^:parallel extracting-from-emails-requires-regex-feature-test
  (let [query-regex    (lib/query meta/metadata-provider (meta/table-metadata :people))
        no-regex       (meta/updated-metadata-provider update :features disj :regex)
        query-no-regex (lib/query no-regex (meta/table-metadata :people))]
    (testing "when the database supports :regex email extraction is available"
      (is (=? [{:tag :domain,    :display-name "Domain"}
               {:tag :host,      :display-name "Host"}]
              (->> (lib/returned-columns query-regex)
                   (m/find-first #(= (:name %) "EMAIL"))
                   (lib/column-extractions query-regex)))))
    (testing "when the database does not support :regex email extraction is not available"
      (is (empty? (->> (lib/returned-columns query-no-regex)
                       (m/find-first #(= (:name %) "EMAIL"))
                       (lib/column-extractions query-no-regex)))))))
