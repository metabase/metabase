(ns metabase.api.public-test
  "Tests for `api/public/` (public links) endpoints."
  (:require [cheshire.core :as json]
            [clojure.string :as str]
            [clojure.test :refer :all]
            [dk.ative.docjure.spreadsheet :as spreadsheet]
            [metabase.api.dashboard-test :as api.dashboard-test]
            [metabase.api.pivots :as api.pivots]
            [metabase.api.public :as api.public]
            [metabase.http-client :as client]
            [metabase.models :refer [Card Collection Dashboard DashboardCard DashboardCardSeries Dimension Field FieldValues]]
            [metabase.models.params.chain-filter-test :as chain-filter-test]
            [metabase.models.permissions :as perms]
            [metabase.models.permissions-group :as perms-group]
            [metabase.test :as mt]
            [metabase.util :as u]
            [schema.core :as s]
            [toucan.db :as db])
  (:import java.io.ByteArrayInputStream
           java.util.UUID))

;;; --------------------------------------------------- Helper Fns ---------------------------------------------------

(defn- shared-obj []
  {:public_uuid       (str (UUID/randomUUID))
   :made_public_by_id (mt/user->id :crowberto)})

(defn- native-query-with-template-tag []
  {:database (mt/id)
   :type     :native
   :native   {:query         (format "SELECT count(*) AS %s FROM venues [[WHERE id = {{venue_id}}]]"
                                     ((db/quote-fn) "Count"))
              :template-tags {"venue_id" {:name         "venue_id"
                                          :display-name "Venue ID"
                                          :type         :number
                                          :required     false}}}})

(defn- do-with-temp-public-card [m f]
  (let [m (merge (when-not (:dataset_query m)
                   {:dataset_query (mt/mbql-query venues {:aggregation [[:count]]})})
                 (shared-obj)
                 m)]
    (mt/with-temp Card [card m]
      ;; add :public_uuid back in to the value that gets bound because it might not come back from post-select if
      ;; public sharing is disabled; but we still want to test it
      (f (assoc card :public_uuid (:public_uuid m))))))

(defmacro ^:private with-temp-public-card {:style/indent 1} [[binding & [card]] & body]
  `(do-with-temp-public-card
    ~card
    (fn [~binding]
      ~@body)))

(defn- do-with-temp-public-dashboard [m f]
  (let [m (merge
           (when-not (:parameters m)
             {:parameters [{:id      "_VENUE_ID_"
                            :name    "Venue ID"
                            :slug    "venue_id"
                            :type    "id"
                            :target  [:dimension (mt/id :venues :id)]
                            :default nil}]})
           (shared-obj)
           m)]
    (mt/with-temp Dashboard [dashboard m]
      (f (assoc dashboard :public_uuid (:public_uuid m))))))

(defmacro ^:private with-temp-public-dashboard {:style/indent 1} [[binding & [dashboard]] & body]
  `(do-with-temp-public-dashboard
    ~dashboard
    (fn [~binding]
      ~@body)))

(defn- add-card-to-dashboard! [card dashboard & {parameter-mappings :parameter_mappings, :as kvs}]
  (db/insert! DashboardCard (merge {:dashboard_id       (u/the-id dashboard)
                                    :card_id            (u/the-id card)
                                    :parameter_mappings (or parameter-mappings
                                                            [{:parameter_id "_VENUE_ID_"
                                                              :card_id      (u/the-id card)
                                                              :target       [:dimension [:field (mt/id :venues :id) nil]]}])}
                                   kvs)))

