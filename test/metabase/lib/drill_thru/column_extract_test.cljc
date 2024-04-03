(ns metabase.lib.drill-thru.column-extract-test
  "See also [[metabase.query-processor-test.drill-thru-e2e-test/quick-filter-on-bucketed-date-test]]"
  (:require
   [clojure.test :refer [are deftest testing]]
   [medley.core :as m]
   [metabase.lib.core :as lib]
   [metabase.lib.drill-thru.column-extract :as lib.drill-thru.column-extract]
   [metabase.lib.drill-thru.test-util :as lib.drill-thru.tu]
   [metabase.lib.drill-thru.test-util.canned :as canned]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.test-metadata :as meta]
   [metabase.lib.test-util :as lib.tu]
   [metabase.util :as u]
   #?@(:clj  ([metabase.test :as mt])
       :cljs ([metabase.test-runner.assert-exprs.approximately-equal]))))

#?(:cljs (comment metabase.test-runner.assert-exprs.approximately-equal/keep-me))

(def ^:private time-extraction-units
  [{:key :hour-of-day, :display-name "Hour of day"}])

(def ^:private date-extraction-units
  [{:key :day-of-month,    :display-name "Day of month"}
   {:key :day-of-week,     :display-name "Day of week"}
   {:key :month-of-year,   :display-name "Month of year"}
   {:key :quarter-of-year, :display-name "Quarter of year"}
   {:key :year,            :display-name "Year"}])

(def ^:private datetime-extraction-units
  (concat time-extraction-units date-extraction-units))

(deftest ^:parallel column-extract-availability-test
  (testing "column-extract is available for column clicks on temporal and URL columns"
    (canned/canned-test
      :drill-thru/column-extract
      (fn [_test-case {:keys [column] :as _context} {:keys [click column-type]}]
        (and (= click :header)
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

(defn- case-extraction
  "Returns `=?` friendly value for a `:case`-based extraction, eg. `:day-of-week`.

  `(case-extraction :get-month \"Month of year\" (meta/id :orders :created-at) [\"Jan\" \"Feb\" ... \"Dec\"])`"
  [extraction expression-name field-id labels]
  [:case {:lib/expression-name expression-name}
   (vec (for [[index label] (m/indexed labels)]
          [[:= {} [extraction {} [:field {} field-id]] (inc index)] label]))
   ""])

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
                                 [(case-extraction :get-month "Month of year" (meta/id :orders :created-at)
                                                   ["Jan" "Feb" "Mar" "Apr" "May" "Jun"
                                                    "Jul" "Aug" "Sep" "Oct" "Nov" "Dec"])]}]}})))

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
                                 [(case-extraction :get-day-of-week "Day of week" (meta/id :orders :created-at)
                                                   ["Sunday" "Monday" "Tuesday" "Wednesday" "Thursday"
                                                    "Friday" "Saturday"])]}]}})))

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
                                 [(case-extraction :get-quarter "Quarter of year" (meta/id :orders :created-at)
                                                   ["Q1" "Q2" "Q3" "Q4"])]}]}})))

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

#?(:clj
   ;; TODO: This should be possible to run in CLJS if we have a library for setting the locale in JS.
   ;; Metabase FE has this in frontend/src/metabase/lib/i18n.js but that's loaded after the CLJS.
   (deftest ^:synchronized apply-column-extract-test-4-i18n-labels
     (testing "column-extract with custom labels get i18n'd"
       (mt/with-locale "es"
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
                                       [(case-extraction :get-day-of-week "Day of week" (meta/id :orders :created-at)
                                                         ["domingo" "lunes" "martes" "miércoles" "jueves"
                                                          "viernes" "sábado"])]}]}})))))

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

(def ^:private url->host-regex
  #?(:clj  @#'lib.drill-thru.column-extract/url->host-regex
     :cljs lib.drill-thru.column-extract/url->host-regex))

(def ^:private host->domain-regex
  #?(:clj  @#'lib.drill-thru.column-extract/host->domain-regex
     :cljs lib.drill-thru.column-extract/host->domain-regex))

(def ^:private host->subdomain-regex
  #?(:clj  @#'lib.drill-thru.column-extract/host->subdomain-regex
     :cljs lib.drill-thru.column-extract/host->subdomain-regex))

(def ^:private email->domain-regex
  #?(:clj  @#'lib.drill-thru.column-extract/email->domain-regex
     :cljs lib.drill-thru.column-extract/email->domain-regex))

