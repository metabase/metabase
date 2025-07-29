(ns metabase.query-processor.streaming-test
  (:require
   [clojure.core.async :as a]
   [clojure.data.csv :as csv]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [medley.core :as m]
   [metabase.embedding.api.embed-test :as embed-test]
   [metabase.lib.test-util :as lib.tu]
   [metabase.models.visualization-settings :as mb.viz]
   [metabase.query-processor :as qp]
   [metabase.query-processor.pipeline :as qp.pipeline]
   [metabase.query-processor.schema :as qp.schema]
   [metabase.query-processor.store :as qp.store]
   [metabase.query-processor.streaming :as qp.streaming]
   [metabase.query-processor.streaming.test-util :as streaming.test-util]
   [metabase.query-processor.streaming.xlsx-test :as xlsx-test]
   [metabase.server.protocols :as server.protocols]
   [metabase.test :as mt]
   [metabase.util :as u]
   [metabase.util.json :as json]
   [toucan2.pipeline :as t2.pipeline])
  (:import
   (jakarta.servlet AsyncContext ServletOutputStream)
   (jakarta.servlet.http HttpServletResponse)))

(set! *warn-on-reflection* true)

(defn- maybe-remove-checksum
  "remove metadata checksum if present because it can change between runs if encryption is in play"
  [x]
  (cond-> x
    (map? x) (m/dissoc-in [:data :results_metadata :checksum])))

(defn- expected-results* [export-format query]
  (let [results (-> (streaming.test-util/expected-results export-format (qp/process-query query))
                    maybe-remove-checksum)]
    (cond-> results
      (map? results) (update-in [:data :cols] (fn [cols]
                                                (for [col cols]
                                                  (m/filter-keys simple-keyword? col)))))))

(defn- basic-actual-results* [export-format query]
  (maybe-remove-checksum (streaming.test-util/process-query-basic-streaming export-format query)))