;; TODO -- we can probably use [[metabase.api.dashboard-test/with-chain-filter-fixtures]] for mocking this stuff
;; instead since it does mostly the same stuff anyway
(defmacro ^:private with-temp-public-dashboard-and-card
  {:style/indent 1}
  [[dashboard-binding card-binding & [dashcard-binding]] & body]
  (let [dashcard-binding (or dashcard-binding (gensym "dashcard"))]
    `(with-temp-public-dashboard [dash#]
       (with-temp-public-card [card#]
         (let [~dashboard-binding dash#
               ~card-binding      card#
               ~dashcard-binding  (add-card-to-dashboard! card# dash#)]
           ~@body)))))


;;; ------------------------------------------- GET /api/public/card/:uuid -------------------------------------------

(deftest fetch-card-test
  (testing "GET /api/public/card/:uuid"
    (mt/with-temporary-setting-values [enable-public-sharing true]
      ;; TODO -- shouldn't this return a 404? I guess it's because we're 'genericizing' all the errors in public
      ;; endpoints in [[metabase.server.middleware.exceptions/genericize-exceptions]]
      (testing "should return 400 if Card doesn't exist"
        (is (= "An error occurred."
               (client/client :get 400 (str "public/card/" (UUID/randomUUID))))))

      (with-temp-public-card [{uuid :public_uuid, card-id :id}]
        (testing "Happy path -- should be able to fetch the Card"
          (is (= #{:dataset_query :description :display :id :name :visualization_settings :param_fields}
                 (set (keys (client/client :get 200 (str "public/card/" uuid)))))))

        (testing "Check that we cannot fetch a public Card if public sharing is disabled"
          (mt/with-temporary-setting-values [enable-public-sharing false]
            (is (= "An error occurred."
                   (client/client :get 400 (str "public/card/" uuid))))))

        (testing "Check that we cannot fetch a public Card that has been archived"
          (mt/with-temp-vals-in-db Card card-id {:archived true}
            (is (= "An error occurred."
                   (client/client :get 400 (str "public/card/" uuid))))))))))

;;; ------------------------- GET /api/public/card/:uuid/query (and JSON/CSV/XSLX versions) --------------------------

(deftest check-that-we--cannot--execute-a-publiccard-if-the-setting-is-disabled
  (mt/with-temporary-setting-values [enable-public-sharing false]
    (with-temp-public-card [{uuid :public_uuid}]
      (is (= "An error occurred."
             (client/client :get 400 (str "public/card/" uuid "/query")))))))

(deftest check-that-we-get-a-400-if-the-publiccard-doesn-t-exist-query
  (mt/with-temporary-setting-values [enable-public-sharing true]
    (is (= "An error occurred."
           (client/client :get 400 (str "public/card/" (UUID/randomUUID) "/query"))))))

(deftest check-that-we--cannot--execute-a-publiccard-if-the-card-has-been-archived
  (mt/with-temporary-setting-values [enable-public-sharing true]
    (with-temp-public-card [{uuid :public_uuid} {:archived true}]
      (is (= "An error occurred."
             (client/client :get 400 (str "public/card/" uuid "/query")))))))

(defn- parse-xlsx-response [response]
  (->> (ByteArrayInputStream. response)
       spreadsheet/load-workbook
       (spreadsheet/select-sheet "Query result")
       (spreadsheet/select-columns {:A :col})))

(deftest execute-public-card-test
  (testing "GET /api/public/card/:uuid/query"
    (mt/with-temporary-setting-values [enable-public-sharing true]
      (with-temp-public-card [{uuid :public_uuid}]
        (testing "Default :api response format"
          (is (= [[100]]
                 (mt/rows (client/client :get 202 (str "public/card/" uuid "/query"))))))

        (testing ":json download response format"
          (is (= [{:Count 100}]
                 (client/client :get 200 (str "public/card/" uuid "/query/json")))))

        (testing ":csv download response format"
          (is (= "Count\n100\n"
                 (client/client :get 200 (str "public/card/" uuid "/query/csv"), :format :csv))))

        (testing ":xlsx download response format"
          (is (= [{:col "Count"} {:col 100.0}]
                 (parse-xlsx-response
                  (client/client :get 200 (str "public/card/" uuid "/query/xlsx") {:request-options {:as :byte-array}})))))))))

(deftest execute-public-card-as-user-without-perms-test
  (testing "A user that doesn't have permissions to run the query normally should still be able to run a public Card as if they weren't logged in"
    (mt/with-temporary-setting-values [enable-public-sharing true]
      (mt/with-temp Collection [{collection-id :id}]
        (perms/revoke-collection-permissions! (perms-group/all-users) collection-id)
        (with-temp-public-card [{card-id :id, uuid :public_uuid} {:collection_id collection-id}]
          (is (= "You don't have permissions to do that."
                 (mt/user-http-request :rasta :post 403 (format "card/%d/query" card-id)))
              "Sanity check: shouldn't be allowed to run the query normally")
          (is (= [[100]]
                 (mt/rows
                  (mt/user-http-request :rasta :get 202 (str "public/card/" uuid "/query"))))))))))

(deftest execute-public-card-with-parameters-test
  (testing "JSON-encoded MBQL parameters passed as a query parameter should work (#17019)"
    (mt/with-temporary-setting-values [enable-public-sharing true]
      (with-temp-public-card [{uuid :public_uuid} {:dataset_query (native-query-with-template-tag)}]
        (is (schema= {:status     (s/eq "completed")
                      :json_query {:parameters (s/eq [{:id    "_VENUE_ID_"
                                                       :name  "venue_id"
                                                       :slug  "venue_id"
                                                       :type  "number"
                                                       :value 2}])
                                   s/Keyword   s/Any}
                      s/Keyword   s/Any}
                     (client/client :get 202 (str "public/card/" uuid "/query")
                                    :parameters (json/encode [{:id    "_VENUE_ID_"
                                                               :name  "venue_id"
                                                               :slug  "venue_id"
                                                               :type  "number"
                                                               :value 2}])))))

      ;; see longer explanation in [[metabase.mbql.schema/parameter-types]]
      (testing "If the FE client is incorrectly passing in the parameter as a `:category` type, allow it for now"
        (with-temp-public-card [{uuid :public_uuid} {:dataset_query {:database (mt/id)
                                                                     :type     :native
                                                                     :native   {:query "SELECT {{foo}}"
                                                                                :template-tags
                                                                                {"foo"
                                                                                 {:id           "abc123"
                                                                                  :name         "foo"
                                                                                  :display-name "Filter"
                                                                                  :type         :text}}}}}]
          (is (schema= {:status   (s/eq "completed")
                        :data     {:rows     (s/eq [["456"]])
                                   s/Keyword s/Any}
                        s/Keyword s/Any}
                       (client/client :get 202 (format "public/card/%s/query?parameters=%s"
                                                       uuid
                                                       (json/encode [{:type   "category"
                                                                      :value  "456"
                                                                      :target ["variable" ["template-tag" "foo"]]
                                                                      :id     "ed1fd39e-2e35-636f-ec44-8bf226cca5b0"}]))))))))))



;; Cards with required params
(defn- do-with-required-param-card [f]
  (mt/with-temporary-setting-values [enable-public-sharing true]
    (with-temp-public-card [{uuid :public_uuid}
                            {:dataset_query
                             {:database (mt/id)
                              :type     :native
                              :native   {:query         "SELECT count(*) FROM venues v WHERE price = {{price}}"
                                         :template-tags {"price" {:name         "price"
                                                                  :display-name "Price"
                                                                  :type         :number
                                                                  :required     true}}}}}]
      (f uuid))))

(defmacro ^:private with-required-param-card [[uuid-binding] & body]
  `(do-with-required-param-card (fn [~uuid-binding] ~@body)))

(deftest should-be-able-to-run-a-card-with-a-required-param
  (with-required-param-card [uuid]
    (is (= [[22]]
           (mt/rows
             (client/client :get 202 (str "public/card/" uuid "/query")
                            :parameters (json/encode [{:type   :number
                                                       :target [:variable [:template-tag "price"]]
                                                       :value  1}])))))))

(deftest missing-required-param-error-message-test
  (testing (str "If you're missing a required param, the error message should get passed thru, rather than the normal "
                "generic 'Query Failed' message that we show for most embedding errors")
    (with-required-param-card [uuid]
      (is (= {:status     "failed"
              :error      "You'll need to pick a value for 'Price' before this query can run."
              :error_type "missing-required-parameter"}
             (client/client :get 202 (str "public/card/" uuid "/query")))))))

(defn- card-with-date-field-filter []
  (assoc (shared-obj)
         :dataset_query {:database (mt/id)
                         :type     :native
                         :native   {:query         "SELECT COUNT(*) AS \"count\" FROM CHECKINS WHERE {{date}}"
                                    :template-tags {:date {:name         "date"
                                                           :display-name "Date"
                                                           :type         "dimension"
                                                           :dimension    [:field (mt/id :checkins :date) nil]
                                                           :widget-type  "date/quarter-year"}}}}))


(deftest make-sure-csv--etc---downloads-take-editable-params-into-account---6407----
  (mt/with-temporary-setting-values [enable-public-sharing true]
    (mt/with-temp Card [{uuid :public_uuid} (card-with-date-field-filter)]
      (is (= "count\n107\n"
             (client/client :get 200 (str "public/card/" uuid "/query/csv")
                            :parameters (json/encode [{:id     "_DATE_"
                                                       :type   :date/quarter-year
                                                       :target [:dimension [:template-tag :date]]
                                                       :value  "Q1-2014"}])))))))


(deftest make-sure-it-also-works-with-the-forwarded-url
  (mt/with-temporary-setting-values [enable-public-sharing true]
    (mt/with-temp Card [{uuid :public_uuid} (card-with-date-field-filter)]
      ;; make sure the URL doesn't include /api/ at the beginning like it normally would
      (binding [client/*url-prefix* (str/replace client/*url-prefix* #"/api/$" "/")]
        (mt/with-temporary-setting-values [site-url client/*url-prefix*]
          (is (= "count\n107\n"
                 (client/client :get 200 (str "public/question/" uuid ".csv")
                                :parameters (json/encode [{:id     "_DATE_"
                                                           :type   :date/quarter-year
                                                           :target [:dimension [:template-tag :date]]
                                                           :value  "Q1-2014"}])))))))))

(defn- card-with-trendline []
  (assoc (shared-obj)
         :dataset_query {:database (mt/id)
                         :type     :query
                         :query   {:source-table (mt/id :checkins)
                                   :breakout     [[:datetime-field [:field (mt/id :checkins :date) nil]  :month]]
                                   :aggregation  [[:count]]}}))

(deftest make-sure-we-include-all-the-relevant-fields-like-insights
  (mt/with-temporary-setting-values [enable-public-sharing true]
    (mt/with-temp Card [{uuid :public_uuid} (card-with-trendline)]
      (is (= #{:cols :rows :insights :results_timezone}
             (-> (client/client :get 202 (str "public/card/" uuid "/query"))
                 :data
                 keys
                 set))))))


;;; ---------------------------------------- GET /api/public/dashboard/:uuid -----------------------------------------

(deftest get-public-dashboard-errors-test
  (testing "GET /api/public/dashboard/:uuid"
    (testing "Shouldn't be able to fetch a public Dashboard if public sharing is disabled"
      (mt/with-temporary-setting-values [enable-public-sharing false]
        (with-temp-public-dashboard [{uuid :public_uuid}]
          (is (= "An error occurred."
                 (client/client :get 400 (str "public/dashboard/" uuid)))))))

    (testing "Should get a 400 if the Dashboard doesn't exist"
      (mt/with-temporary-setting-values [enable-public-sharing true]
        (is (= "An error occurred."
               (client/client :get 400 (str "public/dashboard/" (UUID/randomUUID)))))))))

(defn- fetch-public-dashboard [{uuid :public_uuid}]
  (-> (client/client :get 200 (str "public/dashboard/" uuid))
      (select-keys [:name :ordered_cards])
      (update :name boolean)
      (update :ordered_cards count)))

(deftest get-public-dashboard-test
  (testing "GET /api/public/dashboard/:uuid"
    (mt/with-temporary-setting-values [enable-public-sharing true]
      (with-temp-public-dashboard-and-card [dash card]
        (is (= {:name true, :ordered_cards 1}
               (fetch-public-dashboard dash)))

        (testing "We shouldn't see Cards that have been archived"
          (db/update! Card (u/the-id card), :archived true)
          (is (= {:name true, :ordered_cards 0}
                 (fetch-public-dashboard dash))))))))


;;; --------------------------------- GET /api/public/dashboard/:uuid/card/:card-id ----------------------------------

(defn- dashcard-url
  "URL for fetching results of a public DashCard."
  [dash card dashcard]
  (format "public/dashboard/%s/dashcard/%d/card/%d" (:public_uuid dash) (u/the-id dashcard) (u/the-id card)))

(deftest execute-public-dashcard-errors-test
  (testing "GET /api/public/dashboard/:uuid/card/:card-id"
    (testing "Shouldn't be able to execute a public DashCard if public sharing is disabled"
      (mt/with-temporary-setting-values [enable-public-sharing false]
        (with-temp-public-dashboard-and-card [dash card dashcard]
          (is (= "An error occurred."
                 (client/client :get 400 (dashcard-url dash card dashcard)))))))

    (testing "Should get a 400"
      (mt/with-temporary-setting-values [enable-public-sharing true]
        (with-temp-public-dashboard-and-card [dash card dashcard]
          (testing "if the Dashboard doesn't exist"
            (is (= "An error occurred."
                   (client/client :get 400 (dashcard-url {:public_uuid (UUID/randomUUID)} card dashcard)))))

          (testing "if the Card doesn't exist"
            (is (= "An error occurred."
                   (client/client :get 400 (dashcard-url dash Integer/MAX_VALUE dashcard)))))

          (testing "if the Card exists, but it's not part of this Dashboard"
            (mt/with-temp Card [card]
              (is (= "An error occurred."
                     (client/client :get 400 (dashcard-url dash card dashcard))))))

          (testing "if the Card has been archived."
            (db/update! Card (u/the-id card), :archived true)
            (is (= "An error occurred."
                   (client/client :get 400 (dashcard-url dash card dashcard))))))))))

(deftest execute-public-dashcard-test
  (testing "GET /api/public/dashboard/:uuid/card/:card-id"
    (mt/with-temporary-setting-values [enable-public-sharing true]
      (with-temp-public-dashboard-and-card [dash card dashcard]
        (is (= [[100]]
               (mt/rows (client/client :get 202 (dashcard-url dash card dashcard)))))

        (testing "with parameters"
          (is (schema= {:json_query {:parameters (s/eq [{:id      "_VENUE_ID_"
                                                         :name    "Venue ID"
                                                         :slug    "venue_id"
                                                         :target  ["dimension" ["field" (mt/id :venues :id) nil]]
                                                         :value   [10]
                                                         :type    "id"}])
                                     s/Keyword   s/Any}
                        :data       {:rows     (s/eq [[1]])
                                     s/Keyword s/Any}
                        s/Keyword   s/Any}
                       (client/client :get 202 (dashcard-url dash card dashcard)
                                      :parameters (json/encode [{:name   "Venue ID"
                                                                 :slug   :venue_id
                                                                 :target [:dimension (mt/id :venues :id)]
                                                                 :value  [10]
                                                                 :id     "_VENUE_ID_"}])))))))))

(deftest execute-public-dashcard-as-user-without-perms-test
  (testing "GET /api/public/dashboard/:uuid/card/:card-id"
    (testing "A user that doesn't have permissions to run the query normally should still be able to run a public DashCard"
      (mt/with-temporary-setting-values [enable-public-sharing true]
        (mt/with-temp Collection [{collection-id :id}]
          (perms/revoke-collection-permissions! (perms-group/all-users) collection-id)
          (with-temp-public-dashboard-and-card [dash {card-id :id, :as card} dashcard]
            (db/update! Card card-id :collection_id collection-id)
            (is (= "You don't have permissions to do that."
                   (mt/user-http-request :rasta :post 403 (format "card/%d/query" card-id)))
                "Sanity check: shouldn't be allowed to run the query normally")
            (is (= [[100]]
                   (mt/rows
                    (mt/user-http-request :rasta :get 202 (dashcard-url dash card dashcard)))))))))))

(deftest execute-public-dashcard-params-validation-test
  (testing "GET /api/public/dashboard/:uuid/card/:card-id"
    (testing "Make sure params are validated"
      (mt/with-temporary-setting-values [enable-public-sharing true]
        (with-temp-public-dashboard-and-card [dash card dashcard]
          (testing "Should work correctly with a valid parameter"
            (is (= [[1]]
                   (mt/rows (client/client :get 202 (dashcard-url dash card dashcard)
                                           :parameters (json/encode [{:name   "Venue ID"
                                                                      :target [:dimension (mt/id :venues :id)]
                                                                      :value  [10]
                                                                      :id     "_VENUE_ID_"}]))))
                "This should pass because venue_id *is* one of the Dashboard's :parameters"))

          (testing "should fail if"
            (testing "a parameter is passed that is not one of the Dashboard's parameters"
              (is (= "An error occurred."
                     (client/client :get 400 (dashcard-url dash card dashcard)
                                    :parameters (json/encode [{:name   "Venue Name"
                                                               :target [:dimension (mt/id :venues :name)]
                                                               :value  ["PizzaHacker"]
                                                               :id     "_VENUE_NAME_"}])))))))))))

(deftest execute-public-dashcard-additional-series-test
  (testing "GET /api/public/dashboard/:uuid/card/:card-id"
    (testing "should work with an additional Card series"
      (mt/with-temporary-setting-values [enable-public-sharing true]
        (with-temp-public-dashboard-and-card [dash card dashcard]
          (with-temp-public-card [card-2]
            (mt/with-temp DashboardCardSeries [_ {:dashboardcard_id (db/select-one-id DashboardCard
                                                                      :card_id      (u/the-id card)
                                                                      :dashboard_id (u/the-id dash))
                                                  :card_id          (u/the-id card-2)}]
              (is (= [[100]]
                     (mt/rows (client/client :get 202 (dashcard-url dash card-2 dashcard))))))))))))

(deftest execute-public-dashcard-parameters-test
  (testing "GET /api/public/dashboard/:uuid/card/:card-id"
    (testing "Make sure parameters work correctly (#7212)"
      (mt/with-temporary-setting-values [enable-public-sharing true]
        (testing "with native queries and template tag params"
          (mt/with-temp Card [card {:dataset_query {:database (mt/id)
                                                    :type     :native
                                                    :native   {:query         "SELECT {{num}} AS num"
                                                               :template-tags {:num {:name         "num"
                                                                                     :display-name "Num"
                                                                                     :type         "number"
                                                                                     :required     true
                                                                                     :default      "1"}}}}}]
            (with-temp-public-dashboard [dash {:parameters [{:name "Num"
                                                             :slug "num"
                                                             :id   "_NUM_"
                                                             :type "category"}]}]
              (let [dashcard (add-card-to-dashboard!
                              card
                              dash
                              :parameter_mappings [{:card_id      (u/the-id card)
                                                    :target       [:variable [:template-tag :num]]
                                                    :parameter_id "_NUM_"}])]
                (is (= [[50]]
                       (-> (mt/user-http-request :crowberto
                                                 :get (str (dashcard-url dash card dashcard)
                                                           "?parameters="
                                                           (json/generate-string
                                                            [{:type   :category
                                                              :target [:variable [:template-tag :num]]
                                                              :value  "50"
                                                              :id     "_NUM_"}])))
                           mt/rows)))))))

        (testing "with MBQL queries"
          (testing "`:id` parameters"
            (mt/with-temp Card [card {:dataset_query {:database (mt/id)
                                                      :type     :query
                                                      :query    {:source-table (mt/id :venues)
                                                                 :aggregation  [:count]}}}]
              (with-temp-public-dashboard [dash {:parameters [{:name "venue_id"
                                                               :slug "venue_id"
                                                               :id   "_VENUE_ID_"
                                                               :type "id"}]}]
                (let [dashcard (add-card-to-dashboard!
                                card
                                dash
                                :parameter_mappings [{:parameter_id "_VENUE_ID_"
                                                      :card_id      (u/the-id card)
                                                      :target       [:dimension [:field (mt/id :venues :id) nil]]}])]
                  (is (= [[1]]
                         (-> (mt/user-http-request :crowberto
                                                   :get (str (dashcard-url dash card dashcard)
                                                             "?parameters="
                                                             (json/generate-string
                                                              [{:type   :id
                                                                :target [:dimension [:field (mt/id :venues :id) nil]]
                                                                :value  "50"
                                                                :id     "_VENUE_ID_"}])))
                             mt/rows)))))))

          (testing "temporal parameters"
            (mt/with-temporary-setting-values [enable-public-sharing true]
              (mt/with-temp Card [card {:dataset_query {:database (mt/id)
                                                        :type     :query
                                                        :query    {:source-table (mt/id :checkins)
                                                                   :aggregation  [:count]}}}]
                (with-temp-public-dashboard [dash {:parameters [{:name "Date Filter"
                                                                 :slug "date_filter"
                                                                 :id   "_DATE_"
                                                                 :type "date/all-options"}]}]
                  (let [dashcard (add-card-to-dashboard!
                                  card
                                  dash
                                  :parameter_mappings [{:parameter_id "_DATE_"
                                                        :card_id      (u/the-id card)
                                                        :target       [:dimension
                                                                       [:field
                                                                        (mt/id :checkins :date) nil]]}])]
                    (is (= [[733]]
                           (-> (mt/user-http-request :crowberto
                                                     :get (str (dashcard-url dash card dashcard)
                                                               "?parameters="
                                                               (json/generate-string
                                                                [{:type   "date/all-options"
                                                                  :target [:dimension [:field (mt/id :checkins :date) nil]]
                                                                  :value  "~2015-01-01"
                                                                  :id     "_DATE_"}])))
                               mt/rows)))))))))))))

(deftest execute-public-dashcard-dimension-value-params-test
  (testing "GET /api/public/dashboard/:uuid/card/:card-id"
    (testing (str "make sure DimensionValue params also work if they have a default value, even if some is passed in "
                  "for some reason as part of the query (#7253)")
      (mt/with-temporary-setting-values [enable-public-sharing true]
        (mt/with-temp Card [card {:dataset_query {:database (mt/id)
                                                  :type     :native
                                                  :native   {:query         "SELECT {{msg}} AS message"
                                                             :template-tags {:msg {:id           "_MSG_
"
                                                                                   :name         "msg"
                                                                                   :display-name "Message"
                                                                                   :type         "text"
                                                                                   :required     true
                                                                                   :default      "Wow"}}}}}]
          (with-temp-public-dashboard [dash {:parameters [{:name "Message"
                                                           :slug "msg"
                                                           :id   "_MSG_"
                                                           :type "category"}]}]
            (let [dashcard (add-card-to-dashboard! card dash
                                                   :parameter_mappings [{:card_id      (u/the-id card)
                                                                         :target       [:variable [:template-tag :msg]]
                                                                         :parameter_id "_MSG_"}])]
              (is (= [["World"]]
                     (-> (mt/user-http-request :crowberto
                                               :get (str (dashcard-url dash card dashcard)
                                                         "?parameters="
                                                         (json/generate-string
                                                          [{:type    :category
                                                            :target  [:variable [:template-tag :msg]]
                                                            :value   "World"
                                                            :default "Hello"
                                                            :id      "_MSG_"}])))
                         mt/rows))))))))))


;;; --------------------------- Check that parameter information comes back with Dashboard ---------------------------

(deftest double-check-that-the-field-has-fieldvalues
  (is (= [1 2 3 4]
         (db/select-one-field :values FieldValues :field_id (mt/id :venues :price)))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                        New FieldValues search endpoints                                        |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- mbql-card-referencing-nothing []
  {:dataset_query {:database (mt/id)
                   :type     :query
                   :query    {:source-table (mt/id :venues)}}})

(defn mbql-card-referencing [table-kw field-kw]
  {:dataset_query
   {:database (mt/id)
    :type     :query
    :query    {:source-table (mt/id table-kw)
               :filter       [:= [:field (mt/id table-kw field-kw) nil] "Krua Siri"]}}})

(defn- mbql-card-referencing-venue-name []
  (mbql-card-referencing :venues :name))

(defn- sql-card-referencing-venue-name []
  {:dataset_query
   {:database (mt/id)
    :type     :native
    :native   {:query         "SELECT COUNT(*) FROM VENUES WHERE {{x}}"
               :template-tags {:x {:name         :x
                                   :display-name "X"
                                   :type         :dimension
                                   :dimension    [:field (mt/id :venues :name) nil]}}}}})


;;; ------------------------------------------- card->referenced-field-ids -------------------------------------------

(deftest card-referencing-nothing
  (mt/with-temp Card [card (mbql-card-referencing-nothing)]
    (is (= #{}
           (#'api.public/card->referenced-field-ids card)))))

(deftest it-should-pick-up-on-fields-referenced-in-the-mbql-query-itself
  (mt/with-temp Card [card (mbql-card-referencing-venue-name)]
    (is (= #{(mt/id :venues :name)}
           (#'api.public/card->referenced-field-ids card)))))

(deftest ---as-well-as-template-tag--implict--params-for-sql-queries
  (mt/with-temp Card [card (sql-card-referencing-venue-name)]
    (is (= #{(mt/id :venues :name)}
           (#'api.public/card->referenced-field-ids card)))))

;;; --------------------------------------- check-field-is-referenced-by-card ----------------------------------------


(deftest check-that-the-check-succeeds-when-field-is-referenced
  (mt/with-temp Card [card (mbql-card-referencing-venue-name)]
    (#'api.public/check-field-is-referenced-by-card (mt/id :venues :name) (u/the-id card))))

(deftest check-that-exception-is-thrown-if-the-field-isn-t-referenced
  (is (thrown?
       Exception
       (mt/with-temp Card [card (mbql-card-referencing-venue-name)]
         (#'api.public/check-field-is-referenced-by-card (mt/id :venues :category_id) (u/the-id card))))))


;;; ----------------------------------------- check-search-field-is-allowed ------------------------------------------

;; search field is allowed IF:
;; A) search-field is the same field as the other one
(deftest search-field-allowed-if-same-field-as-other-one
  (#'api.public/check-search-field-is-allowed (mt/id :venues :id) (mt/id :venues :id))
  (is (thrown? Exception
               (#'api.public/check-search-field-is-allowed (mt/id :venues :id) (mt/id :venues :category_id)))))

;; B) there's a Dimension that lists search field as the human_readable_field for the other field
(deftest search-field-allowed-with-dimension
  (is (mt/with-temp Dimension [_ {:field_id (mt/id :venues :id), :human_readable_field_id (mt/id :venues :category_id)}]
        (#'api.public/check-search-field-is-allowed (mt/id :venues :id) (mt/id :venues :category_id)))))

;; C) search-field is a Name Field belonging to the same table as the other field, which is a PK
(deftest search-field-allowed-with-name-field
  (is (#'api.public/check-search-field-is-allowed (mt/id :venues :id) (mt/id :venues :name))))

;; not allowed if search field isn't a NAME
(deftest search-field-not-allowed-if-search-field-isnt-a-name
  (is (thrown? Exception
               (mt/with-temp-vals-in-db Field (mt/id :venues :name) {:semantic_type "type/Latitude"}
                 (#'api.public/check-search-field-is-allowed (mt/id :venues :id) (mt/id :venues :name))))))


(deftest not-allowed-if-search-field-belongs-to-a-different-table
  (is (thrown? Exception
               (mt/with-temp-vals-in-db Field (mt/id :categories :name) {:semantic_type "type/Name"}
                 (#'api.public/check-search-field-is-allowed (mt/id :venues :id) (mt/id :categories :name))))))



;;; ------------------------------------- check-field-is-referenced-by-dashboard -------------------------------------

(defn- dashcard-with-param-mapping-to-venue-id [dashboard card]
  {:dashboard_id       (u/the-id dashboard)
   :card_id            (u/the-id card)
   :parameter_mappings [{:card_id (u/the-id card)
                         :target  [:dimension [:field (mt/id :venues :id) nil]]}]})


(deftest field-is--referenced--by-dashboard-if-it-s-one-of-the-dashboard-s-params---
  (is (mt/with-temp* [Dashboard     [dashboard]
                      Card          [card]
                      DashboardCard [_ (dashcard-with-param-mapping-to-venue-id dashboard card)]]
        (#'api.public/check-field-is-referenced-by-dashboard (mt/id :venues :id) (u/the-id dashboard)))))


(deftest TODO-name-this-exception
  (is (thrown? Exception
               (mt/with-temp* [Dashboard     [dashboard]
                               Card          [card]
                               DashboardCard [_ (dashcard-with-param-mapping-to-venue-id dashboard card)]]
                 (#'api.public/check-field-is-referenced-by-dashboard (mt/id :venues :name) (u/the-id dashboard))))))

;; ...*or* if it's a so-called "implicit" param (a Field Filter Template Tag (FFTT) in a SQL Card)
(deftest implicit-param
  (is (mt/with-temp* [Dashboard     [dashboard]
                      Card          [card (sql-card-referencing-venue-name)]
                      DashboardCard [_ {:dashboard_id (u/the-id dashboard), :card_id (u/the-id card)}]]
        (#'api.public/check-field-is-referenced-by-dashboard (mt/id :venues :name) (u/the-id dashboard))))

  (is (thrown? Exception
               (mt/with-temp* [Dashboard     [dashboard]
                               Card          [card (sql-card-referencing-venue-name)]
                               DashboardCard [_ {:dashboard_id (u/the-id dashboard), :card_id (u/the-id card)}]]
                 (#'api.public/check-field-is-referenced-by-dashboard (mt/id :venues :id) (u/the-id dashboard))))))

;;; ------------------------------------------- card-and-field-id->values --------------------------------------------

(deftest we-should-be-able-to-get-values-for-a-field-referenced-by-a-card
  (mt/with-temp Card [card (mbql-card-referencing :venues :name)]
    (is (= {:values          [["20th Century Cafe"]
                              ["25°"]
                              ["33 Taps"]
                              ["800 Degrees Neapolitan Pizzeria"]
                              ["BCD Tofu House"]]
            :field_id        (mt/id :venues :name)
            :has_more_values false}
           (mt/derecordize (-> (api.public/card-and-field-id->values (u/the-id card) (mt/id :venues :name))
                               (update :values (partial take 5))))))))

(deftest sql-param-field-references-should-work-just-as-well-as-mbql-field-referenced
  (mt/with-temp Card [card (sql-card-referencing-venue-name)]
    (is (= {:values          [["20th Century Cafe"]
                              ["25°"]
                              ["33 Taps"]
                              ["800 Degrees Neapolitan Pizzeria"]
                              ["BCD Tofu House"]]
            :field_id        (mt/id :venues :name)
            :has_more_values false}
           (mt/derecordize (-> (api.public/card-and-field-id->values (u/the-id card) (mt/id :venues :name))
                               (update :values (partial take 5))))))))

(deftest but-if-the-field-is-not-referenced-we-should-get-an-exception
  (mt/with-temp Card [card (mbql-card-referencing :venues :price)]
    (is (thrown?
         Exception
         (api.public/card-and-field-id->values (u/the-id card) (mt/id :venues :name))))))


;;; ------------------------------- GET /api/public/card/:uuid/field/:field/values nil --------------------------------

(defn- field-values-url [card-or-dashboard field-or-id]
  (str "public/"
       (condp instance? card-or-dashboard
         (class Card)      "card"
         (class Dashboard) "dashboard")
       "/" (or (:public_uuid card-or-dashboard)
               (throw (Exception. (str "Missing public UUID: " card-or-dashboard))))
       "/field/" (u/the-id field-or-id)
       "/values"))

(defn- do-with-sharing-enabled-and-temp-card-referencing {:style/indent 2} [table-kw field-kw f]
  (mt/with-temporary-setting-values [enable-public-sharing true]
    (mt/with-temp Card [card (merge (shared-obj) (mbql-card-referencing table-kw field-kw))]
      (f card))))

(defmacro ^:private with-sharing-enabled-and-temp-card-referencing
  {:style/indent 3}
  [table-kw field-kw [card-binding] & body]
  `(do-with-sharing-enabled-and-temp-card-referencing ~table-kw ~field-kw
     (fn [~card-binding]
       ~@body)))


(deftest should-be-able-to-fetch-values-for-a-field-referenced-by-a-public-card
  (is (= {:values          [["20th Century Cafe"]
                            ["25°"]
                            ["33 Taps"]
                            ["800 Degrees Neapolitan Pizzeria"]
                            ["BCD Tofu House"]]
          :field_id        (mt/id :venues :name)
          :has_more_values false}
         (with-sharing-enabled-and-temp-card-referencing :venues :name [card]
           (-> (client/client :get 200 (field-values-url card (mt/id :venues :name)))
               (update :values (partial take 5)))))))

(deftest but-for-fields-that-are-not-referenced-we-should-get-an-exception
  (is (= "An error occurred."
         (with-sharing-enabled-and-temp-card-referencing :venues :name [card]
           (client/client :get 400 (field-values-url card (mt/id :venues :price)))))))

(deftest field-value-endpoint-should-fail-if-public-sharing-is-disabled
  (is (= "An error occurred."
         (with-sharing-enabled-and-temp-card-referencing :venues :name [card]
           (mt/with-temporary-setting-values [enable-public-sharing false]
             (client/client :get 400 (field-values-url card (mt/id :venues :name))))))))

;;; ----------------------------- GET /api/public/dashboard/:uuid/field/:field/values nil -----------------------------

(defn do-with-sharing-enabled-and-temp-dashcard-referencing {:style/indent 2} [table-kw field-kw f]
  (mt/with-temporary-setting-values [enable-public-sharing true]
    (mt/with-temp* [Dashboard     [dashboard (shared-obj)]
                    Card          [card      (mbql-card-referencing table-kw field-kw)]
                    DashboardCard [dashcard  {:dashboard_id       (u/the-id dashboard)
                                              :card_id            (u/the-id card)
                                              :parameter_mappings [{:card_id (u/the-id card)
                                                                    :target  [:dimension
                                                                              [:field
                                                                               (mt/id table-kw field-kw) nil]]}]}]]
      (f dashboard card dashcard))))

(defmacro with-sharing-enabled-and-temp-dashcard-referencing
  {:style/indent 3}
  [table-kw field-kw [dashboard-binding card-binding dashcard-binding] & body]
  `(do-with-sharing-enabled-and-temp-dashcard-referencing ~table-kw ~field-kw
     (fn [~(or dashboard-binding '_) ~(or card-binding '_) ~(or dashcard-binding '_)]
       ~@body)))

(deftest should-be-able-to-use-it-when-everything-is-g2g
  (with-sharing-enabled-and-temp-dashcard-referencing :venues :name [dashboard]
    (is (= {:values          [["20th Century Cafe"]
                              ["25°"]
                              ["33 Taps"]
                              ["800 Degrees Neapolitan Pizzeria"]
                              ["BCD Tofu House"]]
            :field_id        (mt/id :venues :name)
            :has_more_values false}
           (-> (client/client :get 200 (field-values-url dashboard (mt/id :venues :name)))
               (update :values (partial take 5)))))))

(deftest shound-not-be-able-to-use-the-endpoint-with-a-field-not-referenced-by-the-dashboard
  (with-sharing-enabled-and-temp-dashcard-referencing :venues :name [dashboard]
    (is (= "An error occurred."
           (client/client :get 400 (field-values-url dashboard (mt/id :venues :price)))))))

(deftest endpoint-should-fail-if-public-sharing-is-disabled
  (with-sharing-enabled-and-temp-dashcard-referencing :venues :name [dashboard]
    (mt/with-temporary-setting-values [enable-public-sharing false]
      (is (= "An error occurred."
             (client/client :get 400 (field-values-url dashboard (mt/id :venues :name))))))))


;;; ----------------------------------------------- search-card-fields -----------------------------------------------

(deftest search-card-fields
  (with-sharing-enabled-and-temp-card-referencing :venues :id [card]
    (is (= [[93 "33 Taps"]]
           (api.public/search-card-fields (u/the-id card) (mt/id :venues :id) (mt/id :venues :name) "33 T" 10)))))

(deftest shouldn-t-work-if-the-search-field-isn-t-allowed-to-be-used-in-combination-with-the-other-field
  (with-sharing-enabled-and-temp-card-referencing :venues :id [card]
    (is (thrown?
         Exception
         (api.public/search-card-fields (u/the-id card) (mt/id :venues :id) (mt/id :venues :price) "33 T" 10)))))

(deftest shouldn-t-work-if-the-field-isn-t-referenced-by-card
  (with-sharing-enabled-and-temp-card-referencing :venues :name [card]
    (is (thrown?
         Exception
         (api.public/search-card-fields (u/the-id card) (mt/id :venues :id) (mt/id :venues :id) "33 T" 10)))))


;;; ----------------------- GET /api/public/card/:uuid/field/:field/search/:search-field-id nil -----------------------

(defn- field-search-url [card-or-dashboard field-or-id search-field-or-id]
  (str "public/"
       (condp instance? card-or-dashboard
         (class Card)      "card"
         (class Dashboard) "dashboard")
       "/" (:public_uuid card-or-dashboard)
       "/field/" (u/the-id field-or-id)
       "/search/" (u/the-id search-field-or-id)))

(deftest field-search-with-venue
  (is (= [[93 "33 Taps"]]
         (with-sharing-enabled-and-temp-card-referencing :venues :id [card]
           (client/client :get 200 (field-search-url card (mt/id :venues :id) (mt/id :venues :name))
                          :value "33 T")))))

(deftest if-search-field-isn-t-allowed-to-be-used-with-the-other-field-endpoint-should-return-exception
  (is (= "An error occurred."
         (with-sharing-enabled-and-temp-card-referencing :venues :id [card]
           (client/client :get 400 (field-search-url card (mt/id :venues :id) (mt/id :venues :price))
                          :value "33 T")))))

(deftest search-endpoint-should-fail-if-public-sharing-is-disabled
  (is (= "An error occurred."
         (with-sharing-enabled-and-temp-card-referencing :venues :id [card]
           (mt/with-temporary-setting-values [enable-public-sharing false]
             (client/client :get 400 (field-search-url card (mt/id :venues :id) (mt/id :venues :name))
                            :value "33 T"))))))


;;; -------------------- GET /api/public/dashboard/:uuid/field/:field/search/:search-field-id nil ---------------------

(deftest dashboard
  (with-sharing-enabled-and-temp-dashcard-referencing :venues :id [dashboard]
    (is (= [[93 "33 Taps"]]
           (client/client :get (field-search-url dashboard (mt/id :venues :id) (mt/id :venues :name))
                          :value "33 T")))))

(deftest dashboard-if-search-field-isn-t-allowed-to-be-used-with-the-other-field-endpoint-should-return-exception
  (with-sharing-enabled-and-temp-dashcard-referencing :venues :id [dashboard]
    (is (= "An error occurred."
           (client/client :get 400 (field-search-url dashboard (mt/id :venues :id) (mt/id :venues :price))
                          :value "33 T")))))

(deftest dashboard-endpoint-should-fail-if-public-sharing-is-disabled
  (with-sharing-enabled-and-temp-dashcard-referencing :venues :id [dashboard]
    (mt/with-temporary-setting-values [enable-public-sharing false]
      (is (= "An error occurred."
             (client/client :get 400 (field-search-url dashboard (mt/id :venues :name) (mt/id :venues :name))
                            :value "33 T"))))))

;;; --------------------------------------------- field-remapped-values ----------------------------------------------

;; `field-remapped-values` should return remappings in the expected format when the combination of Fields is allowed.
;; It should parse the value string (it comes back from the API as a string since it is a query param)

(deftest should-parse-string
  (is (= [10 "Fred 62"]
         (#'api.public/field-remapped-values (mt/id :venues :id) (mt/id :venues :name) "10"))))

(deftest if-the-field-isn-t-allowed
  (is (thrown?
       Exception
       (#'api.public/field-remapped-values (mt/id :venues :id) (mt/id :venues :price) "10"))))

;;; ----------------------- GET /api/public/card/:uuid/field/:field/remapping/:remapped-id nil ------------------------

(defn- field-remapping-url [card-or-dashboard field-or-id remapped-field-or-id]
  (str "public/"
       (condp instance? card-or-dashboard
         (class Card)      "card"
         (class Dashboard) "dashboard")
       "/" (:public_uuid card-or-dashboard)
       "/field/" (u/the-id field-or-id)
       "/remapping/" (u/the-id remapped-field-or-id)))


(deftest we-should-be-able-to-use-the-api-endpoint-and-get-the-same-results-we-get-by-calling-the-function-above-directly
  (with-sharing-enabled-and-temp-card-referencing :venues :id [card]
    (is (= [10 "Fred 62"]
           (client/client :get 200 (field-remapping-url card (mt/id :venues :id) (mt/id :venues :name))
                          :value "10")))))

(deftest shouldn-t-work-if-card-doesn-t-reference-the-field-in-question
  (with-sharing-enabled-and-temp-card-referencing :venues :price [card]
    (is (= "An error occurred."
           (client/client :get 400 (field-remapping-url card (mt/id :venues :id) (mt/id :venues :name))
                          :value "10")))))


(deftest ---or-if-the-remapping-field-isn-t-allowed-to-be-used-with-the-other-field
  (with-sharing-enabled-and-temp-card-referencing :venues :id [card]
    (is (= "An error occurred."
           (client/client :get 400 (field-remapping-url card (mt/id :venues :id) (mt/id :venues :price))
                          :value "10")))))

(deftest ---or-if-public-sharing-is-disabled
  (with-sharing-enabled-and-temp-card-referencing :venues :id [card]
    (mt/with-temporary-setting-values [enable-public-sharing false]
      (is (= "An error occurred."
             (client/client :get 400 (field-remapping-url card (mt/id :venues :id) (mt/id :venues :name))
                            :value "10"))))))

;;; --------------------- GET /api/public/dashboard/:uuid/field/:field/remapping/:remapped-id nil ---------------------


(deftest api-endpoint-should-return-same-results-as-function
  (with-sharing-enabled-and-temp-dashcard-referencing :venues :id [dashboard]
    (is (= [10 "Fred 62"]
           (client/client :get 200 (field-remapping-url dashboard (mt/id :venues :id) (mt/id :venues :name))
                          :value "10")))))

(deftest field-remapping-shouldn-t-work-if-card-doesn-t-reference-the-field-in-question
  (with-sharing-enabled-and-temp-dashcard-referencing :venues :price [dashboard]
    (is (= "An error occurred."
           (client/client :get 400 (field-remapping-url dashboard (mt/id :venues :id) (mt/id :venues :name))
                          :value "10")))))

(deftest remapping-or-if-the-remapping-field-isn-t-allowed-to-be-used-with-the-other-field
  (with-sharing-enabled-and-temp-dashcard-referencing :venues :id [dashboard]
    (is (= "An error occurred."
           (client/client :get 400 (field-remapping-url dashboard (mt/id :venues :id) (mt/id :venues :price))
                          :value "10")))))

(deftest remapping-or-if-public-sharing-is-disabled
  (with-sharing-enabled-and-temp-dashcard-referencing :venues :id [dashboard]
    (mt/with-temporary-setting-values [enable-public-sharing false]
      (is (= "An error occurred."
             (client/client :get 400 (field-remapping-url dashboard (mt/id :venues :id) (mt/id :venues :name))
                            :value "10"))))))

;;; --------------------------------------------- Chain filter endpoints ---------------------------------------------

(deftest chain-filter-test
  (mt/with-temporary-setting-values [enable-public-sharing true]
    (api.dashboard-test/with-chain-filter-fixtures [{:keys [dashboard param-keys]}]
      (let [uuid (str (UUID/randomUUID))]
        (is (= true
               (db/update! Dashboard (u/the-id dashboard) :public_uuid uuid)))
        (testing "GET /api/public/dashboard/:uuid/params/:param-key/values"
          (let [url (format "public/dashboard/%s/params/%s/values" uuid (:category-id param-keys))]
            (is (= {:values          [2 3 4 5 6]
                    :has_more_values false}
                   (chain-filter-test/take-n-values 5 (client/client :get 200 url))))))
        (testing "GET /api/public/dashboard/:uuid/params/:param-key/search/:query"
          (let [url (format "public/dashboard/%s/params/%s/search/food" uuid (:category-name param-keys))]
            (is (= {:values          ["Fast Food" "Food Truck" "Seafood"]
                    :has_more_values false}
                   (chain-filter-test/take-n-values 3 (client/client :get 200 url))))))))))

(deftest chain-filter-ignore-current-user-permissions-test
  (testing "Should not fail if request is authenticated but current user does not have data permissions"
    (mt/with-temp-copy-of-db
      (perms/revoke-data-perms! (perms-group/all-users) (mt/db))
      (mt/with-temporary-setting-values [enable-public-sharing true]
        (api.dashboard-test/with-chain-filter-fixtures [{:keys [dashboard param-keys]}]
          (let [uuid (str (UUID/randomUUID))]
            (is (= true
                   (db/update! Dashboard (u/the-id dashboard) :public_uuid uuid)))
            (testing "GET /api/public/dashboard/:uuid/params/:param-key/values"
              (let [url (format "public/dashboard/%s/params/%s/values" uuid (:category-id param-keys))]
                (is (= {:values          [2 3 4 5 6]
                        :has_more_values false}
                       (chain-filter-test/take-n-values 5 (mt/user-http-request :rasta :get 200 url))))))
            (testing "GET /api/public/dashboard/:uuid/params/:param-key/search/:prefix"
              (let [url (format "public/dashboard/%s/params/%s/search/food" uuid (:category-name param-keys))]
                (is (= {:values          ["Fast Food" "Food Truck" "Seafood"]
                        :has_more_values false}
                       (chain-filter-test/take-n-values 3 (mt/user-http-request :rasta :get 200 url))))))))))))

;; Pivot tables

(deftest pivot-public-card-test
  (mt/test-drivers (api.pivots/applicable-drivers)
    (mt/dataset sample-dataset
      (testing "GET /api/public/pivot/card/:uuid/query"
        (mt/with-temporary-setting-values [enable-public-sharing true]
          (with-temp-public-card [{uuid :public_uuid} (api.pivots/pivot-card)]
            (let [result (client/client :get 202 (format "public/pivot/card/%s/query" uuid))
                  rows   (mt/rows result)]
              (is (nil? (:row_count result))) ;; row_count isn't included in public endpoints
              (is (= "completed" (:status result)))
              (is (= 6 (count (get-in result [:data :cols]))))
              (is (= 1144 (count rows)))

              (is (= ["AK" "Affiliate" "Doohickey" 0 18 81] (first rows)))
              (is (= ["CO" "Affiliate" "Gadget" 0 62 211] (nth rows 100)))
              (is (= [nil nil nil 7 18760 69540] (last rows))))))))))

(defn- pivot-dashcard-url
  "URL for fetching results of a public DashCard."
  [dash card dashcard]
  (format "public/pivot/dashboard/%s/dashcard/%d/card/%d" (:public_uuid dash) (u/the-id dashcard) (u/the-id card)))

(deftest pivot-public-dashcard-test
  (testing "GET /api/public/pivot/dashboard/:uuid/dashcard/:dashcard-id/card/:card-id"
    (mt/test-drivers (api.pivots/applicable-drivers)
      (mt/dataset sample-dataset
        (mt/with-temporary-setting-values [enable-public-sharing true]
          (with-temp-public-dashboard [dash {:parameters [{:id      "_STATE_"
                                                           :name    "State"
                                                           :slug    "state"
                                                           :type    "text"
                                                           :target  [:dimension (mt/$ids $orders.user_id->people.state)]
                                                           :default nil}]}]
            (with-temp-public-card [card (api.pivots/pivot-card)]
              (let [dashcard (add-card-to-dashboard!
                              card
                              dash
                              :parameter_mappings [{:parameter_id "_STATE_"
                                                    :card_id      (u/the-id card)
                                                    :target       [:dimension (mt/$ids $orders.user_id->people.state)]}])]
                (letfn [(results [& query-parameters]
                          (apply client/client :get 202 (pivot-dashcard-url dash card dashcard) query-parameters))]
                  (testing "without parameters"
                    (let [result (results)]
                      (is (schema= {:status   (s/eq "completed")
                                    s/Keyword s/Any}
                                   result))
                      ;; [[metabase.api.public/transform-results]] should remove `row_count`
                      (testing "row_count isn't included in public endpoints"
                        (is (nil? (:row_count result))))
                      (is (= 6 (count (get-in result [:data :cols]))))
                      (let [rows (mt/rows result)]
                        (is (= 1144 (count rows)))
                        (is (= ["AK" "Affiliate" "Doohickey" 0 18 81] (first rows)))
                        (is (= ["CO" "Affiliate" "Gadget" 0 62 211] (nth rows 100)))
                        (is (= [nil nil nil 7 18760 69540] (last rows))))))

                  (testing "with parameters"
                    (let [result (results :parameters (json/encode [{:name   "State"
                                                                     :id     "_STATE_"
                                                                     :slug   :state
                                                                     :target [:dimension (mt/$ids $orders.user_id->people.state)]
                                                                     :value  ["CA" "WA"]}]))]
                      (is (schema= {:status   (s/eq "completed")
                                    s/Keyword s/Any}
                                   result))
                      (testing "row_count isn't included in public endpoints"
                        (is (nil? (:row_count result))))
                      (is (= 6 (count (get-in result [:data :cols]))))
                      (let [rows (mt/rows result)]
                        (is (= 80 (count rows)))
                        (is (= ["CA" "Affiliate" "Doohickey" 0 16 48] (first rows)))
                        (is (= [nil "Google" "Gizmo" 1 52 186] (nth rows 50)))
                        (is (= [nil nil nil 7 1015 3758] (last rows)))))))))))))))
