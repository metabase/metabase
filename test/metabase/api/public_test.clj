(ns metabase.api.public-test
  "Tests for `api/public/` (public links) endpoints."
  (:require [cheshire.core :as json]
            [dk.ative.docjure.spreadsheet :as spreadsheet]
            [expectations :refer :all]
            [metabase
             [config :as config]
             [http-client :as http]
             [query-processor-test :as qp-test]
             [util :as u]]
            [metabase.api.public :as public-api]
            [metabase.models
             [card :refer [Card]]
             [dashboard :refer [Dashboard]]
             [dashboard-card :refer [DashboardCard]]
             [dashboard-card-series :refer [DashboardCardSeries]]
             [dimension :refer [Dimension]]
             [field :refer [Field]]
             [field-values :refer [FieldValues]]]
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
  {:dataset_query {:database (data/id)
                   :type     :query
                   :query    {:source-table (data/id :venues)
                              :aggregation  [:count]}}})

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

;; Check that we *cannot* fetch a PublicCard if the setting is disabled
(expect
  "An error occurred."
  (tu/with-temporary-setting-values [enable-public-sharing false]
    (with-temp-public-card [{uuid :public_uuid}]
      (http/client :get 400 (str "public/card/" uuid)))))

;; Check that we get a 400 if the PublicCard doesn't exist
(expect
  "An error occurred."
  (tu/with-temporary-setting-values [enable-public-sharing true]
    (http/client :get 400 (str "public/card/" (UUID/randomUUID)))))

;; Check that we *cannot* fetch a PublicCard if the Card has been archived
(expect
  "An error occurred."
  (tu/with-temporary-setting-values [enable-public-sharing true]
    (with-temp-public-card [{uuid :public_uuid} {:archived true}]
      (http/client :get 400 (str "public/card/" uuid)))))

;; Check that we can fetch a PublicCard
(expect
  #{:dataset_query :description :display :id :name :visualization_settings :param_values :param_fields}
  (tu/with-temporary-setting-values [enable-public-sharing true]
    (with-temp-public-card [{uuid :public_uuid}]
      (set (keys (http/client :get 200 (str "public/card/" uuid)))))))

;; make sure :param_values get returned as expected
(expect
  {(data/id :categories :name) {:values                75
                                :human_readable_values {}
                                :field_id              (data/id :categories :name)}}
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
    (-> (:param_values (#'public-api/public-card :id (u/get-id card)))
        (update-in [(data/id :categories :name) :values] count))))


;;; ------------------------- GET /api/public/card/:uuid/query (and JSON/CSV/XSLX versions) --------------------------

;; Check that we *cannot* execute a PublicCard if the setting is disabled
(expect
  "An error occurred."
  (tu/with-temporary-setting-values [enable-public-sharing false]
    (with-temp-public-card [{uuid :public_uuid}]
      (http/client :get 400 (str "public/card/" uuid "/query")))))


;; Check that we get a 400 if the PublicCard doesn't exist
(expect
  "An error occurred."
  (tu/with-temporary-setting-values [enable-public-sharing true]
    (http/client :get 400 (str "public/card/" (UUID/randomUUID) "/query"))))

;; Check that we *cannot* execute a PublicCard if the Card has been archived
(expect
  "An error occurred."
  (tu/with-temporary-setting-values [enable-public-sharing true]
    (with-temp-public-card [{uuid :public_uuid} {:archived true}]
      (http/client :get 400 (str "public/card/" uuid "/query")))))

;; Check that we can exec a PublicCard
(expect
  [[100]]
  (tu/with-temporary-setting-values [enable-public-sharing true]
    (with-temp-public-card [{uuid :public_uuid}]
      (qp-test/rows (http/client :get 200 (str "public/card/" uuid "/query"))))))

;; Check that we can exec a PublicCard and get results as JSON
(expect
  (tu/with-temporary-setting-values [enable-public-sharing true]
    (with-temp-public-card [{uuid :public_uuid}]
      (http/client :get 200 (str "public/card/" uuid "/query/json")))))

;; Check that we can exec a PublicCard and get results as CSV
(expect
  "count\n100\n"
  (tu/with-temporary-setting-values [enable-public-sharing true]
    (with-temp-public-card [{uuid :public_uuid}]
      (http/client :get 200 (str "public/card/" uuid "/query/csv"), :format :csv))))

;; Check that we can exec a PublicCard and get results as XLSX
(expect
  [{:col "count"} {:col 100.0}]
  (tu/with-temporary-setting-values [enable-public-sharing true]
    (with-temp-public-card [{uuid :public_uuid}]
      (->> (http/client :get 200 (str "public/card/" uuid "/query/xlsx") {:request-options {:as :byte-array}})
           ByteArrayInputStream.
           spreadsheet/load-workbook
           (spreadsheet/select-sheet "Query result")
           (spreadsheet/select-columns {:A :col})))))

;; Check that we can exec a PublicCard with `?parameters`
(expect
  [{:name "Venue ID", :slug "venue_id", :type "id", :value 2}]
  (tu/with-temporary-setting-values [enable-public-sharing true]
    (with-temp-public-card [{uuid :public_uuid}]
      (get-in (http/client :get 200 (str "public/card/" uuid "/query")
                           :parameters (json/encode [{:name "Venue ID", :slug "venue_id", :type "id", :value 2}]))
              [:json_query :parameters]))))

;; make sure CSV (etc.) downloads take editable params into account (#6407)

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

(expect
  "count\n107\n"
  (tu/with-temporary-setting-values [enable-public-sharing true]
    (tt/with-temp Card [{uuid :public_uuid} (card-with-date-field-filter)]
      (http/client :get 200 (str "public/card/" uuid "/query/csv")
                   :parameters (json/encode [{:type   :date/quarter-year
                                              :target [:dimension [:template-tag :date]]
                                              :value  "Q1-2014"}])))))

;; make sure it also works with the forwarded URL
(expect
  "count\n107\n"
  (tu/with-temporary-setting-values [enable-public-sharing true]
    (tt/with-temp Card [{uuid :public_uuid} (card-with-date-field-filter)]
      ;; make sure the URL doesn't include /api/ at the beginning like it normally would
      (binding [http/*url-prefix* (str "http://localhost:" (config/config-str :mb-jetty-port) "/")]
        (http/client :get 200 (str "public/question/" uuid ".csv")
                     :parameters (json/encode [{:type   :date/quarter-year
                                                :target [:dimension [:template-tag :date]]
                                                :value  "Q1-2014"}]))))))

;; make sure we include all the relevant fields like `:insights`
(defn- card-with-trendline []
  (assoc (shared-obj)
    :dataset_query {:database (data/id)
                    :type     :query
                    :query   {:source-table (data/id :checkins)
                              :breakout     [[:datetime-field [:field-id (data/id :checkins :date)]  :month]]
                              :aggregation  [[:count]]}}))

(expect
  #{:cols :rows :insights :columns}
  (tu/with-temporary-setting-values [enable-public-sharing true]
    (tt/with-temp Card [{uuid :public_uuid} (card-with-trendline)]
      (-> (http/client :get 200 (str "public/card/" uuid "/query"))
          :data
          keys
          set))))


;;; ---------------------------------------- GET /api/public/dashboard/:uuid -----------------------------------------

;; Check that we *cannot* fetch PublicDashboard if setting is disabled
(expect
  "An error occurred."
  (tu/with-temporary-setting-values [enable-public-sharing false]
    (with-temp-public-dashboard [{uuid :public_uuid}]
      (http/client :get 400 (str "public/dashboard/" uuid)))))

;; Check that we get a 400 if the PublicDashboard doesn't exis
(expect
  "An error occurred."
  (tu/with-temporary-setting-values [enable-public-sharing true]
    (http/client :get 400 (str "public/dashboard/" (UUID/randomUUID)))))

(defn- fetch-public-dashboard [{uuid :public_uuid}]
  (-> (http/client :get 200 (str "public/dashboard/" uuid))
      (select-keys [:name :ordered_cards])
      (update :name boolean)
      (update :ordered_cards count)))

;; Check that we can fetch a PublicDashboard
(expect
  {:name true, :ordered_cards 1}
  (tu/with-temporary-setting-values [enable-public-sharing true]
    (with-temp-public-dashboard-and-card [dash card]
      (fetch-public-dashboard dash))))

;; Check that we don't see Cards that have been archived
(expect
  {:name true, :ordered_cards 0}
  (tu/with-temporary-setting-values [enable-public-sharing true]
    (with-temp-public-dashboard-and-card [dash card]
      (db/update! Card (u/get-id card), :archived true)
      (fetch-public-dashboard dash))))


;;; --------------------------------- GET /api/public/dashboard/:uuid/card/:card-id ----------------------------------

(defn- dashcard-url [dash card]
  (str "public/dashboard/" (:public_uuid dash) "/card/" (u/get-id card)))


;; Check that we *cannot* exec PublicCard via PublicDashboard if setting is disabled
(expect
  "An error occurred."
  (tu/with-temporary-setting-values [enable-public-sharing false]
    (with-temp-public-dashboard-and-card [dash card]
      (http/client :get 400 (dashcard-url dash card)))))

;; Check that we get a 400 if PublicDashboard doesn't exist
(expect
  "An error occurred."
  (tu/with-temporary-setting-values [enable-public-sharing true]
    (with-temp-public-dashboard-and-card [_ card]
      (http/client :get 400 (dashcard-url {:public_uuid (UUID/randomUUID)} card)))))


;; Check that we get a 400 if PublicCard doesn't exist
(expect
  "An error occurred."
  (tu/with-temporary-setting-values [enable-public-sharing true]
    (with-temp-public-dashboard-and-card [dash _]
      (http/client :get 400 (dashcard-url dash Integer/MAX_VALUE)))))

;; Check that we get a 400 if the Card does exist but it's not part of this Dashboard
(expect
  "An error occurred."
  (tu/with-temporary-setting-values [enable-public-sharing true]
    (with-temp-public-dashboard-and-card [dash _]
      (tt/with-temp Card [card]
        (http/client :get 400 (dashcard-url dash card))))))

;; Check that we *cannot* execute a PublicCard via a PublicDashboard if the Card has been archived
(expect
  "An error occurred."
  (tu/with-temporary-setting-values [enable-public-sharing true]
    (with-temp-public-dashboard-and-card [dash card]
      (db/update! Card (u/get-id card), :archived true)
      (http/client :get 400 (dashcard-url dash card)))))

;; Check that we can exec a PublicCard via a PublicDashboard
(expect
  [[100]]
  (tu/with-temporary-setting-values [enable-public-sharing true]
    (with-temp-public-dashboard-and-card [dash card]
      (qp-test/rows (http/client :get 200 (dashcard-url dash card))))))

;; Check that we can exec a PublicCard via a PublicDashboard with `?parameters`
(expect
  [{:name    "Venue ID"
    :slug    "venue_id"
    :target  ["dimension" (data/id :venues :id)]
    :value   [10]
    :default nil
    :type    "id"}]
  (tu/with-temporary-setting-values [enable-public-sharing true]
    (with-temp-public-dashboard-and-card [dash card]
      (get-in (http/client :get 200 (dashcard-url dash card)
                           :parameters (json/encode [{:name   "Venue ID"
                                                      :slug   :venue_id
                                                      :target [:dimension (data/id :venues :id)]
                                                      :value  [10]}]))
              [:json_query :parameters]))))

;; Make sure params are validated: this should pass because venue_id *is* one of the Dashboard's :parameters
(expect
 [[1]]
 (tu/with-temporary-setting-values [enable-public-sharing true]
   (with-temp-public-dashboard-and-card [dash card]
     (-> (http/client :get 200 (dashcard-url dash card)
                      :parameters (json/encode [{:name   "Venue ID"
                                                 :slug   :venue_id
                                                 :target [:dimension (data/id :venues :id)]
                                                 :value  [10]}]))
         qp-test/rows))))

;; Make sure params are validated: this should fail because venue_name is *not* one of the Dashboard's :parameters
(expect
 "An error occurred."
 (tu/with-temporary-setting-values [enable-public-sharing true]
   (with-temp-public-dashboard-and-card [dash card]
     (http/client :get 400 (dashcard-url dash card)
                  :parameters (json/encode [{:name   "Venue Name"
                                             :slug   :venue_name
                                             :target [:dimension (data/id :venues :name)]
                                             :value  ["PizzaHacker"]}])))))

;; Check that an additional Card series works as well
(expect
  [[100]]
  (tu/with-temporary-setting-values [enable-public-sharing true]
    (with-temp-public-dashboard-and-card [dash card]
      (with-temp-public-card [card-2]
        (tt/with-temp DashboardCardSeries [_ {:dashboardcard_id (db/select-one-id DashboardCard
                                                                  :card_id      (u/get-id card)
                                                                  :dashboard_id (u/get-id dash))
                                              :card_id          (u/get-id card-2)}]
          (qp-test/rows (http/client :get 200 (dashcard-url dash card-2))))))))

;; Make sure that parameters actually work correctly (#7212)
(expect
  [[50]]
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
            :data
            :rows)))))

;; ...with MBQL Cards as well...
(expect
  [[1]]
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
            :data
            :rows)))))

;; ...and also for DateTime params
(expect
  [[733]]
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
            :data
            :rows)))))

;; make sure DimensionValue params also work if they have a default value, even if some is passed in for some reason
;; as part of the query (#7253)
;; If passed in as part of the query however make sure it doesn't override what's actually in the DB
(expect
 [["Wow"]]
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
           :data
           :rows)))))


;;; --------------------------- Check that parameter information comes back with Dashboard ---------------------------

;; double-check that the Field has FieldValues
(expect
  [1 2 3 4]
  (db/select-one-field :values FieldValues :field_id (data/id :venues :price)))

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

;; Check that param info comes back for SQL Cards
(expect
  (price-param-values)
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
    (GET-param-values dash)))

;; Check that param info comes back for MBQL Cards (field-id)
(expect
  (price-param-values)
  (with-temp-public-dashboard-and-card [dash card dashcard]
    (add-price-param-to-dashboard! dash)
    (add-dimension-param-mapping-to-dashcard! dashcard card ["field-id" (data/id :venues :price)])
    (GET-param-values dash)))

;; Check that param info comes back for MBQL Cards (fk->)
(expect
  (price-param-values)
  (with-temp-public-dashboard-and-card [dash card dashcard]
    (add-price-param-to-dashboard! dash)
    (add-dimension-param-mapping-to-dashcard! dashcard card ["fk->" (data/id :checkins :venue_id) (data/id :venues :price)])
    (GET-param-values dash)))


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

(expect
  #{}
  (tt/with-temp Card [card (mbql-card-referencing-nothing)]
    (#'public-api/card->referenced-field-ids card)))

;; It should pick up on Fields referenced in the MBQL query itself...
(expect
 #{(data/id :venues :name)}
 (tt/with-temp Card [card (mbql-card-referencing-venue-name)]
   (#'public-api/card->referenced-field-ids card)))

;; ...as well as template tag "implict" params for SQL queries
(expect
  #{(data/id :venues :name)}
  (tt/with-temp Card [card (sql-card-referencing-venue-name)]
    (#'public-api/card->referenced-field-ids card)))


;;; --------------------------------------- check-field-is-referenced-by-card ----------------------------------------

;; Check that the check succeeds when Field is referenced
(expect
  (tt/with-temp Card [card (mbql-card-referencing-venue-name)]
    (#'public-api/check-field-is-referenced-by-card (data/id :venues :name) (u/get-id card))))

;; check that exception is thrown if the Field isn't referenced
(expect
  Exception
  (tt/with-temp Card [card (mbql-card-referencing-venue-name)]
    (#'public-api/check-field-is-referenced-by-card (data/id :venues :category_id) (u/get-id card))))


;;; ----------------------------------------- check-search-field-is-allowed ------------------------------------------

;; search field is allowed IF:
;; A) search-field is the same field as the other one
(expect
  (#'public-api/check-search-field-is-allowed (data/id :venues :id) (data/id :venues :id)))

(expect
  Exception
  (#'public-api/check-search-field-is-allowed (data/id :venues :id) (data/id :venues :category_id)))

;; B) there's a Dimension that lists search field as the human_readable_field for the other field
(expect
  (tt/with-temp Dimension [_ {:field_id (data/id :venues :id), :human_readable_field_id (data/id :venues :category_id)}]
    (#'public-api/check-search-field-is-allowed (data/id :venues :id) (data/id :venues :category_id))))

;; C) search-field is a Name Field belonging to the same table as the other field, which is a PK
(expect
  (do ;tu/with-temp-vals-in-db Field (data/id :venues :name) {:special_type "type/Name"}
    (#'public-api/check-search-field-is-allowed (data/id :venues :id) (data/id :venues :name))))

;; not allowed if search field isn't a NAME
(expect
  Exception
  (tu/with-temp-vals-in-db Field (data/id :venues :name) {:special_type "type/Latitude"}
    (#'public-api/check-search-field-is-allowed (data/id :venues :id) (data/id :venues :name))))

;; not allowed if search field belongs to a different TABLE
(expect
  Exception
  (tu/with-temp-vals-in-db Field (data/id :categories :name) {:special_type "type/Name"}
    (#'public-api/check-search-field-is-allowed (data/id :venues :id) (data/id :categories :name))))


;;; ------------------------------------- check-field-is-referenced-by-dashboard -------------------------------------

(defn- dashcard-with-param-mapping-to-venue-id [dashboard card]
  {:dashboard_id       (u/get-id dashboard)
   :card_id            (u/get-id card)
   :parameter_mappings [{:card_id (u/get-id card)
                         :target  [:dimension [:field-id (data/id :venues :id)]]}]})

;; Field is "referenced" by Dashboard if it's one of the Dashboard's params...
(expect
  (tt/with-temp* [Dashboard     [dashboard]
                  Card          [card]
                  DashboardCard [_ (dashcard-with-param-mapping-to-venue-id dashboard card)]]
    (#'public-api/check-field-is-referenced-by-dashboard (data/id :venues :id) (u/get-id dashboard))))

(expect
  Exception
  (tt/with-temp* [Dashboard     [dashboard]
                  Card          [card]
                  DashboardCard [_ (dashcard-with-param-mapping-to-venue-id dashboard card)]]
    (#'public-api/check-field-is-referenced-by-dashboard (data/id :venues :name) (u/get-id dashboard))))

;; ...*or* if it's a so-called "implicit" param (a Field Filter Template Tag (FFTT) in a SQL Card)
(expect
  (tt/with-temp* [Dashboard     [dashboard]
                  Card          [card (sql-card-referencing-venue-name)]
                  DashboardCard [_ {:dashboard_id (u/get-id dashboard), :card_id (u/get-id card)}]]
    (#'public-api/check-field-is-referenced-by-dashboard (data/id :venues :name) (u/get-id dashboard))))

(expect
  Exception
  (tt/with-temp* [Dashboard     [dashboard]
                  Card          [card (sql-card-referencing-venue-name)]
                  DashboardCard [_ {:dashboard_id (u/get-id dashboard), :card_id (u/get-id card)}]]
    (#'public-api/check-field-is-referenced-by-dashboard (data/id :venues :id) (u/get-id dashboard))))


;;; ------------------------------------------- card-and-field-id->values --------------------------------------------

;; We should be able to get values for a Field referenced by a Card
(expect
  {:values   [["20th Century Cafe"]
              ["25°"]
              ["33 Taps"]
              ["800 Degrees Neapolitan Pizzeria"]
              ["BCD Tofu House"]]
   :field_id (data/id :venues :name)}
  (tt/with-temp Card [card (mbql-card-referencing :venues :name)]
    (-> (public-api/card-and-field-id->values (u/get-id card) (data/id :venues :name))
        (update :values (partial take 5)))))

;; SQL param field references should work just as well as MBQL field referenced
(expect
  {:values   [["20th Century Cafe"]
              ["25°"]
              ["33 Taps"]
              ["800 Degrees Neapolitan Pizzeria"]
              ["BCD Tofu House"]]
   :field_id (data/id :venues :name)}
  (tt/with-temp Card [card (sql-card-referencing-venue-name)]
    (-> (public-api/card-and-field-id->values (u/get-id card) (data/id :venues :name))
        (update :values (partial take 5)))))

;; But if the Field is not referenced we should get an Exception
(expect
  Exception
  (tt/with-temp Card [card (mbql-card-referencing :venues :price)]
    (public-api/card-and-field-id->values (u/get-id card) (data/id :venues :name))))


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

;; should be able to fetch values for a Field referenced by a public Card
(expect
  {:values   [["20th Century Cafe"]
              ["25°"]
              ["33 Taps"]
              ["800 Degrees Neapolitan Pizzeria"]
              ["BCD Tofu House"]]
   :field_id (data/id :venues :name)}
  (with-sharing-enabled-and-temp-card-referencing :venues :name [card]
    (-> (http/client :get 200 (field-values-url card (data/id :venues :name)))
        (update :values (partial take 5)))))

;; but for Fields that are not referenced we should get an Exception
(expect
 "An error occurred."
 (with-sharing-enabled-and-temp-card-referencing :venues :name [card]
   (http/client :get 400 (field-values-url card (data/id :venues :price)))))

;; Endpoint should fail if public sharing is disabled
(expect
 "An error occurred."
 (with-sharing-enabled-and-temp-card-referencing :venues :name [card]
   (tu/with-temporary-setting-values [enable-public-sharing false]
     (http/client :get 400 (field-values-url card (data/id :venues :name))))))


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

;; should be able to use it when everything is g2g
(expect
  {:values   [["20th Century Cafe"]
              ["25°"]
              ["33 Taps"]
              ["800 Degrees Neapolitan Pizzeria"]
              ["BCD Tofu House"]]
   :field_id (data/id :venues :name)}
  (with-sharing-enabled-and-temp-dashcard-referencing :venues :name [dashboard]
    (-> (http/client :get 200 (field-values-url dashboard (data/id :venues :name)))
        (update :values (partial take 5)))))

;; shound NOT be able to use the endpoint with a Field not referenced by the Dashboard
(expect
 "An error occurred."
 (with-sharing-enabled-and-temp-dashcard-referencing :venues :name [dashboard]
   (http/client :get 400 (field-values-url dashboard (data/id :venues :price)))))

;; Endpoint should fail if public sharing is disabled
(expect
 "An error occurred."
 (with-sharing-enabled-and-temp-dashcard-referencing :venues :name [dashboard]
   (tu/with-temporary-setting-values [enable-public-sharing false]
     (http/client :get 400 (field-values-url dashboard (data/id :venues :name))))))


;;; ----------------------------------------------- search-card-fields -----------------------------------------------

(expect
 [[93 "33 Taps"]]
 (with-sharing-enabled-and-temp-card-referencing :venues :id [card]
   (do ;tu/with-temp-vals-in-db Field (data/id :venues :name) {:special_type "type/Name"}
     (public-api/search-card-fields (u/get-id card) (data/id :venues :id) (data/id :venues :name) "33 T" 10))))

;; shouldn't work if the search-field isn't allowed to be used in combination with the other Field
(expect
 Exception
 (with-sharing-enabled-and-temp-card-referencing :venues :id [card]
   (public-api/search-card-fields (u/get-id card) (data/id :venues :id) (data/id :venues :price) "33 T" 10)))

;; shouldn't work if the field isn't referenced by CARD
(expect
 Exception
 (with-sharing-enabled-and-temp-card-referencing :venues :name [card]
   (public-api/search-card-fields (u/get-id card) (data/id :venues :id) (data/id :venues :id) "33 T" 10)))


;;; ----------------------- GET /api/public/card/:uuid/field/:field-id/search/:search-field-id -----------------------

(defn- field-search-url [card-or-dashboard field-or-id search-field-or-id]
  (str "public/"
       (condp instance? card-or-dashboard
         (class Card)      "card"
         (class Dashboard) "dashboard")
       "/" (:public_uuid card-or-dashboard)
       "/field/" (u/get-id field-or-id)
       "/search/" (u/get-id search-field-or-id)))

(expect
 [[93 "33 Taps"]]
 (with-sharing-enabled-and-temp-card-referencing :venues :id [card]
   (http/client :get 200 (field-search-url card (data/id :venues :id) (data/id :venues :name))
                :value "33 T")))

;; if search field isn't allowed to be used with the other Field endpoint should return exception
(expect
 "An error occurred."
 (with-sharing-enabled-and-temp-card-referencing :venues :id [card]
   (http/client :get 400 (field-search-url card (data/id :venues :id) (data/id :venues :price))
                :value "33 T")))

;; Endpoint should fail if public sharing is disabled
(expect
  "An error occurred."
  (with-sharing-enabled-and-temp-card-referencing :venues :id [card]
    (tu/with-temporary-setting-values [enable-public-sharing false]
      (http/client :get 400 (field-search-url card (data/id :venues :id) (data/id :venues :name))
                   :value "33 T"))))


;;; -------------------- GET /api/public/dashboard/:uuid/field/:field-id/search/:search-field-id ---------------------

(expect
  [[93 "33 Taps"]]
 (with-sharing-enabled-and-temp-dashcard-referencing :venues :id [dashboard]
   (http/client :get (field-search-url dashboard (data/id :venues :id) (data/id :venues :name))
                :value "33 T")))

;; if search field isn't allowed to be used with the other Field endpoint should return exception
(expect
  "An error occurred."
  (with-sharing-enabled-and-temp-dashcard-referencing :venues :id [dashboard]
    (http/client :get 400 (field-search-url dashboard (data/id :venues :id) (data/id :venues :price))
                 :value "33 T")))

;; Endpoint should fail if public sharing is disabled
(expect
  "An error occurred."
  (with-sharing-enabled-and-temp-dashcard-referencing :venues :id [dashboard]
    (tu/with-temporary-setting-values [enable-public-sharing false]
      (http/client :get 400 (field-search-url dashboard (data/id :venues :name) (data/id :venues :name))
                   :value "33 T"))))

;;; --------------------------------------------- field-remapped-values ----------------------------------------------

;; `field-remapped-values` should return remappings in the expected format when the combination of Fields is allowed.
;; It should parse the value string (it comes back from the API as a string since it is a query param)
(expect
 [10 "Fred 62"]
 (#'public-api/field-remapped-values (data/id :venues :id) (data/id :venues :name) "10"))

;; if the Field isn't allowed
(expect
  Exception
  (#'public-api/field-remapped-values (data/id :venues :id) (data/id :venues :price) "10"))


;;; ----------------------- GET /api/public/card/:uuid/field/:field-id/remapping/:remapped-id ------------------------

(defn- field-remapping-url [card-or-dashboard field-or-id remapped-field-or-id]
  (str "public/"
       (condp instance? card-or-dashboard
         (class Card)      "card"
         (class Dashboard) "dashboard")
       "/" (:public_uuid card-or-dashboard)
       "/field/" (u/get-id field-or-id)
       "/remapping/" (u/get-id remapped-field-or-id)))

;; we should be able to use the API endpoint and get the same results we get by calling the function above directly
(expect
 [10 "Fred 62"]
 (with-sharing-enabled-and-temp-card-referencing :venues :id [card]
   (http/client :get 200 (field-remapping-url card (data/id :venues :id) (data/id :venues :name))
                :value "10")))

;; shouldn't work if Card doesn't reference the Field in question
(expect
 "An error occurred."
 (with-sharing-enabled-and-temp-card-referencing :venues :price [card]
   (http/client :get 400 (field-remapping-url card (data/id :venues :id) (data/id :venues :name))
                :value "10")))

;; ...or if the remapping Field isn't allowed to be used with the other Field
(expect
 "An error occurred."
 (with-sharing-enabled-and-temp-card-referencing :venues :id [card]
   (http/client :get 400 (field-remapping-url card (data/id :venues :id) (data/id :venues :price))
                :value "10")))

;; ...or if public sharing is disabled
(expect
 "An error occurred."
 (with-sharing-enabled-and-temp-card-referencing :venues :id [card]
   (tu/with-temporary-setting-values [enable-public-sharing false]
     (http/client :get 400 (field-remapping-url card (data/id :venues :id) (data/id :venues :name))
                  :value "10"))))


;;; --------------------- GET /api/public/dashboard/:uuid/field/:field-id/remapping/:remapped-id ---------------------

;; we should be able to use the API endpoint and get the same results we get by calling the function above directly
(expect
 [10 "Fred 62"]
 (with-sharing-enabled-and-temp-dashcard-referencing :venues :id [dashboard]
   (http/client :get 200 (field-remapping-url dashboard (data/id :venues :id) (data/id :venues :name))
                :value "10")))

;; shouldn't work if Card doesn't reference the Field in question
(expect
 "An error occurred."
 (with-sharing-enabled-and-temp-dashcard-referencing :venues :price [dashboard]
   (http/client :get 400 (field-remapping-url dashboard (data/id :venues :id) (data/id :venues :name))
                :value "10")))

;; ...or if the remapping Field isn't allowed to be used with the other Field
(expect
 "An error occurred."
 (with-sharing-enabled-and-temp-dashcard-referencing :venues :id [dashboard]
   (http/client :get 400 (field-remapping-url dashboard (data/id :venues :id) (data/id :venues :price))
                :value "10")))

;; ...or if public sharing is disabled
(expect
 "An error occurred."
 (with-sharing-enabled-and-temp-dashcard-referencing :venues :id [dashboard]
   (tu/with-temporary-setting-values [enable-public-sharing false]
     (http/client :get 400 (field-remapping-url dashboard (data/id :venues :id) (data/id :venues :name))
                  :value "10"))))