(deftest ^:parallel column-extract-url->domain-test
  ;; There's no URL columns in the same dataset, but let's pretend there's one called People.HOMEPAGE.
  (let [homepage (assoc (meta/field-metadata :people :email)
                        :id             9999001
                        :name           "HOMEPAGE"
                        :display-name   "Homepage URL"
                        :base-type      :type/Text
                        :effective-type :type/Text
                        :semantic-type  :type/URL)
        mp       (lib/composed-metadata-provider
                   (lib.tu/mock-metadata-provider {:fields [homepage]})
                   meta/metadata-provider)
        query    (lib/query mp (lib.metadata/table mp (meta/id :people)))]
    (testing "Extracting Domain"
      (lib.drill-thru.tu/test-drill-application
        {:drill-type     :drill-thru/column-extract
         :click-type     :header
         :query-type     :unaggregated
         :column-name    "HOMEPAGE"
         :custom-query   query
         :expected       {:type         :drill-thru/column-extract
                          :display-name "Extract domain, subdomain…"
                          :extractions  [{:key :domain,    :display-name "Domain"}
                                         {:key :subdomain, :display-name "Subdomain"}]}
         :drill-args     ["domain"]
         :expected-query {:stages [{:expressions [[:regex-match-first {:lib/expression-name "Domain"}
                                                   [:regex-match-first {}
                                                    [:field {} 9999001]
                                                    (u/regex->str url->host-regex)]
                                                   (u/regex->str host->domain-regex)]]}]}}))
    (testing "Extracting Subdomain"
      (lib.drill-thru.tu/test-drill-application
        {:drill-type     :drill-thru/column-extract
         :click-type     :header
         :query-type     :unaggregated
         :column-name    "HOMEPAGE"
         :custom-query   query
         :expected       {:type         :drill-thru/column-extract
                          :display-name "Extract domain, subdomain…"
                          :extractions  [{:key :domain,    :display-name "Domain"}
                                         {:key :subdomain, :display-name "Subdomain"}]}
         :drill-args     ["subdomain"]
         :expected-query {:stages [{:expressions [[:regex-match-first {:lib/expression-name "Subdomain"}
                                                   [:regex-match-first {}
                                                    [:field {} 9999001]
                                                    (u/regex->str url->host-regex)]
                                                   (u/regex->str host->subdomain-regex)]]}]}}))))

(deftest ^:parallel url->host-regex-test
  (are [host url] (= host (second (re-find url->host-regex url)))
       "cdbaby.com"         "https://cdbaby.com/some.txt"
       "fema.gov"           "https://fema.gov/some/path/Vatini?search=foo"
       "www.geocities.jp"   "https://www.geocities.jp/some/path/Turbitt?search=foo"
       "jalbum.net"         "https://jalbum.net/some/path/Kirsz?search=foo"
       "usa.gov"            "https://usa.gov/some/path/Curdell?search=foo"
       "taxes.va.gov"       "http://taxes.va.gov/some/path/Marritt?search=foo"
       "log.stuff.gmpg.org" "http://log.stuff.gmpg.org/some/path/Cambden?search=foo"
       "hatena.ne.jp"       "http://hatena.ne.jp/"
       "telegraph.co.uk"    "//telegraph.co.uk?foo=bar#tail"
       "bbc.co.uk"          "bbc.co.uk/some/path?search=foo"))

(deftest ^:parallel host->domain-regex-test
  (are [domain host] (= domain (second (re-find host->domain-regex host)))
       ;; Easy cases: second-last part is the domain.
       "cdbaby"    "cdbaby.com"
       "fema"      "fema.gov"
       "geocities" "www.geocities.jp"
       "jalbum"    "sub.jalbum.net"
       "jalbum"    "subdomains.go.here.jalbum.net"
       "gmpg"      "log.stuff.gmpg.org"

       ;; The second-last part is the domain even if it's short, sometimes.
       "usa"       "usa.gov"
       "va"        "va.gov"

       ;; Oops, we picked a subdomain! But see below.
       "taxes"     "taxes.va.gov" ; True domain is va
       "hatena"    "hatena.ne.jp" ; True domain is ne

       ;; Sometimes the second-last part is a short suffix.
       ;; Mozilla maintains a huge list of these, but since this has to go into a regex and get passed to the database,
       ;; we use a best-effort matcher that gets the domain right most of the time.
       "telegraph" "telegraph.co.uk"
       "bbc"       "bbc.co.uk"
       "dot"       "dot.va.gov"

       ;; "www" is disregarded as a possible subdomain.
       "usa"       "www.usa.gov"
       "va"        "www.va.gov"
       "dot"       "www.dot.va.gov"))

(deftest ^:parallel host->subdomain-regex-test
  (are [subdomain host] (= subdomain (second (re-find host->subdomain-regex host)))
       ;; Blanks. "www" doesn't count.
       nil "cdbaby.com"
       nil "fema.gov"
       nil "www.geocities.jp"
       nil "usa.gov"
       nil "va.gov"

       ;; Basics - taking the first segment that isn't "www", IF it isn't the domain.
       "sub"        "sub.jalbum.net"
       "subdomains" "subdomains.go.here.jalbum.net"
       "log"        "log.stuff.gmpg.org"

       ;; Oops, we missed those. This is the reverse of the problem when picking the domain.
       nil "taxes.va.gov" ; True domain is va, subdomain is taxes.
       nil "hatena.ne.jp" ; True domain is ne, subdomain is hatena.

       ;; Sometimes the second-last part is a short suffix.
       ;; Mozilla maintains a huge list of these, but since this has to go into a regex and get passed to the database,
       ;; we use a best-effort matcher that gets the domain right most of the time.
       nil         "telegraph.co.uk"
       "local"     "local.news.telegraph.co.uk"
       nil         "bbc.co.uk"
       "video"     "video.bbc.co.uk"
       ;; "www" is disregarded as a possible subdomain, so these are also incorrect.
       nil         "www.usa.gov"
       nil         "www.dot.va.gov"
       "licensing" "www.licensing.dot.va.gov"))

(deftest ^:parallel email->domain-regex-test
  (are [domain email] (= domain (re-find email->domain-regex email))
       "metabase"   "braden@metabase.com"
       "homeoffice" "mholmes@homeoffice.gov.uk"
       "someisp"    "john.smith@mail.someisp.com"
       "amazon"     "trk@amazon.co.uk"
       "hatena"     "takashi@hatena.ne.jp"
       "ne"         "takashi@www.ne.jp"))