(deftest basic-streaming-test
  (testing "Test that the underlying qp.streaming context logic itself works correctly. Not an end-to-end test!"
    (let [query (mt/mbql-query venues
                  {:order-by [[:asc $id]]
                   :limit    5})]
      (doseq [export-format qp.schema/export-formats]
        (testing (u/colorize :yellow export-format)
          (case export-format
            :csv (is (= [["ID" "Name" "Category ID" "Latitude" "Longitude" "Price"]
                         ["1" "Red Medicine" "4" "10.06460000° N" "165.37400000° W" "3"]
                         ["2" "Stout Burgers & Beers" "11" "34.09960000° N" "118.32900000° W" "2"]
                         ["3" "The Apple Pan" "11" "34.04060000° N" "118.42800000° W" "2"]
                         ["4" "Wurstküche" "29" "33.99970000° N" "118.46500000° W" "2"]
                         ["5" "Brite Spot Family Restaurant" "20" "34.07780000° N" "118.26100000° W" "2"]]
                        (basic-actual-results* export-format query)))
            ;; Consistent formatting with CSVs and the UI
            :json (is (= [{"ID" "1",
                           "Name" "Red Medicine",
                           "Category ID" "4",
                           "Latitude" "10.06460000° N",
                           "Longitude" "165.37400000° W",
                           "Price" "3"}
                          {"ID" "2",
                           "Name" "Stout Burgers & Beers",
                           "Category ID" "11",
                           "Latitude" "34.09960000° N",
                           "Longitude" "118.32900000° W",
                           "Price" "2"}
                          {"ID" "3",
                           "Name" "The Apple Pan",
                           "Category ID" "11",
                           "Latitude" "34.04060000° N",
                           "Longitude" "118.42800000° W",
                           "Price" "2"}
                          {"ID" "4",
                           "Name" "Wurstküche",
                           "Category ID" "29",
                           "Latitude" "33.99970000° N",
                           "Longitude" "118.46500000° W",
                           "Price" "2"}
                          {"ID" "5",
                           "Name" "Brite Spot Family Restaurant",
                           "Category ID" "20",
                           "Latitude" "34.07780000° N",
                           "Longitude" "118.26100000° W",
                           "Price" "2"}]
                         (map #(update-keys % name) (basic-actual-results* export-format query))))
            :xlsx (is (= [{"ID" 1.0,
                           "Name" "Red Medicine",
                           "Category ID" 4.0,
                           "Latitude" "10.06460000° N",
                           "Longitude" "165.37400000° W",
                           "Price" 3.0}
                          {"ID" 2.0,
                           "Name" "Stout Burgers & Beers",
                           "Category ID" 11.0,
                           "Latitude" "34.09960000° N",
                           "Longitude" "118.32900000° W",
                           "Price" 2.0}
                          {"ID" 3.0,
                           "Name" "The Apple Pan",
                           "Category ID" 11.0,
                           "Latitude" "34.04060000° N",
                           "Longitude" "118.42800000° W",
                           "Price" 2.0}
                          {"ID" 4.0,
                           "Name" "Wurstküche",
                           "Category ID" 29.0,
                           "Latitude" "33.99970000° N",
                           "Longitude" "118.46500000° W",
                           "Price" 2.0}
                          {"ID" 5.0,
                           "Name" "Brite Spot Family Restaurant",
                           "Category ID" 20.0,
                           "Latitude" "34.07780000° N",
                           "Longitude" "118.26100000° W",
                           "Price" 2.0}]
                         (basic-actual-results* export-format query)))
            (is (=? (expected-results* export-format query)
                    (basic-actual-results* export-format query)))))))))

(defn- actual-results* [export-format query]
  (maybe-remove-checksum (streaming.test-util/process-query-api-response-streaming export-format query)))

(defn- compare-results [export-format query]
  (is (=? (expected-results* export-format query)
          (cond-> (actual-results* export-format query)
            (= export-format :api)
            (dissoc :cached)))))

(deftest ^:parallel streaming-response-test
  (testing "Test that the actual results going thru the same steps as an API response are correct."
    (compare-results :api (mt/mbql-query venues {:limit 5}))))

(deftest ^:parallel utf8-test
  ;; UTF-8 isn't currently working for XLSX -- fix me
  ;; CSVs round decimals to 2 digits without viz-settings so are not identical to results from expected-results*
  (doseq [export-format (disj qp.schema/export-formats :xlsx :csv)]
    (testing (u/colorize :yellow export-format)
      (testing "Make sure our various streaming formats properly write values as UTF-8."
        (testing "A query that will have a little → in its name"
          (compare-results export-format (mt/mbql-query venues
                                           {:fields   [$name $category_id->categories.name]
                                            :order-by [[:asc $id]]
                                            :limit    5})))
        (testing "A query with emoji and other fancy unicode"
          (let [[sql & args] (t2.pipeline/compile* {:select [["Cam 𝌆 Saul 💩" :cam]]})]
            (compare-results export-format (mt/native-query {:query  sql
                                                             :params args}))))))))

(def ^:private ^:dynamic *number-of-cans* nil)

(deftest ^:parallel preserve-thread-bindings-test
  (testing "Bindings established outside the `streaming-response` should be preserved inside the body"
    (with-open [os (java.io.ByteArrayOutputStream.)]
      (let [streaming-response (binding [*number-of-cans* 2]
                                 (qp.streaming/streaming-response [rff :json]
                                   (let [metadata {:cols [{:name "num_cans", :base_type :type/Integer}]}
                                         rows     [[*number-of-cans*]]]
                                     (qp.pipeline/*reduce* rff metadata rows))))
            complete-promise   (promise)]
        (server.protocols/respond streaming-response
                                  {:response      (reify HttpServletResponse
                                                    (setStatus [_ _])
                                                    (setHeader [_ _ _])
                                                    (setContentType [_ _])
                                                    (getOutputStream [_]
                                                      (proxy [ServletOutputStream] []
                                                        (write
                                                          ([byytes]
                                                           (.write os ^bytes byytes))
                                                          ([byytes offset length]
                                                           (.write os ^bytes byytes offset length))))))
                                   :async-context (reify AsyncContext
                                                    (complete [_]
                                                      (deliver complete-promise true)))})
        (is (true?
             (deref complete-promise 1000 ::timed-out)))
        (let [response-str (String. (.toByteArray os) "UTF-8")]
          (is (= "[{\"num_cans\":\"2\"}]"
                 (str/replace response-str #"\n+" "")))
          (is (= [{:num_cans "2"}]
                 (json/decode+kw response-str))))))))

(defmulti ^:private first-row-map
  "Return the first row in `results` as a map with `col-names` as the keys."
  {:arglists '([export-format results col-names])}
  (fn [export-format _ _] export-format))

(defmethod first-row-map :default
  [_ results _]
  results)

(defmethod first-row-map :api
  [_ results col-names]
  (zipmap col-names (mt/first-row results)))

(defmethod first-row-map :xlsx
  [_ results _]
  (first results))

(defmethod first-row-map :csv
  [_ [_ row] col-names]
  (zipmap col-names row))

(defmethod first-row-map :json
  [_ [row] col-names]
  ;; this only works if the map is small enough that it's an still an array map and thus preserving the original order
  (zipmap col-names (vals row)))

;;; see also [[metabase.query-processor.streaming.xlsx-test/report-timezone-test]] (UPDATE: THIS TEST DOESN'T ACTUALLY
;;; EXIST ANYMORE, BUT MAYBE YOU CAN GO LOOKING FOR IT IF YOU NEED TO?)
;;;
;;; This is only running against Postgres since we're just testing general behavior for formatting different types
#_{:clj-kondo/ignore [:metabase/disallow-hardcoded-driver-names-in-tests]}
(deftest report-timezone-test
  (testing "Export downloads should format stuff with the report timezone rather than UTC (#13677)"
    (mt/test-driver :postgres
      (let [query     (mt/dataset attempted-murders
                        (mt/mbql-query attempts
                          {:fields   [$date $datetime $datetime_ltz $datetime_tz $datetime_tz_id $time $time_ltz $time_tz]
                           :order-by [[:asc $id]]
                           :limit    1}))
            col-names [:date :datetime :datetime-ltz :datetime-tz :datetime-tz-id :time :time-ltz :time-tz]]
        (doseq [export-format qp.schema/export-formats]
          (letfn [(test-results [expected]
                    (testing (u/colorize :yellow export-format)
                      (is (= expected
                             (as-> (streaming.test-util/process-query-api-response-streaming export-format query col-names) results
                               (first-row-map export-format results col-names))))))]
            (testing "UTC results"
              (test-results
               (case export-format
                 (:csv :json)
                 ;; With the updates to make exports conform with FE behavior (See #36726) dates and times are now
                 ;; presented as they are in the FE. This is the eventual design for all exports.
                 {:date           "November 1, 2019"
                  :datetime       "November 1, 2019, 12:23 AM"
                  :datetime-ltz   "November 1, 2019, 7:23 AM"
                  :datetime-tz    "November 1, 2019, 7:23 AM"
                  :datetime-tz-id "November 1, 2019, 7:23 AM"
                  :time           "12:23 AM"
                  :time-ltz       "7:23 AM"
                  :time-tz        "7:23 AM"}

                 :api
                 {:date           "2019-11-01T00:00:00Z"
                  :datetime       "2019-11-01T00:23:18.331Z"
                  :datetime-ltz   "2019-11-01T07:23:18.331Z"
                  :datetime-tz    "2019-11-01T07:23:18.331Z"
                  :datetime-tz-id "2019-11-01T07:23:18.331Z"
                  :time           "00:23:18.331Z"
                  :time-ltz       "07:23:18.331Z"
                  :time-tz        "07:23:18.331Z"}

                 :xlsx
                 {:date           #inst "2019-11-01T00:00:00.000-00:00"
                  :datetime       #inst "2019-11-01T00:23:18.331-00:00"
                  :datetime-ltz   #inst "2019-11-01T07:23:18.331-00:00"
                  :datetime-tz    #inst "2019-11-01T07:23:18.331-00:00"
                  :datetime-tz-id #inst "2019-11-01T07:23:18.331-00:00"
                  ;; Excel actually displays these without the date info (which is zero), but since Docjure returns
                  ;; java.util.Dates by default when parsing an XLSX doc, they have the date info here.
                  :time           #inst "1899-12-31T00:23:18.000-00:00"
                  :time-ltz       #inst "1899-12-31T07:23:18.000-00:00"
                  :time-tz        #inst "1899-12-31T07:23:18.000-00:00"})))
            (mt/with-temporary-setting-values [report-timezone "US/Pacific"]
              (test-results
               (case export-format
                 (:csv :json)
                 ;; With the updates to make exports conform with FE behavior (See #36726) dates and times are now
                 ;; presented as they are in the FE. This is the eventual design for all exports.
                 {:date           "November 1, 2019"
                  :datetime       "November 1, 2019, 12:23 AM"
                  :datetime-ltz   "November 1, 2019, 12:23 AM"
                  :datetime-tz    "November 1, 2019, 12:23 AM"
                  :datetime-tz-id "November 1, 2019, 12:23 AM"
                  :time           "12:23 AM"
                  :time-ltz       "11:23 PM"
                  :time-tz        "11:23 PM"}

                 :api
                 {:date           "2019-11-01T00:00:00-07:00"
                  :datetime       "2019-11-01T00:23:18.331-07:00"
                  :datetime-ltz   "2019-11-01T00:23:18.331-07:00"
                  :datetime-tz    "2019-11-01T00:23:18.331-07:00"
                  :datetime-tz-id "2019-11-01T00:23:18.331-07:00"
                  :time           "00:23:18.331-08:00"
                  :time-ltz       "23:23:18.331-08:00"
                  :time-tz        "23:23:18.331-08:00"}

                 :xlsx
                 {:date           #inst "2019-11-01T00:00:00.000-00:00"
                  :datetime       #inst "2019-11-01T00:23:18.331-00:00"
                  :datetime-ltz   #inst "2019-11-01T00:23:18.331-00:00"
                  :datetime-tz    #inst "2019-11-01T00:23:18.331-00:00"
                  :datetime-tz-id #inst "2019-11-01T00:23:18.331-00:00"
                  :time           #inst "1899-12-31T00:23:18.000-00:00"
                  :time-ltz       #inst "1899-12-31T23:23:18.000-00:00"
                  :time-tz        #inst "1899-12-31T23:23:18.000-00:00"})))))))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                             Export E2E tests                                                   |
;;; +----------------------------------------------------------------------------------------------------------------+

;;; This section contains helper functions and tests that call export APIs to generate XLSX, CSV and JSON results,
;;; and assert on the results. These tests should generally be for ensuring that specific types of queries or
;;; behaviors work across all endpoints that generate exports. Tests that are specific to single endpoints
;;; (like `/api/dataset/:format`) should go in the corresponding test namespaces for those files
;;; (like `metabase.query-processor.api-test`).
;;; TODO: migrate the test cases above to use these functions, if possible

(defn do-test!
  "Test helper to enable writing API-level export tests across multiple export endpoints and formats."
  [message {:keys [query viz-settings assertions endpoints user]}]
  (testing message
    (let [query-json        (json/encode query)
          viz-settings-json (some-> viz-settings json/encode)
          public-uuid       (str (random-uuid))
          card-defaults     {:dataset_query query, :public_uuid public-uuid, :enable_embedding true}
          user              (or user :rasta)]
      (mt/with-temporary-setting-values [enable-public-sharing true
                                         enable-embedding-static true]
        (embed-test/with-new-secret-key!
          (mt/with-temp [:model/Card          card      (if viz-settings
                                                          (assoc card-defaults :visualization_settings viz-settings)
                                                          card-defaults)
                         :model/Dashboard     dashboard {:name "Test Dashboard"}
                         :model/DashboardCard dashcard  {:card_id (u/the-id card) :dashboard_id (u/the-id dashboard)}]
            (doseq [export-format (keys assertions)
                    endpoint      (or endpoints [:dataset :card :dashboard :public :embed])]
              (testing endpoint
                (case endpoint
                  :dataset
                  (let [results (mt/user-http-request user :post 200
                                                      (format "dataset/%s" (name export-format))
                                                      {:request-options {:as (if (= export-format :xlsx) :byte-array :string)}}
                                                      {:format_rows            true
                                                       :query                  query-json
                                                       :visualization_settings viz-settings-json})]
                    ((-> assertions export-format) results))

                  :card
                  (let [results (mt/user-http-request user :post 200
                                                      (format "card/%d/query/%s" (u/the-id card) (name export-format))
                                                      {:request-options {:as (if (= export-format :xlsx) :byte-array :string)}}
                                                      {:format_rows true})]
                    ((-> assertions export-format) results))

                  :dashboard
                  (let [results (mt/user-http-request user :post 200
                                                      (format "dashboard/%d/dashcard/%d/card/%d/query/%s"
                                                              (u/the-id dashboard)
                                                              (u/the-id dashcard)
                                                              (u/the-id card)
                                                              (name export-format))
                                                      {:request-options {:as (if (= export-format :xlsx) :byte-array :string)}}
                                                      {:format_rows true})]
                    ((-> assertions export-format) results))

                  ;; TODO -- what about the public dashcard endpoint???
                  :public
                  (let [results (mt/user-http-request user :get 200
                                                      (format "public/card/%s/query/%s?format_rows=true" public-uuid (name export-format))
                                                      {:request-options {:as (if (= export-format :xlsx) :byte-array :string)}})]
                    ((-> assertions export-format) results))

                  :embed
                  (let [results (mt/user-http-request user :get 200
                                                      (embed-test/card-query-url card (str "/" (name export-format)))
                                                      {:request-options {:as (if (= export-format :xlsx) :byte-array :string)}})]
                    ((-> assertions export-format) results)))))))))))

(defn- parse-json-results
  "Convert JSON results into a convenient format for test assertions. Results are transformed into a nested list,
  column titles in the first list as strings rather than keywords."
  [results]
  (let [col-titles (map name (keys (first results)))
        values     (map vals results)]
    (into values [col-titles])))

(defn- parse-csv-results
  [results]
  (if (map? results)
    (throw (ex-info "Error in CSV export" results))
    (csv/read-csv results)))

(deftest basic-export-test
  (do-test!
   "A simple export of a table succeeds"
   {:query      {:database (mt/id)
                 :type     :query
                 :query    {:source-table (mt/id :venues)
                            :limit        2}}
    :assertions {:csv  (fn [results]
                         (is (string? results))
                          ;; CSVs round decimals to 2 digits without viz-settings
                         (is (= [["ID" "Name" "Category ID" "Latitude" "Longitude" "Price"]
                                 ["1" "Red Medicine" "4" "10.06460000° N" "165.37400000° W" "3"]
                                 ["2" "Stout Burgers & Beers" "11" "34.09960000° N" "118.32900000° W" "2"]]
                                (parse-csv-results results))))

                 :json (fn [results]
                         (is (= [["ID" "Name" "Category ID" "Latitude" "Longitude" "Price"]
                                 ["1" "Red Medicine" "4" "10.06460000° N" "165.37400000° W" "3"]
                                 ["2" "Stout Burgers & Beers" "11" "34.09960000° N" "118.32900000° W" "2"]]
                                (parse-json-results results))))

                 :xlsx (fn [results]
                         (is (bytes? results))
                         (is (= [["ID" "Name" "Category ID" "Latitude" "Longitude" "Price"]
                                 [1.0 "Red Medicine" 4.0 "10.06460000° N" "165.37400000° W" 3.0]
                                 [2.0 "Stout Burgers & Beers" 11.0 "34.09960000° N" "118.32900000° W" 2.0]]
                                (xlsx-test/parse-xlsx-results results))))}}))

(deftest reordered-columns-test
  (do-test!
   "Reordered and hidden columns are respected in the export"
   {:query {:database (mt/id)
            :type     :query
            :query    {:source-table (mt/id :venues)
                       :limit 1}}

    :viz-settings {:column_settings {},
                   :table.columns
                   [{:name "NAME", :fieldRef [:field (mt/id :venues :name) nil], :enabled true}
                    {:name "ID", :fieldRef [:field (mt/id :venues :id) nil], :enabled true}
                    {:name "CATEGORY_ID", :fieldRef [:field (mt/id :venues :category_id) nil], :enabled true}
                    {:name "LATITUDE", :fieldRef [:field (mt/id :venues :latitude) nil], :enabled false}
                    {:name "LONGITUDE", :fieldRef [:field (mt/id :venues :longitude) nil], :enabled false}
                    {:name "PRICE", :fieldRef [:field (mt/id :venues :price) nil], :enabled true}]}

    :assertions {:csv (fn [results]
                        (is (= [["Name" "ID" "Category ID" "Price"]
                                ["Red Medicine" "1" "4" "3"]]
                               (parse-csv-results results))))

                 :json (fn [results]
                         (is (= [["Name" "ID" "Category ID" "Price"]
                                 ["Red Medicine" "1" "4" "3"]]
                                (parse-json-results results))))

                 :xlsx (fn [results]
                         (is (= [["Name" "ID" "Category ID" "Price"]
                                 ["Red Medicine" 1.0 4.0 3.0]]
                                (xlsx-test/parse-xlsx-results results))))}}))

(deftest remapped-columns-test
  (letfn [(testfn [remap-type]
            (let [col-name (case remap-type
                             :internal "Category ID [internal remap]"
                             :external "Category ID [external remap]")]
              (do-test!
               "Remapped values are used in exports"
               {:query      {:database (mt/id)
                             :type     :query
                             :query    {:source-table (mt/id :venues)
                                        :limit        1}}

                :assertions {:csv  (fn [results]
                                     (is (= [["ID" "Name" col-name "Latitude" "Longitude" "Price"]
                                             ["1" "Red Medicine" "Asian" "10.06460000° N" "165.37400000° W" "3"]]
                                            (parse-csv-results results))))

                             :json (fn [results]
                                     (is (= [["ID" "Name" col-name "Latitude" "Longitude" "Price"]
                                             ["1" "Red Medicine" "Asian" "10.06460000° N" "165.37400000° W" "3"]]
                                            (parse-json-results results))))

                             :xlsx (fn [results]
                                     (is (= [["ID" "Name" col-name "Latitude" "Longitude" "Price"]
                                             [1.0 "Red Medicine" "Asian" "10.06460000° N" "165.37400000° W" 3.0]]
                                            (xlsx-test/parse-xlsx-results results))))}})))]
    (qp.store/with-metadata-provider (lib.tu/remap-metadata-provider
                                      (mt/application-database-metadata-provider (mt/id))
                                      (mt/id :venues :category_id)
                                      (mt/id :categories :name))
      (testfn :external))
    (qp.store/with-metadata-provider (lib.tu/remap-metadata-provider
                                      (mt/application-database-metadata-provider (mt/id))
                                      (mt/id :venues :category_id)
                                      (mapv first (mt/rows (qp/process-query
                                                            (mt/mbql-query categories
                                                              {:fields [$name], :order-by [[:asc $id]]})))))
      (testfn :internal))))

(deftest join-export-test
  (do-test!
   "A query with a join can be exported succesfully"
   {:query       {:database (mt/id)
                  :query
                  {:source-table (mt/id :venues)
                   :joins
                   [{:fields       "all",
                     :source-table (mt/id :categories)
                     :condition    ["="
                                    ["field" (mt/id :venues :category_id) nil]
                                    ["field" (mt/id :categories :id) {:join-alias "Categories"}]],
                     :alias "Categories"}]
                   :limit 1}
                  :type "query"}

    :viz-settings {:column_settings {},
                   :table.columns
                   [{:name "ID", :fieldRef [:field (mt/id :venues :id) nil], :enabled true}
                    {:name "NAME", :fieldRef [:field (mt/id :venues :name) nil], :enabled true}
                    {:name "CATEGORY_ID", :fieldRef [:field (mt/id :venues :category_id) nil], :enabled true}
                    {:name "NAME_2", :fieldRef [:field (mt/id :categories :name) {:join-alias "Categories"}], :enabled true}]}

    :assertions {:csv (fn [results]
                        (is (= [["ID" "Name" "Category ID" "Categories → Name"]
                                ["1" "Red Medicine" "4" "Asian"]]
                               (parse-csv-results results))))

                 :json (fn [results]
                         (is (= [["ID" "Name" "Category ID" "Categories → Name"]
                                 ["1" "Red Medicine" "4" "Asian"]]
                                (parse-json-results results))))

                 :xlsx (fn [results]
                         (is (= [["ID" "Name" "Category ID" "Categories → Name"]
                                 [1.0 "Red Medicine" 4.0 "Asian"]]
                                (xlsx-test/parse-xlsx-results results))))}}))

(deftest self-join-export-test
  (do-test!
   "Export respects renamed self-joined columns #48046"
   {:query {:database (mt/id)
            :query
            {:source-table (mt/id :venues)
             :joins
             [{:fields       "all",
               :source-table (mt/id :venues)
               :condition    ["="
                              ["field" (mt/id :venues :id) nil]
                              ["field" (mt/id :venues :id) {:join-alias "Venues"}]],
               :alias        "Venues"}]
             :order-by     [["asc" ["field" (mt/id :venues :id) nil]]]
             :limit        1}
            :type     "query"}

    :viz-settings {:column_settings
                   {"[\"name\",\"NAME\"]"   {:column_title "Left Name"}
                    "[\"name\",\"NAME_2\"]" {:column_title "Right Name"}}
                   :table.columns
                   [{:name "ID", :fieldRef [:field (mt/id :venues :id) nil], :enabled true}
                    {:name "NAME", :fieldRef [:field (mt/id :venues :name) nil], :enabled true}
                    {:name "NAME_2", :fieldRef [:field (mt/id :venues :name) {:join-alias "Venues"}], :enabled true}]}

    :assertions {:csv (fn [results]
                        (is (= [["ID" "Left Name" "Right Name"]
                                ["1" "Red Medicine" "Red Medicine"]]
                               (parse-csv-results results))))

                 :json (fn [results]
                         (is (= [["ID" "Left Name" "Right Name"]
                                 ["1" "Red Medicine" "Red Medicine"]]
                                (parse-json-results results))))

                 :xlsx (fn [results]
                         (is (= [["ID" "Left Name" "Right Name"]
                                 [1.0 "Red Medicine" "Red Medicine"]]
                                (xlsx-test/parse-xlsx-results results))))}}))

(deftest native-query-test
  (mt/with-full-data-perms-for-all-users!
    (do-test!
     "A native query can be exported succesfully, and duplicate fields work in CSV/XLSX"
     {:query (mt/native-query {:query "SELECT id, id, name FROM venues LIMIT 1;"})

      :assertions {:csv (fn [results]
                          (is (= [["ID" "ID" "NAME"]
                                  ["1" "1" "Red Medicine"]]
                                 (parse-csv-results results))))

                   :json (fn [results]
                           ;; Second ID field is omitted since each col is stored in a JSON object rather than an array.
                           ;; TODO we should be able to include the second column if it is renamed.
                           (is (= [["ID" "NAME"]
                                   ["1" "Red Medicine"]]
                                  (parse-json-results results))))

                   :xlsx (fn [results]
                           (is (= [["ID" "ID" "NAME"]
                                   [1.0 1.0 "Red Medicine"]]
                                  (xlsx-test/parse-xlsx-results results))))}})))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                        Streaming logic unit tests                                              |
;;; +----------------------------------------------------------------------------------------------------------------+

(deftest ^:parallel export-column-order-test
  (testing "correlation of columns by field ref"
    (is (= [0 1]
           (@#'qp.streaming/export-column-order
            [{:id 0, :name "Col1" :field_ref [:field 0 nil]}, {:id 1, :name "Col2" :field_ref [:field 1 nil]}]
            [{::mb.viz/table-column-field-ref [:field 0 nil], ::mb.viz/table-column-enabled true}
             {::mb.viz/table-column-field-ref [:field 1 nil], ::mb.viz/table-column-enabled true}])))
    (is (= [1 0]
           (@#'qp.streaming/export-column-order
            [{:id 0, :name "Col1" :field_ref [:field 0 nil]}, {:id 1, :name "Col2" :field_ref [:field 1 nil]}]
            [{::mb.viz/table-column-field-ref [:field 1 nil], ::mb.viz/table-column-enabled true}
             {::mb.viz/table-column-field-ref [:field 0 nil], ::mb.viz/table-column-enabled true}])))))

(deftest ^:parallel export-column-order-test-2
  (testing "correlation of columns by name"
    (is (= [0 1]
           (@#'qp.streaming/export-column-order
            [{:name "Col1"}, {:name "Col2"}]
            [{::mb.viz/table-column-name "Col1", ::mb.viz/table-column-enabled true}
             {::mb.viz/table-column-name "Col2", ::mb.viz/table-column-enabled true}])))
    (is (= [1 0]
           (@#'qp.streaming/export-column-order
            [{:id 0, :name "Col1"}, {:id 1, :name "Col2"}]
            [{::mb.viz/table-column-name "Col2", ::mb.viz/table-column-enabled true}
             {::mb.viz/table-column-name "Col1", ::mb.viz/table-column-enabled true}])))))

(deftest ^:parallel export-column-order-test-3
  (testing "correlation of columns by field ref"
    (is (= [0]
           (@#'qp.streaming/export-column-order
            [{:id 0, :name "Col1" :field_ref [:field 0 nil]}, {:id 1, :name "Col2" :field_ref [:field 1 nil]}]
            [{::mb.viz/table-column-field-ref [:field 0 nil], ::mb.viz/table-column-enabled true}
             {::mb.viz/table-column-field-ref [:field 1 nil], ::mb.viz/table-column-enabled false}])))
    (is (= [1]
           (@#'qp.streaming/export-column-order
            [{:id 0, :name "Col1" :field_ref [:field 0 nil]}, {:id 1, :name "Col2" :field_ref [:field 1 nil]}]
            [{::mb.viz/table-column-field-ref [:field 0 nil], ::mb.viz/table-column-enabled false}
             {::mb.viz/table-column-field-ref [:field 1 nil], ::mb.viz/table-column-enabled true}])))))

(deftest ^:parallel export-column-order-test-4
  (testing "remapped columns use the index of the new column"
    (is (= [1]
           (@#'qp.streaming/export-column-order
            [{:id 0, :name "Col1", :remapped_to "Col2", :field_ref ["field" 0 nil]},
             {:id 1, :name "Col2", :remapped_from "Col1", :field_ref ["field" 1 nil]}]
            [{::mb.viz/table-column-field-ref ["field" 0 nil], ::mb.viz/table-column-enabled true}])))))

(deftest ^:parallel export-column-order-test-5
  (testing "if table-columns contains a column without a corresponding entry in cols, table-columns is ignored and
           cols is used as the source of truth for column order (#19465)"
    (is (= [0]
           (@#'qp.streaming/export-column-order
            [{:id 0, :name "Col1" :field_ref [:field 0 nil]}]
            [{::mb.viz/table-column-field-ref [:field 1 nil], ::mb.viz/table-column-enabled true}
             {::mb.viz/table-column-field-ref [:field 2 nil], ::mb.viz/table-column-enabled true}])))
    (is (= [0]
           (@#'qp.streaming/export-column-order
            [{:id 0, :name "Col1" :field_ref [:field 0 nil]}]
            [{::mb.viz/table-column-name "Col1" , ::mb.viz/table-column-enabled true}
             {::mb.viz/table-column-name "Col2" , ::mb.viz/table-column-enabled true}])))))

(deftest ^:parallel export-column-order-test-6
  (testing "if table-columns is nil, original order of cols is used"
    (is (= [0 1]
           (@#'qp.streaming/export-column-order
            [{:id 0, :name "Col1"}, {:id 1, :name "Col2"}]
            nil)))
    (is (= [0 1]
           (@#'qp.streaming/export-column-order
            [{:name "Col1"}, {:name "Col2"}]
            nil)))))

(deftest ^:parallel export-column-order-test-7
  (testing "if table-columns is nil, remapped columns are still respected"
    (is (= [1]
           (@#'qp.streaming/export-column-order
            [{:id 0, :name "Col1" :remapped_to "Col2"}, {:id 1, :name "Col2" :remapped_from "Col1"}]
            nil)
           (@#'qp.streaming/export-column-order
            [{:name "Col1" :remapped_to "Col2"}, {:name "Col2" :remapped_from "Col1"}]
            nil)))))

;; QP Nil Fix Tests
;; These tests verify that query cancellation returns proper results instead of nil

(deftest ^:parallel qp-pipeline-cancellation-test
  (testing "QP pipeline functions return nil when cancelled and canceled? returns truthy"
    (let [canceled-chan (a/promise-chan)
          _ (a/>!! canceled-chan ::cancel)
          query (mt/mbql-query venues {:limit 1})
          mock-rff (constantly identity)]

      (binding [qp.pipeline/*canceled-chan* canceled-chan]
        (let [result (qp.pipeline/*run* query mock-rff)]
          (is (nil? result) "Cancelled query returns nil")
          (is (qp.pipeline/canceled?) "canceled? should return truthy when query is cancelled"))))))

(deftest streaming-response-handles-cancellation-test
  (testing "Streaming response handles cancellation gracefully without assertion errors"
    (let [mock-qp-fn (fn [rff]
                      ;; Simulate immediate cancellation
                       (with-redefs [qp.pipeline/canceled? (constantly true)]
                         (qp.pipeline/*run* (mt/mbql-query venues {:limit 1}) rff)))]

      ;; Should not throw "QP unexpectedly returned nil" assertion error
      (is (some? (qp.streaming/-streaming-response :csv "test" mock-qp-fn))
          "Streaming response should handle cancellation without assertion error"))))

(deftest streaming-response-handles-cancel-keyword-test
  (testing "Streaming response handles nil + canceled? gracefully"
    (let [mock-qp-fn (fn [_rff]
                       ;; Return nil and set up canceled? to return truthy
                       (with-redefs [qp.pipeline/canceled? (constantly ::cancel)]
                         nil))]

      ;; Should not throw any assertion errors
      (is (some? (qp.streaming/-streaming-response :csv "test" mock-qp-fn))
          "Streaming response should handle cancellation without assertion error"))))
