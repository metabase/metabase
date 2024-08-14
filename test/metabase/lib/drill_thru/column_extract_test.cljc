(ns metabase.lib.drill-thru.column-extract-test
  "See also [[metabase.query-processor-test.drill-thru-e2e-test/quick-filter-on-bucketed-date-test]]"
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.lib.core :as lib]
   [metabase.lib.drill-thru.column-extract :as lib.drill-thru.column-extract]
   [metabase.lib.drill-thru.test-util :as lib.drill-thru.tu]
   [metabase.lib.drill-thru.test-util.canned :as canned]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.test-metadata :as meta]
   [metabase.lib.test-util :as lib.tu]
   #?@(:cljs ([metabase.test-runner.assert-exprs.approximately-equal]))))

#?(:cljs (comment metabase.test-runner.assert-exprs.approximately-equal/keep-me))

(def ^:private time-extraction-units
  [{:tag :hour-of-day, :display-name "Hour of day"}])

(def ^:private date-extraction-units
  [{:tag :day-of-month,    :display-name "Day of month"}
   {:tag :day-of-week,     :display-name "Day of week"}
   {:tag :month-of-year,   :display-name "Month of year"}
   {:tag :quarter-of-year, :display-name "Quarter of year"}
   {:tag :year,            :display-name "Year"}])

(def ^:private datetime-extraction-units
  (concat time-extraction-units date-extraction-units))

