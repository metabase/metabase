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
             [query-processor-test :as qp.test]
             [test :as mt]
             [util :as u]]
            [metabase.api.public :as public-api]
            [metabase.models
             [permissions :as perms]
             [permissions-group :as group]]
            [metabase.test
             [data :as data]
             [util :as tu]]
            [metabase.test.data.users :as test-users]
            [toucan.db :as db]
            [toucan.util.test :as tt])
  (:import java.io.ByteArrayInputStream
           java.util.UUID))

;;; --------------------------------------------------- Helper Fns ---------------------------------------------------

(defn count-of-venues-card []
  {:dataset_query (mt/mbql-query venues
                    {:aggregation [[:count]]})})

(defn- shared-obj []
  {:public_uuid       (str (UUID/randomUUID))
   :made_public_by_id (test-users/user->id :crowberto)})

(defmacro ^:private with-temp-public-card {:style/indent 1} [[binding & [card]] & body]
  `(let [card-settings# (merge (count-of-venues-card) (shared-obj) ~card)]
     (tt/with-temp Card [card# card-settings#]
       ;; add :public_uuid back in to the value that gets bound because it might not come back from post-select if
       ;; public sharing is disabled; but we still want to test it
       (let [~binding (assoc card# :public_uuid (:public_uuid card-settings#))]
         ~@body))))

(defmacro ^:private with-temp-public-dashboard {:style/indent 1} [[binding & [dashboard]] & body]
  `(let [dashboard-settings# (merge
                              {:parameters [{:name    "Venue ID"
                                             :slug    "venue_id"
                                             :type    "id"
                                             :target  [:dimension (data/id :venues :id)]
                                             :default nil}]}
                              (shared-obj)
                              ~dashboard)]
     (tt/with-temp Dashboard [dashboard# dashboard-settings#]
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
  (tu/with-temporary-setting-values [enable-public-sharing false]
    (with-temp-public-card [{uuid :public_uuid}]
      (is (= "An error occurred."
             (http/client :get 400 (str "public/card/" uuid)))))))


(deftest check-that-we-get-a-400-if-the-publiccard-doesn-t-exist
  (tu/with-temporary-setting-values [enable-public-sharing true]
    (is (= "An error occurred."
           (http/client :get 400 (str "public/card/" (UUID/randomUUID)))))))

(deftest check-that-we--cannot--fetch-a-publiccard-if-the-card-has-been-archived
  (tu/with-temporary-setting-values [enable-public-sharing true]
    (with-temp-public-card [{uuid :public_uuid} {:archived true}]
      (is (= "An error occurred."
             (http/client :get 400 (str "public/card/" uuid)))))))


(deftest check-that-we-can-fetch-a-publiccard
  (tu/with-temporary-setting-values [enable-public-sharing true]
    (with-temp-public-card [{uuid :public_uuid}]
      (is (= #{:dataset_query :description :display :id :name :visualization_settings :param_values :param_fields}
             (set (keys (http/client :get 200 (str "public/card/" uuid)))))))))



(deftest make-sure--param-values-get-returned-as-expected
  (tt/with-temp Card [card {:dataset_query
                            {:database (data/id)
                             :type     :native
                             :native   {:query         (str "SELECT COUNT(*) "
                                                            "FROM venues "
                                                            "LEFT JOIN categories ON venues.category_id = categories.id "
                                                            "WHERE {{category}}")
                                        :collection    "CATEGORIES"
                                        :template-tags {:category {:name         "category"
                                                                   :display-name "Category"
                                                                   :type         "dimension"
                                                                   :dimension    ["field-id" (data/id :categories :name)]
                                                                   :widget-type  "category"
                                                                   :required     true}}}}}]
    (is (= {(data/id :categories :name) {:values                75
                                         :human_readable_values {}
                                         :field_id              (data/id :categories :name)}}
           (-> (:param_values (#'public-api/public-card :id (u/get-id card)))
               (update-in [(data/id :categories :name) :values] count)
               (update (data/id :categories :name) #(into {} %)))))))



;;; ------------------------- GET /api/public/card/:uuid/query (and JSON/CSV/XSLX versions) --------------------------


(deftest check-that-we--cannot--execute-a-publiccard-if-the-setting-is-disabled
  (is (= "An error occurred."
         (tu/with-temporary-setting-values [enable-public-sharing false]
           (with-temp-public-card [{uuid :public_uuid}]
             (http/client :get 400 (str "public/card/" uuid "/query")))))))

(deftest check-that-we-get-a-400-if-the-publiccard-doesn-t-exist
  (is (= "An error occurred."
         (tu/with-temporary-setting-values [enable-public-sharing true]
           (http/client :get 400 (str "public/card/" (UUID/randomUUID) "/query"))))))

(deftest check-that-we--cannot--execute-a-publiccard-if-the-card-has-been-archived
  (is (= "An error occurred."
         (tu/with-temporary-setting-values [enable-public-sharing true]
           (with-temp-public-card [{uuid :public_uuid} {:archived true}]
             (http/client :get 400 (str "public/card/" uuid "/query")))))))

(defn- parse-xlsx-response [response]
  (->> (ByteArrayInputStream. response)
       spreadsheet/load-workbook
       (spreadsheet/select-sheet "Query result")
       (spreadsheet/select-columns {:A :col})))

(deftest execute-public-card-test
  (testing "GET /api/public/card/:uuid/query"
    (tu/with-temporary-setting-values [enable-public-sharing true]
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
      (tt/with-temp Collection [{collection-id :id}]
        (perms/revoke-collection-permissions! (group/all-users) collection-id)
        (with-temp-public-card [{card-id :id, uuid :public_uuid} {:collection_id collection-id}]
          (is (= "You don't have permissions to do that."
                 ((mt/user->client :rasta) :post 403 (format "card/%d/query" card-id)))
              "Sanity check: shouldn't be allowed to run the query normally")
          (is (= [[100]]
                 (mt/rows
                   ((mt/user->client :rasta) :get 202 (str "public/card/" uuid "/query"))))))))))

(deftest check-that-we-can-exec-a-publiccard-with---parameters-
  (is (= [{:name "Venue ID", :slug "venue_id", :type "id", :value 2}]
         (tu/with-temporary-setting-values [enable-public-sharing true]
           (with-temp-public-card [{uuid :public_uuid}]
             (get-in (http/client :get 202 (str "public/card/" uuid "/query")
                                  :parameters (json/encode [{:name "Venue ID", :slug "venue_id", :type "id", :value 2}]))
                     [:json_query :parameters]))))))

;; Cards with required params
(defn- do-with-required-param-card [f]
  (tu/with-temporary-setting-values [enable-public-sharing true]
    (with-temp-public-card [{uuid :public_uuid}
                            {:dataset_query
                             {:database (data/id)
                              :type     :native
                              :native   {:query         "SELECT count(*) FROM venues v WHERE price = {{price}}"
                                         :template-tags {"price" {:name         "price"
                                                                  :display-name "Price"
                                                                  :type         :number
                                                                  :required     true}}}}}]
      (f uuid))))


(deftest should-be-able-to-run-a-card-with-a-required-param
  (is (= [[22]]
         (do-with-required-param-card
          (fn [uuid]
            (qp.test/rows
             (http/client :get 202 (str "public/card/" uuid "/query")
                          :parameters (json/encode [{:type   "category"
                                                     :target [:variable [:template-tag "price"]]
                                                     :value  1}]))))))))

(deftest missing-required-param-error-message-test
  (testing (str "If you're missing a required param, the error message should get passed thru, rather than the normal "
                "generic 'Query Failed' message that we show for most embedding errors")
    (is (= {:status     "failed"
            :error      "You'll need to pick a value for 'Price' before this query can run."
            :error_type "missing-required-parameter"}
           (do-with-required-param-card
            (fn [uuid]
              (http/client :get 202 (str "public/card/" uuid "/query"))))))))



(defn- card-with-date-field-filter []
  (assoc (shared-obj)
         :dataset_query {:database (data/id)
                         :type     :native
                         :native   {:query         "SELECT COUNT(*) AS \"count\" FROM CHECKINS WHERE {{date}}"
                                    :template-tags {:date {:name         "date"
                                                           :display-name "Date"
                                                           :type         "dimension"
                                                           :dimension    [:field-id (data/id :checkins :date)]
                                                           :widget-type  "date/quarter-year"}}}}))


(deftest make-sure-csv--etc---downloads-take-editable-params-into-account---6407----
  (is (= "count\n107\n"
         (tu/with-temporary-setting-values [enable-public-sharing true]
           (tt/with-temp Card [{uuid :public_uuid} (card-with-date-field-filter)]
             (http/client :get 202 (str "public/card/" uuid "/query/csv")
                          :parameters (json/encode [{:type   :date/quarter-year
                                                     :target [:dimension [:template-tag :date]]
                                                     :value  "Q1-2014"}])))))))


(deftest make-sure-it-also-works-with-the-forwarded-url
  (is (= "count\n107\n"
         (tu/with-temporary-setting-values [enable-public-sharing true]
           (tt/with-temp Card [{uuid :public_uuid} (card-with-date-field-filter)]
             ;; make sure the URL doesn't include /api/ at the beginning like it normally would
             (binding [http/*url-prefix* (str/replace http/*url-prefix* #"/api/$" "/")]
               (tu/with-temporary-setting-values [site-url http/*url-prefix*]
                 (http/client :get 202 (str "public/question/" uuid ".csv")
                              :parameters (json/encode [{:type   :date/quarter-year
                                                         :target [:dimension [:template-tag :date]]
                                                         :value  "Q1-2014"}])))))))))

(defn- card-with-trendline []
  (assoc (shared-obj)
         :dataset_query {:database (data/id)
                         :type     :query
                         :query   {:source-table (data/id :checkins)
                                   :breakout     [[:datetime-field [:field-id (data/id :checkins :date)]  :month]]
                                   :aggregation  [[:count]]}}))

(deftest make-sure-we-include-all-the-relevant-fields-like-insights
  (is (= #{:cols :rows :insights :results_timezone}
         (tu/with-temporary-setting-values [enable-public-sharing true]
           (tt/with-temp Card [{uuid :public_uuid} (card-with-trendline)]
             (-> (http/client :get 202 (str "public/card/" uuid "/query"))
                 :data
                 keys
                 set))))))


;;; ---------------------------------------- GET /api/public/dashboard/:uuid -----------------------------------------

(deftest check-that-we--cannot--fetch-publicdashboard-if-setting-is-disabled
  (is (= "An error occurred."
         (tu/with-temporary-setting-values [enable-public-sharing false]
           (with-temp-public-dashboard [{uuid :public_uuid}]
             (http/client :get 400 (str "public/dashboard/" uuid)))))))

(deftest check-that-we-get-a-400-if-the-publicdashboard-doesn-t-exis
  (is (= "An error occurred."
         (tu/with-temporary-setting-values [enable-public-sharing true]
           (http/client :get 400 (str "public/dashboard/" (UUID/randomUUID)))))))

(defn- fetch-public-dashboard [{uuid :public_uuid}]
  (-> (http/client :get 200 (str "public/dashboard/" uuid))
      (select-keys [:name :ordered_cards])
      (update :name boolean)
      (update :ordered_cards count)))


(deftest check-that-we-can-fetch-a-publicdashboard
  (is (= {:name true, :ordered_cards 1}
         (tu/with-temporary-setting-values [enable-public-sharing true]
           (with-temp-public-dashboard-and-card [dash card]
             (fetch-public-dashboard dash))))))

(deftest check-that-we-don-t-see-cards-that-have-been-archived
  (is (= {:name true, :ordered_cards 0}
         (tu/with-temporary-setting-values [enable-public-sharing true]
           (with-temp-public-dashboard-and-card [dash card]
             (db/update! Card (u/get-id card), :archived true)
             (fetch-public-dashboard dash))))))

;;; --------------------------------- GET /api/public/dashboard/:uuid/card/:card-id ----------------------------------

(defn- dashcard-url
  "URL for fetching results of a public DashCard."
  [dash card]
  (str "public/dashboard/" (:public_uuid dash) "/card/" (u/get-id card)))

(deftest check-that-we--cannot--exec-publiccard-via-publicdashboard-if-setting-is-disabled
  (is (= "An error occurred."
         (tu/with-temporary-setting-values [enable-public-sharing false]
           (with-temp-public-dashboard-and-card [dash card]
             (http/client :get 400 (dashcard-url dash card)))))))

(deftest check-that-we-get-a-400-if-publicdashboard-doesn-t-exist
  (is (= "An error occurred."
         (tu/with-temporary-setting-values [enable-public-sharing true]
           (with-temp-public-dashboard-and-card [_ card]
             (http/client :get 400 (dashcard-url {:public_uuid (UUID/randomUUID)} card)))))))

(deftest check-that-we-get-a-400-if-publiccard-doesn-t-exist
  (is (= "An error occurred."
         (tu/with-temporary-setting-values [enable-public-sharing true]
           (with-temp-public-dashboard-and-card [dash _]
             (http/client :get 400 (dashcard-url dash Integer/MAX_VALUE)))))))

(deftest check-that-we-get-a-400-if-the-card-does-exist-but-it-s-not-part-of-this-dashboard
  (is (= "An error occurred."
         (tu/with-temporary-setting-values [enable-public-sharing true]
           (with-temp-public-dashboard-and-card [dash _]
             (tt/with-temp Card [card]
               (http/client :get 400 (dashcard-url dash card))))))))

(deftest check-that-we--cannot--execute-a-publiccard-via-a-publicdashboard-if-the-card-has-been-archived
  (is (= "An error occurred."
         (tu/with-temporary-setting-values [enable-public-sharing true]
           (with-temp-public-dashboard-and-card [dash card]
             (db/update! Card (u/get-id card), :archived true)
             (http/client :get 400 (dashcard-url dash card)))))))

(deftest check-that-we-can-exec-a-publiccard-via-a-publicdashboard
  (is (= [[100]]
         (tu/with-temporary-setting-values [enable-public-sharing true]
           (with-temp-public-dashboard-and-card [dash card]
             (qp.test/rows (http/client :get 202 (dashcard-url dash card))))))))

(deftest check-that-we-can-exec-a-publiccard-via-a-publicdashboard-with---parameters-
  (is (= [{:name    "Venue ID"
           :slug    "venue_id"
           :target  ["dimension" (data/id :venues :id)]
           :value   [10]
           :default nil
           :type    "id"}]
         (tu/with-temporary-setting-values [enable-public-sharing true]
           (with-temp-public-dashboard-and-card [dash card]
             (get-in (http/client :get 202 (dashcard-url dash card)
                                  :parameters (json/encode [{:name   "Venue ID"
                                                             :slug   :venue_id
                                                             :target [:dimension (data/id :venues :id)]
                                                             :value  [10]}]))
                     [:json_query :parameters]))))))

(deftest execute-public-dashcard-as-user-without-perms-test
  (testing "A user that doesn't have permissions to run the query normally should still be able to run a public DashCard"
    (mt/with-temporary-setting-values [enable-public-sharing true]
      (tt/with-temp Collection [{collection-id :id}]
        (perms/revoke-collection-permissions! (group/all-users) collection-id)
        (with-temp-public-dashboard-and-card [dash {card-id :id, :as card}]
          (db/update! Card card-id :collection_id collection-id)
          (is (= "You don't have permissions to do that."
                 ((mt/user->client :rasta) :post 403 (format "card/%d/query" card-id)))
              "Sanity check: shouldn't be allowed to run the query normally")
          (is (= [[100]]
                 (mt/rows
                   ((mt/user->client :rasta) :get 202 (dashcard-url dash card))))))))))


;; Make sure params are validated: this should pass because venue_id *is* one of the Dashboard's :parameters
(deftest params-are-validated
  (is (= [[1]]
         (tu/with-temporary-setting-values [enable-public-sharing true]
           (with-temp-public-dashboard-and-card [dash card]
             (-> (http/client :get 202 (dashcard-url dash card)
                              :parameters (json/encode [{:name   "Venue ID"
                                                         :slug   :venue_id
                                                         :target [:dimension (data/id :venues :id)]
                                                         :value  [10]}]))
                 qp.test/rows))))))

(deftest make-sure-params-are-validated--this-should-fail-because-venue-name-is--not--one-of-the-dashboard-s--parameters
  (is (= "An error occurred."
         (tu/with-temporary-setting-values [enable-public-sharing true]
           (with-temp-public-dashboard-and-card [dash card]
             (http/client :get 400 (dashcard-url dash card)
                          :parameters (json/encode [{:name   "Venue Name"
                                                     :slug   :venue_name
                                                     :target [:dimension (data/id :venues :name)]
                                                     :value  ["PizzaHacker"]}])))))))

(deftest check-that-an-additional-card-series-works-as-well
  (is (= [[100]]
         (tu/with-temporary-setting-values [enable-public-sharing true]
           (with-temp-public-dashboard-and-card [dash card]
             (with-temp-public-card [card-2]
               (tt/with-temp DashboardCardSeries [_ {:dashboardcard_id (db/select-one-id DashboardCard
                                                                                         :card_id      (u/get-id card)
                                                                                         :dashboard_id (u/get-id dash))
                                                     :card_id          (u/get-id card-2)}]
                 (qp.test/rows (http/client :get 202 (dashcard-url dash card-2))))))))))



(deftest make-sure-that-parameters-actually-work-correctly---7212-
  (is (= [[50]]
         (tu/with-temporary-setting-values [enable-public-sharing true]
           (tt/with-temp Card [card {:dataset_query {:database (data/id)
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
               (-> ((test-users/user->client :crowberto)
                    :get (str (dashcard-url dash card)
                              "?parameters="
                              (json/generate-string
                               [{:type   :category
                                 :target [:variable [:template-tag :num]]
                                 :value  "50"}])))
                   qp.test/rows)))))))

(deftest ---with-mbql-cards-as-well---
  (is (= [[1]]
         (tu/with-temporary-setting-values [enable-public-sharing true]
           (tt/with-temp Card [card {:dataset_query {:database (data/id)
                                                     :type     :query
                                                     :query    {:source-table (data/id :venues)
                                                                :aggregation  [:count]}}}]
             (with-temp-public-dashboard [dash {:parameters [{:name "Venue ID"
                                                              :slug "venue_id"
                                                              :id   "22486e00"
                                                              :type "id"}]}]
               (add-card-to-dashboard! card dash
                                       :parameter_mappings [{:parameter_id "22486e00"
                                                             :card_id      (u/get-id card)
                                                             :target       [:dimension
                                                                            [:field-id
                                                                             (data/id :venues :id)]]}])
               (-> ((test-users/user->client :crowberto)
                    :get (str (dashcard-url dash card)
                              "?parameters="
                              (json/generate-string
                               [{:type   :id
                                 :target [:dimension [:field-id (data/id :venues :id)]]
                                 :value  "50"}])))
                   qp.test/rows)))))))


(deftest ---and-also-for-datetime-params
  (is (= [[733]]
         (tu/with-temporary-setting-values [enable-public-sharing true]
           (tt/with-temp Card [card {:dataset_query {:database (data/id)
                                                     :type     :query
                                                     :query    {:source-table (data/id :checkins)
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
                                                                             (data/id :checkins :date)]]}])
               (-> ((test-users/user->client :crowberto)
                    :get (str (dashcard-url dash card)
                              "?parameters="
                              (json/generate-string
                               [{:type   "date/all-options"
                                 :target [:dimension [:field-id (data/id :checkins :date)]]
                                 :value  "~2015-01-01"}])))
                   qp.test/rows)))))))


;; make sure DimensionValue params also work if they have a default value, even if some is passed in for some reason
;; as part of the query (#7253)
;; If passed in as part of the query however make sure it doesn't override what's actually in the DB


(deftest dimensionvalue-params-work
  (is (= [["Wow"]]
         (tu/with-temporary-setting-values [enable-public-sharing true]
           (tt/with-temp Card [card {:dataset_query {:database (data/id)
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
               (-> ((test-users/user->client :crowberto)
                    :get (str (dashcard-url dash card)
                              "?parameters="
                              (json/generate-string
                               [{:type    :category
                                 :target  [:variable [:template-tag :msg]]
                                 :value   nil
                                 :default "Hello"}])))
                   qp.test/rows)))))))

;;; --------------------------- Check that parameter information comes back with Dashboard ---------------------------

(deftest double-check-that-the-field-has-fieldvalues
  (is (= [1 2 3 4]
         (db/select-one-field :values FieldValues :field_id (data/id :venues :price)))))

(defn- price-param-values []
  {(keyword (str (data/id :venues :price))) {:values                [1 2 3 4]
                                             :human_readable_values {}
                                             :field_id              (data/id :venues :price)}})

(defn- add-price-param-to-dashboard! [dashboard]
  (db/update! Dashboard (u/get-id dashboard) :parameters [{:name "Price", :type "category", :slug "price"}]))

(defn- add-dimension-param-mapping-to-dashcard! [dashcard card dimension]
  (db/update! DashboardCard (u/get-id dashcard) :parameter_mappings [{:card_id (u/get-id card)
                                                                      :target  ["dimension" dimension]}]))

(defn- GET-param-values [dashboard]
  (tu/with-temporary-setting-values [enable-public-sharing true]
    (:param_values (http/client :get 200 (str "public/dashboard/" (:public_uuid dashboard))))))

(deftest check-that-param-info-comes-back-for-sql-cards
  (is (= (price-param-values)
         (with-temp-public-dashboard-and-card [dash card dashcard]
           (db/update! Card (u/get-id card)
                       :dataset_query {:database (data/id)
                                       :type     :native
                                       :native   {:template-tags {:price {:name         "price"
                                                                          :display-name "Price"
                                                                          :type         "dimension"
                                                                          :dimension    ["field-id" (data/id :venues :price)]}}}})
           (add-price-param-to-dashboard! dash)
           (add-dimension-param-mapping-to-dashcard! dashcard card ["template-tag" "price"])
           (GET-param-values dash)))))

(deftest check-that-param-info-comes-back-for-mbql-cards--field-id-
  (is (= (price-param-values)
         (with-temp-public-dashboard-and-card [dash card dashcard]
           (add-price-param-to-dashboard! dash)
           (add-dimension-param-mapping-to-dashcard! dashcard card ["field-id" (data/id :venues :price)])
           (GET-param-values dash)))))

(deftest check-that-param-info-comes-back-for-mbql-cards--fk---
  (is (= (price-param-values)
         (with-temp-public-dashboard-and-card [dash card dashcard]
           (add-price-param-to-dashboard! dash)
           (add-dimension-param-mapping-to-dashcard! dashcard card ["fk->" (data/id :checkins :venue_id) (data/id :venues :price)])
           (GET-param-values dash)))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                        New FieldValues search endpoints                                        |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- mbql-card-referencing-nothing []
  {:dataset_query {:database (data/id)
                   :type     :query
                   :query    {:source-table (data/id :venues)}}})

(defn mbql-card-referencing [table-kw field-kw]
  {:dataset_query
   {:database (data/id)
    :type     :query
    :query    {:source-table (data/id table-kw)
               :filter       [:= [:field-id (data/id table-kw field-kw)] "Krua Siri"]}}})

(defn- mbql-card-referencing-venue-name []
  (mbql-card-referencing :venues :name))

(defn- sql-card-referencing-venue-name []
  {:dataset_query
   {:database (data/id)
    :type     :native
    :native   {:query         "SELECT COUNT(*) FROM VENUES WHERE {{x}}"
               :template-tags {:x {:name         :x
                                   :display-name "X"
                                   :type         :dimension
                                   :dimension    [:field-id (data/id :venues :name)]}}}}})


;;; ------------------------------------------- card->referenced-field-ids -------------------------------------------

(deftest card-referencing-nothing
  (is (= #{}
         (tt/with-temp Card [card (mbql-card-referencing-nothing)]
           (#'public-api/card->referenced-field-ids card)))))

(deftest it-should-pick-up-on-fields-referenced-in-the-mbql-query-itself
  (is (= #{(data/id :venues :name)}
         (tt/with-temp Card [card (mbql-card-referencing-venue-name)]
           (#'public-api/card->referenced-field-ids card)))))

(deftest ---as-well-as-template-tag--implict--params-for-sql-queries
  (is (= #{(data/id :venues :name)}
         (tt/with-temp Card [card (sql-card-referencing-venue-name)]
           (#'public-api/card->referenced-field-ids card)))))

;;; --------------------------------------- check-field-is-referenced-by-card ----------------------------------------


(deftest check-that-the-check-succeeds-when-field-is-referenced
  (tt/with-temp Card [card (mbql-card-referencing-venue-name)]
    (#'public-api/check-field-is-referenced-by-card (data/id :venues :name) (u/get-id card))))


(deftest check-that-exception-is-thrown-if-the-field-isn-t-referenced
  (is (thrown? Exception
               (tt/with-temp Card [card (mbql-card-referencing-venue-name)]
                 (#'public-api/check-field-is-referenced-by-card (data/id :venues :category_id) (u/get-id card))))))


;;; ----------------------------------------- check-search-field-is-allowed ------------------------------------------

;; search field is allowed IF:
;; A) search-field is the same field as the other one
(deftest search-field-allowed-if-same-field-as-other-one
  (#'public-api/check-search-field-is-allowed (data/id :venues :id) (data/id :venues :id))
  (is (thrown? Exception
               (#'public-api/check-search-field-is-allowed (data/id :venues :id) (data/id :venues :category_id)))))

;; B) there's a Dimension that lists search field as the human_readable_field for the other field
(deftest search-field-allowed-with-dimension
  (is (tt/with-temp Dimension [_ {:field_id (data/id :venues :id), :human_readable_field_id (data/id :venues :category_id)}]
        (#'public-api/check-search-field-is-allowed (data/id :venues :id) (data/id :venues :category_id)))))

;; C) search-field is a Name Field belonging to the same table as the other field, which is a PK
(deftest search-field-allowed-with-name-field
  (is (#'public-api/check-search-field-is-allowed (data/id :venues :id) (data/id :venues :name))))

;; not allowed if search field isn't a NAME
(deftest search-field-not-allowed-if-search-field-isnt-a-name
  (is (thrown? Exception
               (tu/with-temp-vals-in-db Field (data/id :venues :name) {:special_type "type/Latitude"}
                 (#'public-api/check-search-field-is-allowed (data/id :venues :id) (data/id :venues :name))))))


(deftest not-allowed-if-search-field-belongs-to-a-different-table
  (is (thrown? Exception
               (tu/with-temp-vals-in-db Field (data/id :categories :name) {:special_type "type/Name"}
                 (#'public-api/check-search-field-is-allowed (data/id :venues :id) (data/id :categories :name))))))



;;; ------------------------------------- check-field-is-referenced-by-dashboard -------------------------------------

(defn- dashcard-with-param-mapping-to-venue-id [dashboard card]
  {:dashboard_id       (u/get-id dashboard)
   :card_id            (u/get-id card)
   :parameter_mappings [{:card_id (u/get-id card)
                         :target  [:dimension [:field-id (data/id :venues :id)]]}]})


(deftest field-is--referenced--by-dashboard-if-it-s-one-of-the-dashboard-s-params---
  (is (tt/with-temp* [Dashboard     [dashboard]
                      Card          [card]
                      DashboardCard [_ (dashcard-with-param-mapping-to-venue-id dashboard card)]]
        (#'public-api/check-field-is-referenced-by-dashboard (data/id :venues :id) (u/get-id dashboard)))))


(deftest TODO-name-this-exception
  (is (thrown? Exception
               (tt/with-temp* [Dashboard     [dashboard]
                               Card          [card]
                               DashboardCard [_ (dashcard-with-param-mapping-to-venue-id dashboard card)]]
                 (#'public-api/check-field-is-referenced-by-dashboard (data/id :venues :name) (u/get-id dashboard))))))

;; ...*or* if it's a so-called "implicit" param (a Field Filter Template Tag (FFTT) in a SQL Card)
(deftest implicit-param
  (is (tt/with-temp* [Dashboard     [dashboard]
                      Card          [card (sql-card-referencing-venue-name)]
                      DashboardCard [_ {:dashboard_id (u/get-id dashboard), :card_id (u/get-id card)}]]
        (#'public-api/check-field-is-referenced-by-dashboard (data/id :venues :name) (u/get-id dashboard))))

  (is (thrown? Exception
               (tt/with-temp* [Dashboard     [dashboard]
                               Card          [card (sql-card-referencing-venue-name)]
                               DashboardCard [_ {:dashboard_id (u/get-id dashboard), :card_id (u/get-id card)}]]
                 (#'public-api/check-field-is-referenced-by-dashboard (data/id :venues :id) (u/get-id dashboard))))))

;;; ------------------------------------------- card-and-field-id->values --------------------------------------------

(deftest we-should-be-able-to-get-values-for-a-field-referenced-by-a-card
  (is (= {:values   [["20th Century Cafe"]
                     ["25°"]
                     ["33 Taps"]
                     ["800 Degrees Neapolitan Pizzeria"]
                     ["BCD Tofu House"]]
          :field_id (data/id :venues :name)}
         (tt/with-temp Card [card (mbql-card-referencing :venues :name)]
           (into {} (-> (public-api/card-and-field-id->values (u/get-id card) (data/id :venues :name))
                        (update :values (partial take 5))))))))

(deftest sql-param-field-references-should-work-just-as-well-as-mbql-field-referenced
  (is (= {:values   [["20th Century Cafe"]
                     ["25°"]
                     ["33 Taps"]
                     ["800 Degrees Neapolitan Pizzeria"]
                     ["BCD Tofu House"]]
          :field_id (data/id :venues :name)}
         (tt/with-temp Card [card (sql-card-referencing-venue-name)]
           (into {} (-> (public-api/card-and-field-id->values (u/get-id card) (data/id :venues :name))
                        (update :values (partial take 5))))))))



(deftest but-if-the-field-is-not-referenced-we-should-get-an-exception
  (is (thrown? Exception
               (tt/with-temp Card [card (mbql-card-referencing :venues :price)]
                 (public-api/card-and-field-id->values (u/get-id card) (data/id :venues :name))))))



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
  (tu/with-temporary-setting-values [enable-public-sharing true]
    (tt/with-temp Card [card (merge (shared-obj) (mbql-card-referencing table-kw field-kw))]
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
          :field_id (data/id :venues :name)}
         (with-sharing-enabled-and-temp-card-referencing :venues :name [card]
           (-> (http/client :get 200 (field-values-url card (data/id :venues :name)))
               (update :values (partial take 5)))))))

(deftest but-for-fields-that-are-not-referenced-we-should-get-an-exception
  (is (= "An error occurred."
         (with-sharing-enabled-and-temp-card-referencing :venues :name [card]
           (http/client :get 400 (field-values-url card (data/id :venues :price)))))))

(deftest field-value-endpoint-should-fail-if-public-sharing-is-disabled
  (is (= "An error occurred."
         (with-sharing-enabled-and-temp-card-referencing :venues :name [card]
           (tu/with-temporary-setting-values [enable-public-sharing false]
             (http/client :get 400 (field-values-url card (data/id :venues :name))))))))

;;; ----------------------------- GET /api/public/dashboard/:uuid/field/:field-id/values -----------------------------

(defn do-with-sharing-enabled-and-temp-dashcard-referencing {:style/indent 2} [table-kw field-kw f]
  (tu/with-temporary-setting-values [enable-public-sharing true]
    (tt/with-temp* [Dashboard     [dashboard (shared-obj)]
                    Card          [card      (mbql-card-referencing table-kw field-kw)]
                    DashboardCard [dashcard  {:dashboard_id       (u/get-id dashboard)
                                              :card_id            (u/get-id card)
                                              :parameter_mappings [{:card_id (u/get-id card)
                                                                    :target  [:dimension
                                                                              [:field-id
                                                                               (data/id table-kw field-kw)]]}]}]]
      (f dashboard card dashcard))))

(defmacro with-sharing-enabled-and-temp-dashcard-referencing
  {:style/indent 3}
  [table-kw field-kw [dashboard-binding card-binding dashcard-binding] & body]
  `(do-with-sharing-enabled-and-temp-dashcard-referencing ~table-kw ~field-kw
     (fn [~(or dashboard-binding '_) ~(or card-binding '_) ~(or dashcard-binding '_)]
       ~@body)))

(deftest should-be-able-to-use-it-when-everything-is-g2g
  (is (= {:values   [["20th Century Cafe"]
                     ["25°"]
                     ["33 Taps"]
                     ["800 Degrees Neapolitan Pizzeria"]
                     ["BCD Tofu House"]]
          :field_id (data/id :venues :name)}
         (with-sharing-enabled-and-temp-dashcard-referencing :venues :name [dashboard]
           (-> (http/client :get 200 (field-values-url dashboard (data/id :venues :name)))
               (update :values (partial take 5)))))))

(deftest shound-not-be-able-to-use-the-endpoint-with-a-field-not-referenced-by-the-dashboard
  (is (= "An error occurred."
         (with-sharing-enabled-and-temp-dashcard-referencing :venues :name [dashboard]
           (http/client :get 400 (field-values-url dashboard (data/id :venues :price)))))))

(deftest endpoint-should-fail-if-public-sharing-is-disabled
  (is (= "An error occurred."
         (with-sharing-enabled-and-temp-dashcard-referencing :venues :name [dashboard]
           (tu/with-temporary-setting-values [enable-public-sharing false]
             (http/client :get 400 (field-values-url dashboard (data/id :venues :name))))))))



;;; ----------------------------------------------- search-card-fields -----------------------------------------------


(deftest search-card-fields
  (is (= [[93 "33 Taps"]]
         (with-sharing-enabled-and-temp-card-referencing :venues :id [card]
           (public-api/search-card-fields (u/get-id card) (data/id :venues :id) (data/id :venues :name) "33 T" 10)))))



(deftest shouldn-t-work-if-the-search-field-isn-t-allowed-to-be-used-in-combination-with-the-other-field
  (is (thrown? Exception
               (with-sharing-enabled-and-temp-card-referencing :venues :id [card]
                 (public-api/search-card-fields (u/get-id card) (data/id :venues :id) (data/id :venues :price) "33 T" 10)))))



(deftest shouldn-t-work-if-the-field-isn-t-referenced-by-card
  (is (thrown? Exception
               (with-sharing-enabled-and-temp-card-referencing :venues :name [card]
                 (public-api/search-card-fields (u/get-id card) (data/id :venues :id) (data/id :venues :id) "33 T" 10)))))



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
           (http/client :get 200 (field-search-url card (data/id :venues :id) (data/id :venues :name))
                        :value "33 T")))))

(deftest if-search-field-isn-t-allowed-to-be-used-with-the-other-field-endpoint-should-return-exception
  (is (= "An error occurred."
         (with-sharing-enabled-and-temp-card-referencing :venues :id [card]
           (http/client :get 400 (field-search-url card (data/id :venues :id) (data/id :venues :price))
                        :value "33 T")))))

(deftest search-endpoint-should-fail-if-public-sharing-is-disabled
  (is (= "An error occurred."
         (with-sharing-enabled-and-temp-card-referencing :venues :id [card]
           (tu/with-temporary-setting-values [enable-public-sharing false]
             (http/client :get 400 (field-search-url card (data/id :venues :id) (data/id :venues :name))
                          :value "33 T"))))))



;;; -------------------- GET /api/public/dashboard/:uuid/field/:field-id/search/:search-field-id ---------------------


(deftest dashboard
  (is (= [[93 "33 Taps"]]
         (with-sharing-enabled-and-temp-dashcard-referencing :venues :id [dashboard]
           (http/client :get (field-search-url dashboard (data/id :venues :id) (data/id :venues :name))
                        :value "33 T")))))

(deftest dashboard-if-search-field-isn-t-allowed-to-be-used-with-the-other-field-endpoint-should-return-exception
  (is (= "An error occurred."
         (with-sharing-enabled-and-temp-dashcard-referencing :venues :id [dashboard]
           (http/client :get 400 (field-search-url dashboard (data/id :venues :id) (data/id :venues :price))
                        :value "33 T")))))

(deftest dashboard-endpoint-should-fail-if-public-sharing-is-disabled
  (is (= "An error occurred."
         (with-sharing-enabled-and-temp-dashcard-referencing :venues :id [dashboard]
           (tu/with-temporary-setting-values [enable-public-sharing false]
             (http/client :get 400 (field-search-url dashboard (data/id :venues :name) (data/id :venues :name))
                          :value "33 T"))))))

;;; --------------------------------------------- field-remapped-values ----------------------------------------------

;; `field-remapped-values` should return remappings in the expected format when the combination of Fields is allowed.
;; It should parse the value string (it comes back from the API as a string since it is a query param)

(deftest should-parse-string
  (is (= [10 "Fred 62"]
         (#'public-api/field-remapped-values (data/id :venues :id) (data/id :venues :name) "10"))))

(deftest if-the-field-isn-t-allowed
  (is (thrown? Exception
               (#'public-api/field-remapped-values (data/id :venues :id) (data/id :venues :price) "10"))))

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
  (is (= [10 "Fred 62"]
         (with-sharing-enabled-and-temp-card-referencing :venues :id [card]
           (http/client :get 200 (field-remapping-url card (data/id :venues :id) (data/id :venues :name))
                        :value "10")))))

(deftest shouldn-t-work-if-card-doesn-t-reference-the-field-in-question
  (is (= "An error occurred."
         (with-sharing-enabled-and-temp-card-referencing :venues :price [card]
           (http/client :get 400 (field-remapping-url card (data/id :venues :id) (data/id :venues :name))
                        :value "10")))))


(deftest ---or-if-the-remapping-field-isn-t-allowed-to-be-used-with-the-other-field
  (is (= "An error occurred."
         (with-sharing-enabled-and-temp-card-referencing :venues :id [card]
           (http/client :get 400 (field-remapping-url card (data/id :venues :id) (data/id :venues :price))
                        :value "10")))))

(deftest ---or-if-public-sharing-is-disabled
  (is (= "An error occurred."
         (with-sharing-enabled-and-temp-card-referencing :venues :id [card]
           (tu/with-temporary-setting-values [enable-public-sharing false]
             (http/client :get 400 (field-remapping-url card (data/id :venues :id) (data/id :venues :name))
                          :value "10"))))))

;;; --------------------- GET /api/public/dashboard/:uuid/field/:field-id/remapping/:remapped-id ---------------------


(deftest api-endpoint-should-return-same-results-as-function
  (is (= [10 "Fred 62"]
         (with-sharing-enabled-and-temp-dashcard-referencing :venues :id [dashboard]
           (http/client :get 200 (field-remapping-url dashboard (data/id :venues :id) (data/id :venues :name))
                        :value "10")))))

(deftest field-remapping-shouldn-t-work-if-card-doesn-t-reference-the-field-in-question
  (is (= "An error occurred."
         (with-sharing-enabled-and-temp-dashcard-referencing :venues :price [dashboard]
           (http/client :get 400 (field-remapping-url dashboard (data/id :venues :id) (data/id :venues :name))
                        :value "10")))))

(deftest remapping-or-if-the-remapping-field-isn-t-allowed-to-be-used-with-the-other-field
  (is (= "An error occurred."
         (with-sharing-enabled-and-temp-dashcard-referencing :venues :id [dashboard]
           (http/client :get 400 (field-remapping-url dashboard (data/id :venues :id) (data/id :venues :price))
                        :value "10")))))

(deftest remapping-or-if-public-sharing-is-disabled
  (is (= "An error occurred."
         (with-sharing-enabled-and-temp-dashcard-referencing :venues :id [dashboard]
           (tu/with-temporary-setting-values [enable-public-sharing false]
             (http/client :get 400 (field-remapping-url dashboard (data/id :venues :id) (data/id :venues :name))
                          :value "10"))))))
