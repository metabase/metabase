(ns metabase.api.public-test
  "Tests for `api/public/` (public links) endpoints."
  (:require [cheshire.core :as json]
            [clojure
             [string :as str]
             [test :refer :all]]
            [dk.ative.docjure.spreadsheet :as spreadsheet]
            [metabase
             [http-client :as http]
             [models :refer [Card Collection Dashboard DashboardCard DashboardCardSeries Dimension Field FieldValues]]
             [test :as mt]
             [util :as u]]
            [metabase.api.public :as public-api]
            [metabase.models
             [permissions :as perms]
             [permissions-group :as group]]
            [toucan.db :as db])
  (:import java.io.ByteArrayInputStream
           java.util.UUID))

;;; --------------------------------------------------- Helper Fns ---------------------------------------------------

(defn count-of-venues-card []
  {:dataset_query (mt/mbql-query venues
                    {:aggregation [[:count]]})})

(defn- shared-obj []
  {:public_uuid       (str (UUID/randomUUID))
   :made_public_by_id (mt/user->id :crowberto)})

(defmacro ^:private with-temp-public-card {:style/indent 1} [[binding & [card]] & body]
  `(let [card-settings# (merge (count-of-venues-card) (shared-obj) ~card)]
     (mt/with-temp Card [card# card-settings#]
       ;; add :public_uuid back in to the value that gets bound because it might not come back from post-select if
       ;; public sharing is disabled; but we still want to test it
       (let [~binding (assoc card# :public_uuid (:public_uuid card-settings#))]
         ~@body))))

(defmacro ^:private with-temp-public-dashboard {:style/indent 1} [[binding & [dashboard]] & body]
  `(let [dashboard-settings# (merge
                              {:parameters [{:name    "Venue ID"
                                             :slug    "venue_id"
                                             :type    "id"
                                             :target  [:dimension (mt/id :venues :id)]
                                             :default nil}]}
                              (shared-obj)
                              ~dashboard)]
     (mt/with-temp Dashboard [dashboard# dashboard-settings#]
       (let [~binding (assoc dashboard# :public_uuid (:public_uuid dashboard-settings#))]
         ~@body))))

(defn- add-card-to-dashboard! {:style/indent 2} [card dashboard & {:as kvs}]
  (db/insert! DashboardCard (merge {:dashboard_id (u/get-id dashboard), :card_id (u/get-id card)}
                                   kvs)))

(defmacro ^:private with-temp-public-dashboard-and-card
  {:style/indent 1}
  [[dashboard-binding card-binding & [dashcard-binding]] & body]
  `(with-temp-public-dashboard [dash#]
     (with-temp-public-card [card#]
       (let [~dashboard-binding        dash#
             ~card-binding             card#
             ~(or dashcard-binding
                  (gensym "dashcard")) (add-card-to-dashboard! card# dash#)]
         ~@body))))


;;; ------------------------------------------- GET /api/public/card/:uuid -------------------------------------------

(deftest check-that-we--cannot--fetch-a-publiccard-if-the-setting-is-disabled
  (mt/with-temporary-setting-values [enable-public-sharing false]
    (with-temp-public-card [{uuid :public_uuid}]
      (is (= "An error occurred."
             (http/client :get 400 (str "public/card/" uuid)))))))


(deftest check-that-we-get-a-400-if-the-publiccard-doesn-t-exist
  (mt/with-temporary-setting-values [enable-public-sharing true]
    (is (= "An error occurred."
           (http/client :get 400 (str "public/card/" (UUID/randomUUID)))))))

(deftest check-that-we--cannot--fetch-a-publiccard-if-the-card-has-been-archived
  (mt/with-temporary-setting-values [enable-public-sharing true]
    (with-temp-public-card [{uuid :public_uuid} {:archived true}]
      (is (= "An error occurred."
             (http/client :get 400 (str "public/card/" uuid)))))))

(deftest check-that-we-can-fetch-a-publiccard
  (mt/with-temporary-setting-values [enable-public-sharing true]
    (with-temp-public-card [{uuid :public_uuid}]
      (is (= #{:dataset_query :description :display :id :name :visualization_settings :param_values :param_fields}
             (set (keys (http/client :get 200 (str "public/card/" uuid)))))))))

(deftest make-sure--param-values-get-returned-as-expected
  (mt/with-temp Card [card {:dataset_query
                            {:database (mt/id)
                             :type     :native
                             :native   {:query         (str "SELECT COUNT(*) "
                                                            "FROM venues "
                                                            "LEFT JOIN categories ON venues.category_id = categories.id "
                                                            "WHERE {{category}}")
                                        :collection    "CATEGORIES"
                                        :template-tags {:category {:name         "category"
                                                                   :display-name "Category"
                                                                   :type         "dimension"
                                                                   :dimension    ["field-id" (mt/id :categories :name)]
                                                                   :widget-type  "category"
                                                                   :required     true}}}}}]
    (is (= {(mt/id :categories :name) {:values                75
                                         :human_readable_values {}
                                         :field_id              (mt/id :categories :name)}}
           (-> (:param_values (#'public-api/public-card :id (u/get-id card)))
               (update-in [(mt/id :categories :name) :values] count)
               (update (mt/id :categories :name) #(into {} %)))))))



;;; ------------------------- GET /api/public/card/:uuid/query (and JSON/CSV/XSLX versions) --------------------------

(deftest check-that-we--cannot--execute-a-publiccard-if-the-setting-is-disabled
  (mt/with-temporary-setting-values [enable-public-sharing false]
    (with-temp-public-card [{uuid :public_uuid}]
      (is (= "An error occurred."
             (http/client :get 400 (str "public/card/" uuid "/query")))))))

(deftest check-that-we-get-a-400-if-the-publiccard-doesn-t-exist
  (mt/with-temporary-setting-values [enable-public-sharing true]
    (is (= "An error occurred."
           (http/client :get 400 (str "public/card/" (UUID/randomUUID) "/query"))))))

(deftest check-that-we--cannot--execute-a-publiccard-if-the-card-has-been-archived
  (mt/with-temporary-setting-values [enable-public-sharing true]
    (with-temp-public-card [{uuid :public_uuid} {:archived true}]
      (is (= "An error occurred."
             (http/client :get 400 (str "public/card/" uuid "/query")))))))

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
                 (mt/rows (http/client :get 202 (str "public/card/" uuid "/query"))))))

        (testing ":json download response format"
          (is (= [{:Count 100}]
                 (http/client :get 202 (str "public/card/" uuid "/query/json")))))

        (testing ":csv download response format"
          (is (= "Count\n100\n"
                 (http/client :get 202 (str "public/card/" uuid "/query/csv"), :format :csv))))

        (testing ":xlsx download response format"
          (is (= [{:col "Count"} {:col 100.0}]
                 (parse-xlsx-response
                  (http/client :get 202 (str "public/card/" uuid "/query/xlsx") {:request-options {:as :byte-array}})))))))))

(deftest execute-public-card-as-user-without-perms-test
  (testing "A user that doesn't have permissions to run the query normally should still be able to run a public Card as if they weren't logged in"
    (mt/with-temporary-setting-values [enable-public-sharing true]
      (mt/with-temp Collection [{collection-id :id}]
        (perms/revoke-collection-permissions! (group/all-users) collection-id)
        (with-temp-public-card [{card-id :id, uuid :public_uuid} {:collection_id collection-id}]
          (is (= "You don't have permissions to do that."
                 ((mt/user->client :rasta) :post 403 (format "card/%d/query" card-id)))
              "Sanity check: shouldn't be allowed to run the query normally")
          (is (= [[100]]
                 (mt/rows
                   ((mt/user->client :rasta) :get 202 (str "public/card/" uuid "/query"))))))))))

(deftest check-that-we-can-exec-a-publiccard-with---parameters-
  (mt/with-temporary-setting-values [enable-public-sharing true]
    (with-temp-public-card [{uuid :public_uuid}]
      (is (= [{:name "Venue ID", :slug "venue_id", :type "id", :value 2}]
             (get-in (http/client :get 202 (str "public/card/" uuid "/query")
                                  :parameters (json/encode [{:name "Venue ID", :slug "venue_id", :type "id", :value 2}]))
                     [:json_query :parameters]))))))

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
             (http/client :get 202 (str "public/card/" uuid "/query")
                          :parameters (json/encode [{:type   "category"
                                                     :target [:variable [:template-tag "price"]]
                                                     :value  1}])))))))

(deftest missing-required-param-error-message-test
  (testing (str "If you're missing a required param, the error message should get passed thru, rather than the normal "
                "generic 'Query Failed' message that we show for most embedding errors")
    (with-required-param-card [uuid]
      (is (= {:status     "failed"
              :error      "You'll need to pick a value for 'Price' before this query can run."
              :error_type "missing-required-parameter"}
             (mt/suppress-output
               (http/client :get 202 (str "public/card/" uuid "/query"))))))))

(defn- card-with-date-field-filter []
  (assoc (shared-obj)
         :dataset_query {:database (mt/id)
                         :type     :native
                         :native   {:query         "SELECT COUNT(*) AS \"count\" FROM CHECKINS WHERE {{date}}"
                                    :template-tags {:date {:name         "date"
                                                           :display-name "Date"
                                                           :type         "dimension"
                                                           :dimension    [:field-id (mt/id :checkins :date)]
                                                           :widget-type  "date/quarter-year"}}}}))


(deftest make-sure-csv--etc---downloads-take-editable-params-into-account---6407----
  (mt/with-temporary-setting-values [enable-public-sharing true]
    (mt/with-temp Card [{uuid :public_uuid} (card-with-date-field-filter)]
      (is (= "count\n107\n"
             (http/client :get 202 (str "public/card/" uuid "/query/csv")
                          :parameters (json/encode [{:type   :date/quarter-year
                                                     :target [:dimension [:template-tag :date]]
                                                     :value  "Q1-2014"}])))))))


(deftest make-sure-it-also-works-with-the-forwarded-url
  (mt/with-temporary-setting-values [enable-public-sharing true]
    (mt/with-temp Card [{uuid :public_uuid} (card-with-date-field-filter)]
      ;; make sure the URL doesn't include /api/ at the beginning like it normally would
      (binding [http/*url-prefix* (str/replace http/*url-prefix* #"/api/$" "/")]
        (mt/with-temporary-setting-values [site-url http/*url-prefix*]
          (is (= "count\n107\n"
                 (http/client :get 202 (str "public/question/" uuid ".csv")
                              :parameters (json/encode [{:type   :date/quarter-year
                                                         :target [:dimension [:template-tag :date]]
                                                         :value  "Q1-2014"}])))))))))

(defn- card-with-trendline []
  (assoc (shared-obj)
         :dataset_query {:database (mt/id)
                         :type     :query
                         :query   {:source-table (mt/id :checkins)
                                   :breakout     [[:datetime-field [:field-id (mt/id :checkins :date)]  :month]]
                                   :aggregation  [[:count]]}}))

(deftest make-sure-we-include-all-the-relevant-fields-like-insights
  (mt/with-temporary-setting-values [enable-public-sharing true]
    (mt/with-temp Card [{uuid :public_uuid} (card-with-trendline)]
      (is (= #{:cols :rows :insights :results_timezone}
             (-> (http/client :get 202 (str "public/card/" uuid "/query"))
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
                 (http/client :get 400 (str "public/dashboard/" uuid)))))))

    (testing "Should get a 400 if the Dashboard doesn't exist"
      (mt/with-temporary-setting-values [enable-public-sharing true]
        (is (= "An error occurred."
               (http/client :get 400 (str "public/dashboard/" (UUID/randomUUID)))))))))

(defn- fetch-public-dashboard [{uuid :public_uuid}]
  (-> (http/client :get 200 (str "public/dashboard/" uuid))
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
          (db/update! Card (u/get-id card), :archived true)
          (is (= {:name true, :ordered_cards 0}
                 (fetch-public-dashboard dash))))))))


;;; --------------------------------- GET /api/public/dashboard/:uuid/card/:card-id ----------------------------------

(defn- dashcard-url
  "URL for fetching results of a public DashCard."
  [dash card]
  (str "public/dashboard/" (:public_uuid dash) "/card/" (u/get-id card)))

(deftest execute-public-dashcard-errors-test
  (testing "GET /api/public/dashboard/:uuid/card/:card-id"
    (testing "Shouldn't be able to execute a public DashCard if public sharing is disabled"
      (mt/with-temporary-setting-values [enable-public-sharing false]
        (with-temp-public-dashboard-and-card [dash card]
          (is (= "An error occurred."
                 (http/client :get 400 (dashcard-url dash card)))))))

    (testing "Should get a 400"
      (mt/with-temporary-setting-values [enable-public-sharing true]
        (with-temp-public-dashboard-and-card [dash card]
          (testing "if the Dashboard doesn't exist"
            (is (= "An error occurred."
                   (http/client :get 400 (dashcard-url {:public_uuid (UUID/randomUUID)} card)))))

          (testing "if the Card doesn't exist"
            (is (= "An error occurred."
                   (http/client :get 400 (dashcard-url dash Integer/MAX_VALUE)))))

          (testing "if the Card exists, but it's not part of this Dashboard"
            (mt/with-temp Card [card]
              (is (= "An error occurred."
                     (http/client :get 400 (dashcard-url dash card))))))

          (testing "if the Card has been archived."
            (db/update! Card (u/get-id card), :archived true)
            (is (= "An error occurred."
                   (http/client :get 400 (dashcard-url dash card))))))))))

(deftest execute-public-dashcard-test
  (testing "GET /api/public/dashboard/:uuid/card/:card-id"
    (mt/with-temporary-setting-values [enable-public-sharing true]
      (with-temp-public-dashboard-and-card [dash card]
        (is (= [[100]]
               (mt/rows (http/client :get 202 (dashcard-url dash card)))))

        (testing "with parameters"
          (is (= [{:name    "Venue ID"
                   :slug    "venue_id"
                   :target  ["dimension" (mt/id :venues :id)]
                   :value   [10]
                   :default nil
                   :type    "id"}]
                 (get-in (http/client :get 202 (dashcard-url dash card)
                                      :parameters (json/encode [{:name   "Venue ID"
                                                                 :slug   :venue_id
                                                                 :target [:dimension (mt/id :venues :id)]
                                                                 :value  [10]}]))
                         [:json_query :parameters]))))))))

(deftest execute-public-dashcard-as-user-without-perms-test
  (testing "GET /api/public/dashboard/:uuid/card/:card-id"
    (testing "A user that doesn't have permissions to run the query normally should still be able to run a public DashCard"
      (mt/with-temporary-setting-values [enable-public-sharing true]
        (mt/with-temp Collection [{collection-id :id}]
          (perms/revoke-collection-permissions! (group/all-users) collection-id)
          (with-temp-public-dashboard-and-card [dash {card-id :id, :as card}]
            (db/update! Card card-id :collection_id collection-id)
            (is (= "You don't have permissions to do that."
                   ((mt/user->client :rasta) :post 403 (format "card/%d/query" card-id)))
                "Sanity check: shouldn't be allowed to run the query normally")
            (is (= [[100]]
                   (mt/rows
                     ((mt/user->client :rasta) :get 202 (dashcard-url dash card)))))))))))


(deftest execute-public-dashcard-params-validation-test
  (testing "GET /api/public/dashboard/:uuid/card/:card-id"
    (testing "Make sure params are validated"
      (mt/with-temporary-setting-values [enable-public-sharing true]
        (with-temp-public-dashboard-and-card [dash card]
          (testing "Should work correctly with a valid parameter"
            (is (= [[1]]
                   (mt/rows (http/client :get 202 (dashcard-url dash card)
                                         :parameters (json/encode [{:name   "Venue ID"
                                                                    :slug   :venue_id
                                                                    :target [:dimension (mt/id :venues :id)]
                                                                    :value  [10]}]))))
                "This should pass because venue_id *is* one of the Dashboard's :parameters"))

          (testing "should fail if"
            (testing "a parameter is passed that is not one of the Dashboard's parameters"
              (is (= "An error occurred."
                     (http/client :get 400 (dashcard-url dash card)
                                  :parameters (json/encode [{:name   "Venue Name"
                                                             :slug   :venue_name
                                                             :target [:dimension (mt/id :venues :name)]
                                                             :value  ["PizzaHacker"]}])))))))))))

(deftest execute-public-dashcard-additional-series-test
  (testing "GET /api/public/dashboard/:uuid/card/:card-id"
    (testing "should work with an additional Card series"
      (mt/with-temporary-setting-values [enable-public-sharing true]
        (with-temp-public-dashboard-and-card [dash card]
          (with-temp-public-card [card-2]
            (mt/with-temp DashboardCardSeries [_ {:dashboardcard_id (db/select-one-id DashboardCard
                                                                      :card_id      (u/get-id card)
                                                                      :dashboard_id (u/get-id dash))
                                                  :card_id          (u/get-id card-2)}]
              (is (= [[100]]
                     (mt/rows (http/client :get 202 (dashcard-url dash card-2))))))))))))

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
                                                             :id   "537e37b4"
                                                             :type "category"}]}]
              (add-card-to-dashboard! card dash
                :parameter_mappings [{:card_id      (u/get-id card)
                                      :target       [:variable
                                                     [:template-tag :num]]
                                      :parameter_id "537e37b4"}])
              (is (= [[50]]
                     (-> ((mt/user->client :crowberto)
                          :get (str (dashcard-url dash card)
                                    "?parameters="
                                    (json/generate-string
                                     [{:type   :category
                                       :target [:variable [:template-tag :num]]
                                       :value  "50"}])))
                         mt/rows))))))

        (testing "with MBQL queries"
          (testing "`:id` parameters"
            (mt/with-temp Card [card {:dataset_query {:database (mt/id)
                                                      :type     :query
                                                      :query    {:source-table (mt/id :venues)
                                                                 :aggregation  [:count]}}}]
              (with-temp-public-dashboard [dash {:parameters [{:name "Venue ID"
                                                               :slug "venue_id"
                                                               :id   "22486e00"
                                                               :type "id"}]}]
                (add-card-to-dashboard! card dash
                  :parameter_mappings [{:parameter_id "22486e00"
                                        :card_id      (u/get-id card)
                                        :target       [:dimension [:field-id (mt/id :venues :id)]]}])
                (is (= [[1]]
                       (-> ((mt/user->client :crowberto)
                            :get (str (dashcard-url dash card)
                                      "?parameters="
                                      (json/generate-string
                                       [{:type   :id
                                         :target [:dimension [:field-id (mt/id :venues :id)]]
                                         :value  "50"}])))
                           mt/rows))))))

          (testing "temporal parameters"
            (mt/with-temporary-setting-values [enable-public-sharing true]
              (mt/with-temp Card [card {:dataset_query {:database (mt/id)
                                                        :type     :query
                                                        :query    {:source-table (mt/id :checkins)
                                                                   :aggregation  [:count]}}}]
                (with-temp-public-dashboard [dash {:parameters [{:name "Date Filter"
                                                                 :slug "date_filter"
                                                                 :id   "18a036ec"
                                                                 :type "date/all-options"}]}]
                  (add-card-to-dashboard! card dash
                    :parameter_mappings [{:parameter_id "18a036ec"
                                          :card_id      (u/get-id card)
                                          :target       [:dimension
                                                         [:field-id
                                                          (mt/id :checkins :date)]]}])
                  (is (= [[733]]
                         (-> ((mt/user->client :crowberto)
                              :get (str (dashcard-url dash card)
                                        "?parameters="
                                        (json/generate-string
                                         [{:type   "date/all-options"
                                           :target [:dimension [:field-id (mt/id :checkins :date)]]
                                           :value  "~2015-01-01"}])))
                             mt/rows))))))))))))

(deftest execute-public-dashcard-dimension-value-params-test
  (testing "GET /api/public/dashboard/:uuid/card/:card-id"
    (testing (str "make sure DimensionValue params also work if they have a default value, even if some is passed in "
                  "for some reason as part of the query (#7253) If passed in as part of the query however make sure it "
                  "doesn't override what's actually in the DB")
      (mt/with-temporary-setting-values [enable-public-sharing true]
        (mt/with-temp Card [card {:dataset_query {:database (mt/id)
                                                  :type     :native
                                                  :native   {:query         "SELECT {{msg}} AS message"
                                                             :template-tags {:msg {:id           "181da7c5"
                                                                                   :name         "msg"
                                                                                   :display-name "Message"
                                                                                   :type         "text"
                                                                                   :required     true
                                                                                   :default      "Wow"}}}}}]
          (with-temp-public-dashboard [dash {:parameters [{:name "Message"
                                                           :slug "msg"
                                                           :id   "181da7c5"
                                                           :type "category"}]}]
            (add-card-to-dashboard! card dash
              :parameter_mappings [{:card_id      (u/get-id card)
                                    :target       [:variable [:template-tag :msg]]
                                    :parameter_id "181da7c5"}])
            (is (= [["Wow"]]
                   (-> ((mt/user->client :crowberto)
                        :get (str (dashcard-url dash card)
                                  "?parameters="
                                  (json/generate-string
                                   [{:type    :category
                                     :target  [:variable [:template-tag :msg]]
                                     :value   nil
                                     :default "Hello"}])))
                       mt/rows)))))))))


;;; --------------------------- Check that parameter information comes back with Dashboard ---------------------------

(deftest double-check-that-the-field-has-fieldvalues
  (is (= [1 2 3 4]
         (db/select-one-field :values FieldValues :field_id (mt/id :venues :price)))))

(defn- price-param-values []
  {(keyword (str (mt/id :venues :price))) {:values                [1 2 3 4]
                                             :human_readable_values {}
                                             :field_id              (mt/id :venues :price)}})

(defn- add-price-param-to-dashboard! [dashboard]
  (db/update! Dashboard (u/get-id dashboard) :parameters [{:name "Price", :type "category", :slug "price"}]))

(defn- add-dimension-param-mapping-to-dashcard! [dashcard card dimension]
  (db/update! DashboardCard (u/get-id dashcard) :parameter_mappings [{:card_id (u/get-id card)
                                                                      :target  ["dimension" dimension]}]))

(defn- GET-param-values [dashboard]
  (mt/with-temporary-setting-values [enable-public-sharing true]
    (:param_values (http/client :get 200 (str "public/dashboard/" (:public_uuid dashboard))))))

(deftest check-that-param-info-comes-back-for-sql-cards
  (with-temp-public-dashboard-and-card [dash card dashcard]
    (db/update! Card (u/get-id card)
      :dataset_query {:database (mt/id)
                      :type     :native
                      :native   {:template-tags {:price {:name         "price"
                                                         :display-name "Price"
                                                         :type         "dimension"
                                                         :dimension    ["field-id" (mt/id :venues :price)]}}}})
    (add-price-param-to-dashboard! dash)
    (add-dimension-param-mapping-to-dashcard! dashcard card ["template-tag" "price"])
    (is (= (price-param-values)
           (GET-param-values dash)))))

(deftest check-that-param-info-comes-back-for-mbql-cards--field-id-
  (with-temp-public-dashboard-and-card [dash card dashcard]
    (add-price-param-to-dashboard! dash)
    (add-dimension-param-mapping-to-dashcard! dashcard card ["field-id" (mt/id :venues :price)])
    (is (= (price-param-values)
           (GET-param-values dash)))))

(deftest check-that-param-info-comes-back-for-mbql-cards--fk---
  (with-temp-public-dashboard-and-card [dash card dashcard]
    (add-price-param-to-dashboard! dash)
    (add-dimension-param-mapping-to-dashcard! dashcard card ["fk->" (mt/id :checkins :venue_id) (mt/id :venues :price)])
    (is (= (price-param-values)
           (GET-param-values dash)))))


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
               :filter       [:= [:field-id (mt/id table-kw field-kw)] "Krua Siri"]}}})

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
                                   :dimension    [:field-id (mt/id :venues :name)]}}}}})


;;; ------------------------------------------- card->referenced-field-ids -------------------------------------------

(deftest card-referencing-nothing
  (mt/with-temp Card [card (mbql-card-referencing-nothing)]
    (is (= #{}
           (#'public-api/card->referenced-field-ids card)))))

(deftest it-should-pick-up-on-fields-referenced-in-the-mbql-query-itself
  (mt/with-temp Card [card (mbql-card-referencing-venue-name)]
    (is (= #{(mt/id :venues :name)}
           (#'public-api/card->referenced-field-ids card)))))

(deftest ---as-well-as-template-tag--implict--params-for-sql-queries
  (mt/with-temp Card [card (sql-card-referencing-venue-name)]
    (is (= #{(mt/id :venues :name)}
           (#'public-api/card->referenced-field-ids card)))))

;;; --------------------------------------- check-field-is-referenced-by-card ----------------------------------------


(deftest check-that-the-check-succeeds-when-field-is-referenced
  (mt/with-temp Card [card (mbql-card-referencing-venue-name)]
    (#'public-api/check-field-is-referenced-by-card (mt/id :venues :name) (u/get-id card))))

(deftest check-that-exception-is-thrown-if-the-field-isn-t-referenced
  (is (thrown?
       Exception
       (mt/with-temp Card [card (mbql-card-referencing-venue-name)]
         (#'public-api/check-field-is-referenced-by-card (mt/id :venues :category_id) (u/get-id card))))))


;;; ----------------------------------------- check-search-field-is-allowed ------------------------------------------

;; search field is allowed IF:
;; A) search-field is the same field as the other one
(deftest search-field-allowed-if-same-field-as-other-one
  (#'public-api/check-search-field-is-allowed (mt/id :venues :id) (mt/id :venues :id))
  (is (thrown? Exception
               (#'public-api/check-search-field-is-allowed (mt/id :venues :id) (mt/id :venues :category_id)))))

;; B) there's a Dimension that lists search field as the human_readable_field for the other field
(deftest search-field-allowed-with-dimension
  (is (mt/with-temp Dimension [_ {:field_id (mt/id :venues :id), :human_readable_field_id (mt/id :venues :category_id)}]
        (#'public-api/check-search-field-is-allowed (mt/id :venues :id) (mt/id :venues :category_id)))))

;; C) search-field is a Name Field belonging to the same table as the other field, which is a PK
(deftest search-field-allowed-with-name-field
  (is (#'public-api/check-search-field-is-allowed (mt/id :venues :id) (mt/id :venues :name))))

;; not allowed if search field isn't a NAME
(deftest search-field-not-allowed-if-search-field-isnt-a-name
  (is (thrown? Exception
               (mt/with-temp-vals-in-db Field (mt/id :venues :name) {:special_type "type/Latitude"}
                 (#'public-api/check-search-field-is-allowed (mt/id :venues :id) (mt/id :venues :name))))))


(deftest not-allowed-if-search-field-belongs-to-a-different-table
  (is (thrown? Exception
               (mt/with-temp-vals-in-db Field (mt/id :categories :name) {:special_type "type/Name"}
                 (#'public-api/check-search-field-is-allowed (mt/id :venues :id) (mt/id :categories :name))))))



;;; ------------------------------------- check-field-is-referenced-by-dashboard -------------------------------------

(defn- dashcard-with-param-mapping-to-venue-id [dashboard card]
  {:dashboard_id       (u/get-id dashboard)
   :card_id            (u/get-id card)
   :parameter_mappings [{:card_id (u/get-id card)
                         :target  [:dimension [:field-id (mt/id :venues :id)]]}]})


(deftest field-is--referenced--by-dashboard-if-it-s-one-of-the-dashboard-s-params---
  (is (mt/with-temp* [Dashboard     [dashboard]
                      Card          [card]
                      DashboardCard [_ (dashcard-with-param-mapping-to-venue-id dashboard card)]]
        (#'public-api/check-field-is-referenced-by-dashboard (mt/id :venues :id) (u/get-id dashboard)))))


(deftest TODO-name-this-exception
  (is (thrown? Exception
               (mt/with-temp* [Dashboard     [dashboard]
                               Card          [card]
                               DashboardCard [_ (dashcard-with-param-mapping-to-venue-id dashboard card)]]
                 (#'public-api/check-field-is-referenced-by-dashboard (mt/id :venues :name) (u/get-id dashboard))))))

;; ...*or* if it's a so-called "implicit" param (a Field Filter Template Tag (FFTT) in a SQL Card)
(deftest implicit-param
  (is (mt/with-temp* [Dashboard     [dashboard]
                      Card          [card (sql-card-referencing-venue-name)]
                      DashboardCard [_ {:dashboard_id (u/get-id dashboard), :card_id (u/get-id card)}]]
        (#'public-api/check-field-is-referenced-by-dashboard (mt/id :venues :name) (u/get-id dashboard))))

  (is (thrown? Exception
               (mt/with-temp* [Dashboard     [dashboard]
                               Card          [card (sql-card-referencing-venue-name)]
                               DashboardCard [_ {:dashboard_id (u/get-id dashboard), :card_id (u/get-id card)}]]
                 (#'public-api/check-field-is-referenced-by-dashboard (mt/id :venues :id) (u/get-id dashboard))))))

;;; ------------------------------------------- card-and-field-id->values --------------------------------------------

(deftest we-should-be-able-to-get-values-for-a-field-referenced-by-a-card
  (mt/with-temp Card [card (mbql-card-referencing :venues :name)]
    (is (= {:values   [["20th Century Cafe"]
                       ["25°"]
                       ["33 Taps"]
                       ["800 Degrees Neapolitan Pizzeria"]
                       ["BCD Tofu House"]]
            :field_id (mt/id :venues :name)}
           (mt/derecordize (-> (public-api/card-and-field-id->values (u/get-id card) (mt/id :venues :name))
                               (update :values (partial take 5))))))))

(deftest sql-param-field-references-should-work-just-as-well-as-mbql-field-referenced
  (mt/with-temp Card [card (sql-card-referencing-venue-name)]
    (is (= {:values   [["20th Century Cafe"]
                       ["25°"]
                       ["33 Taps"]
                       ["800 Degrees Neapolitan Pizzeria"]
                       ["BCD Tofu House"]]
            :field_id (mt/id :venues :name)}
           (mt/derecordize (-> (public-api/card-and-field-id->values (u/get-id card) (mt/id :venues :name))
                               (update :values (partial take 5))))))))

(deftest but-if-the-field-is-not-referenced-we-should-get-an-exception
  (mt/with-temp Card [card (mbql-card-referencing :venues :price)]
    (is (thrown?
         Exception
         (public-api/card-and-field-id->values (u/get-id card) (mt/id :venues :name))))))


;;; ------------------------------- GET /api/public/card/:uuid/field/:field-id/values --------------------------------

(defn- field-values-url [card-or-dashboard field-or-id]
  (str "public/"
       (condp instance? card-or-dashboard
         (class Card)      "card"
         (class Dashboard) "dashboard")
       "/" (or (:public_uuid card-or-dashboard)
               (throw (Exception. (str "Missing public UUID: " card-or-dashboard))))
       "/field/" (u/get-id field-or-id)
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
  (is (= {:values   [["20th Century Cafe"]
                     ["25°"]
                     ["33 Taps"]
                     ["800 Degrees Neapolitan Pizzeria"]
                     ["BCD Tofu House"]]
          :field_id (mt/id :venues :name)}
         (with-sharing-enabled-and-temp-card-referencing :venues :name [card]
           (-> (http/client :get 200 (field-values-url card (mt/id :venues :name)))
               (update :values (partial take 5)))))))

(deftest but-for-fields-that-are-not-referenced-we-should-get-an-exception
  (is (= "An error occurred."
         (with-sharing-enabled-and-temp-card-referencing :venues :name [card]
           (http/client :get 400 (field-values-url card (mt/id :venues :price)))))))

(deftest field-value-endpoint-should-fail-if-public-sharing-is-disabled
  (is (= "An error occurred."
         (with-sharing-enabled-and-temp-card-referencing :venues :name [card]
           (mt/with-temporary-setting-values [enable-public-sharing false]
             (http/client :get 400 (field-values-url card (mt/id :venues :name))))))))

;;; ----------------------------- GET /api/public/dashboard/:uuid/field/:field-id/values -----------------------------

(defn do-with-sharing-enabled-and-temp-dashcard-referencing {:style/indent 2} [table-kw field-kw f]
  (mt/with-temporary-setting-values [enable-public-sharing true]
    (mt/with-temp* [Dashboard     [dashboard (shared-obj)]
                    Card          [card      (mbql-card-referencing table-kw field-kw)]
                    DashboardCard [dashcard  {:dashboard_id       (u/get-id dashboard)
                                              :card_id            (u/get-id card)
                                              :parameter_mappings [{:card_id (u/get-id card)
                                                                    :target  [:dimension
                                                                              [:field-id
                                                                               (mt/id table-kw field-kw)]]}]}]]
      (f dashboard card dashcard))))

(defmacro with-sharing-enabled-and-temp-dashcard-referencing
  {:style/indent 3}
  [table-kw field-kw [dashboard-binding card-binding dashcard-binding] & body]
  `(do-with-sharing-enabled-and-temp-dashcard-referencing ~table-kw ~field-kw
     (fn [~(or dashboard-binding '_) ~(or card-binding '_) ~(or dashcard-binding '_)]
       ~@body)))

(deftest should-be-able-to-use-it-when-everything-is-g2g
  (with-sharing-enabled-and-temp-dashcard-referencing :venues :name [dashboard]
    (is (= {:values   [["20th Century Cafe"]
                       ["25°"]
                       ["33 Taps"]
                       ["800 Degrees Neapolitan Pizzeria"]
                       ["BCD Tofu House"]]
            :field_id (mt/id :venues :name)}
           (-> (http/client :get 200 (field-values-url dashboard (mt/id :venues :name)))
               (update :values (partial take 5)))))))

(deftest shound-not-be-able-to-use-the-endpoint-with-a-field-not-referenced-by-the-dashboard
  (with-sharing-enabled-and-temp-dashcard-referencing :venues :name [dashboard]
    (is (= "An error occurred."
           (http/client :get 400 (field-values-url dashboard (mt/id :venues :price)))))))

(deftest endpoint-should-fail-if-public-sharing-is-disabled
  (with-sharing-enabled-and-temp-dashcard-referencing :venues :name [dashboard]
    (mt/with-temporary-setting-values [enable-public-sharing false]
      (is (= "An error occurred."
             (http/client :get 400 (field-values-url dashboard (mt/id :venues :name))))))))


;;; ----------------------------------------------- search-card-fields -----------------------------------------------

(deftest search-card-fields
  (with-sharing-enabled-and-temp-card-referencing :venues :id [card]
    (is (= [[93 "33 Taps"]]
           (public-api/search-card-fields (u/get-id card) (mt/id :venues :id) (mt/id :venues :name) "33 T" 10)))))

(deftest shouldn-t-work-if-the-search-field-isn-t-allowed-to-be-used-in-combination-with-the-other-field
  (with-sharing-enabled-and-temp-card-referencing :venues :id [card]
    (is (thrown?
         Exception
         (public-api/search-card-fields (u/get-id card) (mt/id :venues :id) (mt/id :venues :price) "33 T" 10)))))

(deftest shouldn-t-work-if-the-field-isn-t-referenced-by-card
  (with-sharing-enabled-and-temp-card-referencing :venues :name [card]
    (is (thrown?
         Exception
         (public-api/search-card-fields (u/get-id card) (mt/id :venues :id) (mt/id :venues :id) "33 T" 10)))))


;;; ----------------------- GET /api/public/card/:uuid/field/:field-id/search/:search-field-id -----------------------

(defn- field-search-url [card-or-dashboard field-or-id search-field-or-id]
  (str "public/"
       (condp instance? card-or-dashboard
         (class Card)      "card"
         (class Dashboard) "dashboard")
       "/" (:public_uuid card-or-dashboard)
       "/field/" (u/get-id field-or-id)
       "/search/" (u/get-id search-field-or-id)))

(deftest field-search-with-venue
  (is (= [[93 "33 Taps"]]
         (with-sharing-enabled-and-temp-card-referencing :venues :id [card]
           (http/client :get 200 (field-search-url card (mt/id :venues :id) (mt/id :venues :name))
                        :value "33 T")))))

(deftest if-search-field-isn-t-allowed-to-be-used-with-the-other-field-endpoint-should-return-exception
  (is (= "An error occurred."
         (with-sharing-enabled-and-temp-card-referencing :venues :id [card]
           (http/client :get 400 (field-search-url card (mt/id :venues :id) (mt/id :venues :price))
                        :value "33 T")))))

(deftest search-endpoint-should-fail-if-public-sharing-is-disabled
  (is (= "An error occurred."
         (with-sharing-enabled-and-temp-card-referencing :venues :id [card]
           (mt/with-temporary-setting-values [enable-public-sharing false]
             (http/client :get 400 (field-search-url card (mt/id :venues :id) (mt/id :venues :name))
                          :value "33 T"))))))


;;; -------------------- GET /api/public/dashboard/:uuid/field/:field-id/search/:search-field-id ---------------------

(deftest dashboard
  (with-sharing-enabled-and-temp-dashcard-referencing :venues :id [dashboard]
    (is (= [[93 "33 Taps"]]
           (http/client :get (field-search-url dashboard (mt/id :venues :id) (mt/id :venues :name))
                        :value "33 T")))))

(deftest dashboard-if-search-field-isn-t-allowed-to-be-used-with-the-other-field-endpoint-should-return-exception
  (with-sharing-enabled-and-temp-dashcard-referencing :venues :id [dashboard]
    (is (= "An error occurred."
           (http/client :get 400 (field-search-url dashboard (mt/id :venues :id) (mt/id :venues :price))
                        :value "33 T")))))

(deftest dashboard-endpoint-should-fail-if-public-sharing-is-disabled
  (with-sharing-enabled-and-temp-dashcard-referencing :venues :id [dashboard]
    (mt/with-temporary-setting-values [enable-public-sharing false]
      (is (= "An error occurred."
             (http/client :get 400 (field-search-url dashboard (mt/id :venues :name) (mt/id :venues :name))
                          :value "33 T"))))))

;;; --------------------------------------------- field-remapped-values ----------------------------------------------

;; `field-remapped-values` should return remappings in the expected format when the combination of Fields is allowed.
;; It should parse the value string (it comes back from the API as a string since it is a query param)

(deftest should-parse-string
  (is (= [10 "Fred 62"]
         (#'public-api/field-remapped-values (mt/id :venues :id) (mt/id :venues :name) "10"))))

(deftest if-the-field-isn-t-allowed
  (is (thrown?
       Exception
       (#'public-api/field-remapped-values (mt/id :venues :id) (mt/id :venues :price) "10"))))

;;; ----------------------- GET /api/public/card/:uuid/field/:field-id/remapping/:remapped-id ------------------------

(defn- field-remapping-url [card-or-dashboard field-or-id remapped-field-or-id]
  (str "public/"
       (condp instance? card-or-dashboard
         (class Card)      "card"
         (class Dashboard) "dashboard")
       "/" (:public_uuid card-or-dashboard)
       "/field/" (u/get-id field-or-id)
       "/remapping/" (u/get-id remapped-field-or-id)))


(deftest we-should-be-able-to-use-the-api-endpoint-and-get-the-same-results-we-get-by-calling-the-function-above-directly
  (with-sharing-enabled-and-temp-card-referencing :venues :id [card]
    (is (= [10 "Fred 62"]
           (http/client :get 200 (field-remapping-url card (mt/id :venues :id) (mt/id :venues :name))
                        :value "10")))))

(deftest shouldn-t-work-if-card-doesn-t-reference-the-field-in-question
  (with-sharing-enabled-and-temp-card-referencing :venues :price [card]
    (is (= "An error occurred."
           (http/client :get 400 (field-remapping-url card (mt/id :venues :id) (mt/id :venues :name))
                        :value "10")))))


(deftest ---or-if-the-remapping-field-isn-t-allowed-to-be-used-with-the-other-field
  (with-sharing-enabled-and-temp-card-referencing :venues :id [card]
    (is (= "An error occurred."
           (http/client :get 400 (field-remapping-url card (mt/id :venues :id) (mt/id :venues :price))
                        :value "10")))))

(deftest ---or-if-public-sharing-is-disabled
  (with-sharing-enabled-and-temp-card-referencing :venues :id [card]
    (mt/with-temporary-setting-values [enable-public-sharing false]
      (is (= "An error occurred."
             (http/client :get 400 (field-remapping-url card (mt/id :venues :id) (mt/id :venues :name))
                          :value "10"))))))

;;; --------------------- GET /api/public/dashboard/:uuid/field/:field-id/remapping/:remapped-id ---------------------


(deftest api-endpoint-should-return-same-results-as-function
  (is (= [10 "Fred 62"]
         (with-sharing-enabled-and-temp-dashcard-referencing :venues :id [dashboard]
           (http/client :get 200 (field-remapping-url dashboard (mt/id :venues :id) (mt/id :venues :name))
                        :value "10")))))

(deftest field-remapping-shouldn-t-work-if-card-doesn-t-reference-the-field-in-question
  (is (= "An error occurred."
         (with-sharing-enabled-and-temp-dashcard-referencing :venues :price [dashboard]
           (http/client :get 400 (field-remapping-url dashboard (mt/id :venues :id) (mt/id :venues :name))
                        :value "10")))))

(deftest remapping-or-if-the-remapping-field-isn-t-allowed-to-be-used-with-the-other-field
  (is (= "An error occurred."
         (with-sharing-enabled-and-temp-dashcard-referencing :venues :id [dashboard]
           (http/client :get 400 (field-remapping-url dashboard (mt/id :venues :id) (mt/id :venues :price))
                        :value "10")))))

(deftest remapping-or-if-public-sharing-is-disabled
  (is (= "An error occurred."
         (with-sharing-enabled-and-temp-dashcard-referencing :venues :id [dashboard]
           (mt/with-temporary-setting-values [enable-public-sharing false]
             (http/client :get 400 (field-remapping-url dashboard (mt/id :venues :id) (mt/id :venues :name))
                          :value "10"))))))