(deftest ^:parallel column-extract-availability-test
  (testing "column-extract is available for column clicks on temporal, URL and Email columns"
    (canned/canned-test
      :drill-thru/column-extract
      (fn [test-case {:keys [column] :as _context} {:keys [click column-type]}]
        (and (= click :header)
             (not (:native? test-case))
             (or (= column-type :datetime)
                 (#{:type/URL :type/Email} (:semantic-type column))))))))

(deftest ^:parallel returns-column-extract-test-1
  (lib.drill-thru.tu/test-returns-drill
   {:drill-type  :drill-thru/column-extract
    :click-type  :header
    :query-type  :unaggregated
    :column-name "CREATED_AT"
    :expected    {:type        :drill-thru/column-extract
                  :extractions datetime-extraction-units}}))

(deftest ^:parallel apply-column-extract-test-1a-month-of-year
  (testing "column-extract on a regular field without aggregations adds a column in this stage"
    (lib.drill-thru.tu/test-drill-application
     {:click-type     :header
      :query-type     :unaggregated
      :column-name    "CREATED_AT"
      :drill-type     :drill-thru/column-extract
      :expected       {:type         :drill-thru/column-extract
                       :extractions  datetime-extraction-units
                       ;; Query unchanged
                       :query        (get-in lib.drill-thru.tu/test-queries ["ORDERS" :unaggregated :query])
                       :stage-number -1}
      :drill-args     ["month-of-year"]
      :expected-query {:stages [{:expressions
                                 [[:month-name {:lib/expression-name "Month of year"}
                                   [:get-month {} [:field {} (meta/id :orders :created-at)]]]]}]}})))

(deftest ^:parallel apply-column-extract-test-1b-day-of-week
  (testing "column-extract on a regular field without aggregations adds a column in this stage"
    (lib.drill-thru.tu/test-drill-application
     {:click-type     :header
      :query-type     :unaggregated
      :column-name    "CREATED_AT"
      :drill-type     :drill-thru/column-extract
      :expected       {:type         :drill-thru/column-extract
                       :extractions  datetime-extraction-units
                       ;; Query unchanged
                       :query        (get-in lib.drill-thru.tu/test-queries ["ORDERS" :unaggregated :query])
                       :stage-number -1}
      :drill-args     ["day-of-week"]
      :expected-query {:stages [{:expressions
                                 [[:day-name {:lib/expression-name "Day of week"}
                                   [:get-day-of-week {} [:field {} (meta/id :orders :created-at)]]]]}]}})))

(deftest ^:parallel apply-column-extract-test-1c-quarter
  (testing "column-extract on a regular field without aggregations adds a column in this stage"
    (lib.drill-thru.tu/test-drill-application
     {:click-type     :header
      :query-type     :unaggregated
      :column-name    "CREATED_AT"
      :drill-type     :drill-thru/column-extract
      :expected       {:type         :drill-thru/column-extract
                       :extractions  datetime-extraction-units
                       ;; Query unchanged
                       :query        (get-in lib.drill-thru.tu/test-queries ["ORDERS" :unaggregated :query])
                       :stage-number -1}
      :drill-args     ["quarter-of-year"]
      :expected-query {:stages [{:expressions
                                 [[:quarter-name {:lib/expression-name "Quarter of year"}
                                   [:get-quarter {} [:field {} (meta/id :orders :created-at)]]]]}]}})))

(deftest ^:parallel apply-column-extract-test-1d-year
  (testing "column-extract on a regular field without aggregations adds a column in this stage"
    (lib.drill-thru.tu/test-drill-application
     {:click-type     :header
      :query-type     :unaggregated
      :column-name    "CREATED_AT"
      :drill-type     :drill-thru/column-extract
      :expected       {:type         :drill-thru/column-extract
                       :extractions  datetime-extraction-units
                       ;; Query unchanged
                       :query        (get-in lib.drill-thru.tu/test-queries ["ORDERS" :unaggregated :query])
                       :stage-number -1}
      :drill-args     ["year"]
      :expected-query {:stages [{:expressions [[:get-year {:lib/expression-name "Year"}
                                                [:field {} (meta/id :orders :created-at)]]]}]}})))

(deftest ^:parallel apply-column-extract-test-1e-day-of-month
  (testing "column-extract on a regular field without aggregations adds a column in this stage"
    (lib.drill-thru.tu/test-drill-application
     {:click-type     :header
      :query-type     :unaggregated
      :column-name    "CREATED_AT"
      :drill-type     :drill-thru/column-extract
      :expected       {:type         :drill-thru/column-extract
                       :extractions  datetime-extraction-units
                       ;; Query unchanged
                       :query        (get-in lib.drill-thru.tu/test-queries ["ORDERS" :unaggregated :query])
                       :stage-number -1}
      :drill-args     ["day-of-month"]
      :expected-query {:stages [{:expressions [[:get-day {:lib/expression-name "Day of month"}
                                                [:field {} (meta/id :orders :created-at)]]]}]}})))

(deftest ^:parallel apply-column-extract-test-1f-hour-of-day
  (testing "column-extract on a regular field without aggregations adds a column in this stage"
    (lib.drill-thru.tu/test-drill-application
     {:click-type     :header
      :query-type     :unaggregated
      :column-name    "CREATED_AT"
      :drill-type     :drill-thru/column-extract
      :expected       {:type         :drill-thru/column-extract
                       :extractions  datetime-extraction-units
                       ;; Query unchanged
                       :query        (get-in lib.drill-thru.tu/test-queries ["ORDERS" :unaggregated :query])
                       :stage-number -1}
      :drill-args     ["hour-of-day"]
      :expected-query {:stages [{:expressions [[:get-hour {:lib/expression-name "Hour of day"}
                                                [:field {} (meta/id :orders :created-at)]]]}]}})))

(deftest ^:parallel apply-column-extract-test-2-duplicate-name
  (testing "column-extract on the same field twice disambiguates the expression names"
    (let [;; The standard ORDERS query but with a :day-of-month extraction already applied.
          query (-> (get-in lib.drill-thru.tu/test-queries ["ORDERS" :unaggregated :query])
                    (lib/expression -1 "Day of month" (lib/get-day (meta/field-metadata :orders :created-at))))]
      (lib.drill-thru.tu/test-drill-application
        {:click-type     :header
         :query-type     :unaggregated
         :column-name    "CREATED_AT"
         :drill-type     :drill-thru/column-extract
         :custom-query   query
         :expected       {:type         :drill-thru/column-extract
                          :extractions  datetime-extraction-units
                          :query        query
                          :stage-number -1}
         :drill-args     ["day-of-month"]
         :expected-query {:stages [{:expressions [;; The original
                                                  [:get-day {:lib/expression-name "Day of month"}
                                                   [:field {} (meta/id :orders :created-at)]]
                                                  ;; The newly added one
                                                  [:get-day {:lib/expression-name "Day of month_2"}
                                                   [:field {} (meta/id :orders :created-at)]]]}]}}))))

(deftest ^:parallel apply-column-extract-test-3-aggregated
  (testing "column-extract on an aggregated query appends a new stage"
    (let [query (-> (lib/query meta/metadata-provider (meta/table-metadata :orders))
                    (lib/aggregate (lib/max (meta/field-metadata :orders :created-at)))
                    (lib/breakout (meta/field-metadata :products :category)))]
      (lib.drill-thru.tu/test-drill-application
        {:click-type     :header
         :query-type     :aggregated
         :column-name    "max"
         :drill-type     :drill-thru/column-extract
         :custom-query   query
         :expected       {:type         :drill-thru/column-extract
                          :extractions  datetime-extraction-units
                          :query        (lib/append-stage query)
                          :stage-number -1}
         :drill-args     ["day-of-month"]
         :expected-query {:stages [(get-in query [:stages 0])
                                   {:expressions [[:get-day {:lib/expression-name "Day of month"}
                                                   [:field {} "max"]]]}]}}))))

(deftest ^:parallel column-extract-relevant-units-test-1-time
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
    (lib.drill-thru.tu/test-returns-drill
      {:drill-type   :drill-thru/column-extract
       :click-type   :header
       :query-type   :unaggregated
       :column-name  "SHIP_TIME"
       :custom-query query
       :expected     {:type        :drill-thru/column-extract
                      :extractions time-extraction-units}})))

(deftest ^:parallel column-extract-relevant-units-test-2-date
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
    (lib.drill-thru.tu/test-returns-drill
      {:drill-type   :drill-thru/column-extract
       :click-type   :header
       :query-type   :unaggregated
       :column-name  "ARRIVAL_DATE"
       :custom-query query
       :expected     {:type        :drill-thru/column-extract
                      :extractions date-extraction-units}})))

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

(deftest ^:parallel column-extract-url->domain-test
  ;; There's no URL columns in the same dataset, but let's pretend there's one called People.HOMEPAGE.
  (let [mp       (homepage-provider)
        query    (lib/query mp (lib.metadata/table mp (meta/id :people)))
        expected {:type         :drill-thru/column-extract
                  :display-name "Extract domain, subdomain…"
                  :extractions  [{:tag :domain,    :display-name "Domain"}
                                 {:tag :subdomain, :display-name "Subdomain"}
                                 {:tag :host,      :display-name "Host"}]}]
    (testing "Extracting Domain"
      (lib.drill-thru.tu/test-drill-application
        {:drill-type     :drill-thru/column-extract
         :click-type     :header
         :query-type     :unaggregated
         :column-name    "HOMEPAGE"
         :custom-query   query
         :expected       expected
         :drill-args     ["domain"]
         :expected-query {:stages [{:expressions [[:domain {:lib/expression-name "Domain"}
                                                   [:field {} 9999001]]]}]}}))
    (testing "Extracting Subdomain"
      (lib.drill-thru.tu/test-drill-application
        {:drill-type     :drill-thru/column-extract
         :click-type     :header
         :query-type     :unaggregated
         :column-name    "HOMEPAGE"
         :custom-query   query
         :expected       expected
         :drill-args     ["subdomain"]
         :expected-query {:stages [{:expressions [[:subdomain {:lib/expression-name "Subdomain"}
                                                   [:field {} 9999001]]]}]}}))
    (testing "Extracting Host"
      (lib.drill-thru.tu/test-drill-application
        {:drill-type     :drill-thru/column-extract
         :click-type     :header
         :query-type     :unaggregated
         :column-name    "HOMEPAGE"
         :custom-query   query
         :expected       expected
         :drill-args     ["host"]
         :expected-query {:stages [{:expressions [[:host {:lib/expression-name "Host"}
                                                   [:field {} 9999001]]]}]}}))))

(deftest ^:parallel column-extract-url-requires-regex-test
  (let [query-regex    (lib/query (homepage-provider) (meta/table-metadata :people))
        no-regex       (homepage-provider (meta/updated-metadata-provider update :features disj :regex))
        query-no-regex (lib/query no-regex (meta/table-metadata :people))]
    (testing "when the database supports :regex URL extraction is available"
      (lib.drill-thru.tu/test-drill-application
        {:drill-type     :drill-thru/column-extract
         :click-type     :header
         :query-type     :unaggregated
         :column-name    "HOMEPAGE"
         :custom-query   query-regex
         :expected       {:type         :drill-thru/column-extract
                          :display-name "Extract domain, subdomain…"
                          :extractions  [{:tag :domain,    :display-name "Domain"}
                                         {:tag :subdomain, :display-name "Subdomain"}
                                         {:tag :host,      :display-name "Host"}]}
         :drill-args     ["subdomain"]
         :expected-query {:stages [{:expressions [[:subdomain {:lib/expression-name "Subdomain"}
                                                   [:field {} 9999001]]]}]}}))
    (testing "when the database does not support :regex URL extraction is not available"
      (lib.drill-thru.tu/test-drill-not-returned
        {:drill-type     :drill-thru/column-extract
         :click-type     :header
         :query-type     :unaggregated
         :column-name    "HOMEPAGE"
         :custom-query   query-no-regex}))))

(deftest ^:parallel column-extract-email-requires-regex-test
  (let [query-regex    (lib/query meta/metadata-provider (meta/table-metadata :people))
        no-regex       (meta/updated-metadata-provider update :features disj :regex)
        query-no-regex (lib/query no-regex (meta/table-metadata :people))]
    (testing "when the database supports :regex email extraction is available"
      (lib.drill-thru.tu/test-drill-application
        {:drill-type     :drill-thru/column-extract
         :click-type     :header
         :query-type     :unaggregated
         :column-name    "EMAIL"
         :custom-query   query-regex
         :expected       {:type         :drill-thru/column-extract
                          :display-name "Extract domain, host…"
                          :extractions  [{:tag :domain, :display-name "Domain"}
                                         {:tag :host,   :display-name "Host"}]}
         :drill-args     ["domain"]
         :expected-query {:stages [{:expressions [[:domain {:lib/expression-name "Domain"}
                                                   [:field {} (meta/id :people :email)]]]}]}}))
    (testing "when the database does not support :regex email extraction is not available"
      (lib.drill-thru.tu/test-drill-not-returned
        {:drill-type     :drill-thru/column-extract
         :click-type     :header
         :query-type     :unaggregated
         :column-name    "EMAIL"
         :custom-query   query-no-regex}))))

(deftest ^:parallel extractions-for-drill-test
  (let [drill (lib.drill-thru.tu/test-returns-drill
                {:click-type     :header
                 :query-type     :unaggregated
                 :column-name    "CREATED_AT"
                 :drill-type     :drill-thru/column-extract
                 :expected       {:type         :drill-thru/column-extract
                                  :extractions  datetime-extraction-units}})]
    (is (=? datetime-extraction-units
            (lib.drill-thru.column-extract/extractions-for-drill drill)))))
