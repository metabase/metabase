(ns metabase.api.embed-test
  "Tests for /api/embed endpoints."
  (:require
   [buddy.sign.jwt :as jwt]
   [buddy.sign.util :as buddy-util]
   [clj-time.core :as time]
   [clojure.data.csv :as csv]
   [clojure.set :as set]
   [clojure.test :refer :all]
   [crypto.random :as crypto-random]
   [dk.ative.docjure.spreadsheet :as spreadsheet]
   [metabase.api.card-test :as api.card-test]
   [metabase.api.dashboard-test :as api.dashboard-test]
   [metabase.api.embed :as api.embed]
   [metabase.api.pivots :as api.pivots]
   [metabase.api.public-test :as public-test]
   [metabase.config :as config]
   [metabase.http-client :as client]
   [metabase.models
    :refer [Card Dashboard DashboardCard DashboardCardSeries]]
   [metabase.models.field-values :as field-values]
   [metabase.models.interface :as mi]
   [metabase.models.params.chain-filter-test :as chain-filer-test]
   [metabase.models.permissions :as perms]
   [metabase.models.permissions-group :as perms-group]
   [metabase.query-processor.middleware.constraints :as qp.constraints]
   [metabase.query-processor.test-util :as qp.test-util]
   [metabase.test :as mt]
   [metabase.util :as u]
   [toucan2.core :as t2]
   [toucan2.tools.with-temp :as t2.with-temp])
  (:import
   (java.io ByteArrayInputStream)))

(defn random-embedding-secret-key [] (crypto-random/hex 32))

(def ^:dynamic *secret-key* nil)

(defn sign [claims] (jwt/sign claims *secret-key*))

(defn do-with-new-secret-key [f]
  (binding [*secret-key* (random-embedding-secret-key)]
    (mt/with-temporary-setting-values [embedding-secret-key *secret-key*]
      (f))))

(defmacro with-new-secret-key {:style/indent 0} [& body]
  `(do-with-new-secret-key (fn [] ~@body)))

(defn card-token {:style/indent 1} [card-or-id & [additional-token-params]]
  (sign (merge {:resource {:question (u/the-id card-or-id)}
                :params   {}}
               additional-token-params)))

(defn dash-token {:style/indent 1} [dash-or-id & [additional-token-params]]
  (sign (merge {:resource {:dashboard (u/the-id dash-or-id)}
                :params   {}}
               additional-token-params)))

(defn do-with-temp-card [m f]
  (let [m (merge (when-not (:dataset_query m)
                   {:dataset_query (mt/mbql-query venues {:aggregation [[:count]]})})
                 m)]
    (t2.with-temp/with-temp [Card card m]
      (f card))))

(defmacro with-temp-card {:style/indent 1} [[binding & [card]] & body]
  `(do-with-temp-card
    ~card
    (fn [~binding]
      ~@body)))

(defn do-with-temp-dashcard [{:keys [dash card dashcard card-fn]} f]
  (with-temp-card [card (if (ifn? card-fn) (card-fn card) card)]
    (mt/with-temp [Dashboard     dashboard (merge
                                            (when-not (:parameters dash)
                                              {:parameters [{:id      "_VENUE_ID_"
                                                             :name    "Venue ID"
                                                             :slug    "venue_id"
                                                             :type    "id"
                                                             :target  [:dimension (mt/id :venues :id)]
                                                             :default nil}]})
                                            dash)
                   DashboardCard dashcard  (merge {:dashboard_id       (u/the-id dashboard)
                                                   :card_id            (u/the-id card)
                                                   :parameter_mappings (or (:parameter_mappings dashcard)
                                                                           [{:parameter_id "_VENUE_ID_"
                                                                             :card_id      (u/the-id card)
                                                                             :target       [:dimension [:field (mt/id :venues :id) nil]]}])}
                                                  dashcard)]
      (f dashcard))))

(defmacro with-temp-dashcard
  {:style/indent 1, :arglists '([[dashcard-binding {:keys [dash card dashcard]}] & body])}
  [[dashcard-binding options] & body]
  `(do-with-temp-dashcard
    ~options
    (fn [~dashcard-binding]
      ~@body)))

(defmacro with-embedding-enabled-and-new-secret-key {:style/indent 0} [& body]
  `(mt/with-temporary-setting-values [~'enable-embedding true]
     (with-new-secret-key
       ~@body)))

(defn ^:deprecated test-query-results
  ([actual]
   (is (=? {:data       {:cols             [(mt/obj->json->obj (qp.test-util/aggregate-col :count))]
                         :rows             [[100]]
                         :insights         nil
                         :results_timezone "UTC"}
            :json_query {}
            :status     "completed"}
           actual)))

  ([results-format actual]
   (case results-format
     ""
     (test-query-results actual)

     "/json"
     (is (= [{:Count 100}]
            actual))

     "/csv"
     (is (= "Count\n100\n"
            actual))

     "/xlsx"
     (let [actual (->> (ByteArrayInputStream. actual)
                       spreadsheet/load-workbook
                       (spreadsheet/select-sheet "Query result")
                       (spreadsheet/select-columns {:A :col}))]
       (is (= [{:col "Count"} {:col 100.0}]
              actual))))))

(defn dissoc-id-and-name [obj]
  (cond-> obj
    (map? obj) (dissoc :id :name)))

(def successful-card-info
  "Data that should be returned if `GET /api/embed/card/:token` completes successfully (minus `:id` and `:name`).
   This should only be the bare minimum amount of info needed to display the Card, leaving out other data we wouldn't
   want the public to have access to."
  {:description            nil
   :display                "table"
   :visualization_settings {}
   :dataset_query          {:type "query"}
   :parameters             []
   :param_values           nil
   :param_fields           nil})

(def successful-dashboard-info
  {:auto_apply_filters true, :description nil, :parameters [], :dashcards [], :tabs [],
   :param_values {}, :param_fields nil})

(def ^:private yesterday (time/minus (time/now) (time/days 1)))

;;; ------------------------------------------- GET /api/embed/card/:token -------------------------------------------

(defn- card-url [card & [additional-token-params]] (str "embed/card/" (card-token card additional-token-params)))

(deftest it-should-be-possible-to-use-this-endpoint-successfully-if-all-the-conditions-are-met
  (with-embedding-enabled-and-new-secret-key
    (with-temp-card [card {:enable_embedding true}]
      (is (= successful-card-info
             (dissoc-id-and-name
               (client/client :get 200 (card-url card))))))))

(deftest we-should-fail-when-attempting-to-use-an-expired-token
  (with-embedding-enabled-and-new-secret-key
    (with-temp-card [card {:enable_embedding true}]
      (is (re= #"Token is expired.*"
               (client/client :get 400 (card-url card {:exp (buddy-util/to-timestamp yesterday)})))))))

(deftest check-that-the-endpoint-doesn-t-work-if-embedding-isn-t-enabled
  (mt/with-temporary-setting-values [enable-embedding false]
    (with-new-secret-key
      (with-temp-card [card]
        (is (= "Embedding is not enabled."
               (client/client :get 400 (card-url card))))))))

(deftest check-that-if-embedding-is-enabled-globally-but-not-for-the-card-the-request-fails
  (with-embedding-enabled-and-new-secret-key
    (with-temp-card [card]
      (is (= "Embedding is not enabled for this object."
             (client/client :get 400 (card-url card)))))))

(deftest global-embedding-requests-fail-with-wrong-key
  (testing (str "check that if embedding is enabled globally and for the object that requests fail if they are signed "
                "with the wrong key")
    (with-embedding-enabled-and-new-secret-key
      (with-temp-card [card {:enable_embedding true}]
        (is (= "Message seems corrupt or manipulated"
               (client/client :get 400 (with-new-secret-key (card-url card)))))))))

(deftest check-that-only-enabled-params-that-are-not-present-in-the-jwt-come-back
  (testing "check that only ENABLED params that ARE NOT PRESENT IN THE JWT come back"
    (with-embedding-enabled-and-new-secret-key
      (with-temp-card [card {:enable_embedding true
                             :dataset_query    {:database (mt/id)
                                                :type     :native
                                                :native   {:template-tags {:a {:type "date", :name "a", :display_name "a" :id "a"}
                                                                           :b {:type "date", :name "b", :display_name "b" :id "b"}
                                                                           :c {:type "date", :name "c", :display_name "c" :id "c"}
                                                                           :d {:type "date", :name "d", :display_name "d" :id "d"}}}}
                             :embedding_params {:a "locked", :b "disabled", :c "enabled", :d "enabled"}}]
        (is (=? {:parameters [{:id      "d"
                               :type    "date/single"
                               :target  ["variable" ["template-tag" "d"]]
                               :name    "d"
                               :slug    "d"
                               :default nil}]}
                (client/client :get 200 (card-url card {:params {:c 100}}))))
        (testing "even if the value of the parameter is nil"
          (is (=? {:parameters [{:id      "d"
                                 :type    "date/single"
                                 :target  ["variable" ["template-tag" "d"]]
                                 :name    "d"
                                 :slug    "d"
                                 :default nil}]}
                  (client/client :get 200 (card-url card {:params {:c nil}})))))))))

(deftest parameters-should-include-template-tags
  (testing "parameters should get from both template-tags and card.parameters"
    ;; in 44 we added card.parameters but we didn't migrate template-tags to parameters
    ;; because doing such migration is costly.
    ;; so there are cards where some parameters in template-tags does not exist in card.parameters
    ;; that why we need to keep concat both of them then dedupe by id
    (with-embedding-enabled-and-new-secret-key
      (with-temp-card [card {:enable_embedding true
                             :dataset_query    {:database (mt/id)
                                                :type     :native
                                                :native   {:template-tags {:a {:type "date", :name "a", :display_name "a" :id "a" :default "A TAG"}
                                                                           :b {:type "date", :name "b", :display_name "b" :id "b" :default "B TAG"}
                                                                           :c {:type "date", :name "c", :display_name "c" :id "c" :default "C TAG"}
                                                                           :d {:type "date", :name "d", :display_name "d" :id "d" :default "D TAG"}}}}
                             :parameters       [{:type "date", :name "a", :display_name "a" :id "a" :default "A param"}
                                                {:type "date", :name "b", :display_name "b" :id "b" :default "B param"}
                                                {:type "date", :name "c", :display_name "c" :id "c" :default "C param"
                                                 :values_source_type "static-list"  :values_source_config {:values ["BBQ" "Bakery" "Bar"]}}]
                             :embedding_params {:a "locked", :b "disabled", :c "enabled", :d "enabled"}}]
        (let [parameters (:parameters (client/client :get 200 (card-url card)))]
          (is (= [;; the parmeter with id = "c" exists in both card.parameters and tempalte-tags should have info
                  ;; merge of both places
                  {:id "c",
                   :type "date/single",
                   :display_name "c",
                   :target ["variable" ["template-tag" "c"]],
                   :name "c",
                   :slug "c",
                   ;; order importance: the default from template-tag is in the final result
                   :default "C TAG"
                   :values_source_type    "static-list"
                   :values_source_config {:values ["BBQ" "Bakery" "Bar"]}}
                  ;; the parameter id = "d" is in template-tags, but not card.parameters,
                  ;; when fetching card we should get it returned
                  {:id "d",
                   :type "date/single",
                   :target ["variable" ["template-tag" "d"]],
                   :name "d",
                   :slug "d",
                   :default "D TAG"}]
                 parameters)))))))

;;; ------------------------- GET /api/embed/card/:token/query (and JSON/CSV/XLSX variants) --------------------------

(defn card-query-url
  "Generate a query URL for an embedded card"
  [card response-format-route-suffix & [additional-token-params]]
  {:pre [(#{"" "/json" "/csv" "/xlsx"} response-format-route-suffix)]}
  (str "embed/card/"
       (card-token card additional-token-params)
       "/query"
       response-format-route-suffix))

(def ^:private response-format->request-options
  {""      nil
   "/json" nil
   "/csv"  nil
   "/xlsx" {:as :byte-array}})

(def ^:private response-format->status-code
  {""      202
   "/json" 200
   "/csv"  200
   "/xlsx" 200})

(defmacro ^:private do-response-formats {:style/indent 1} [[response-format-binding request-options-binding] & body]
  `(doseq [[response-format# ~request-options-binding] response-format->request-options
           :let                                        [~response-format-binding response-format#]]
     (testing (format "response-format = %s\n" (pr-str response-format#))
       ~@body)))

(deftest card-query-test
  (testing "GET /api/embed/card/:token/query and GET /api/embed/card/:token/query/:export-format"
    (mt/with-ensure-with-temp-no-transaction!
      (do-response-formats [response-format request-options]
        (testing "check that the endpoint doesn't work if embedding isn't enabled"
          (mt/with-temporary-setting-values [enable-embedding false]
            (with-new-secret-key
              (with-temp-card [card]
                (is (= "Embedding is not enabled."
                       (client/real-client :get 400 (card-query-url card response-format))))))))

        (with-embedding-enabled-and-new-secret-key
          (let [expected-status (response-format->status-code response-format)]
            (testing "it should be possible to run a Card successfully if you jump through the right hoops..."
              (with-temp-card [card {:enable_embedding true}]
                #_{:clj-kondo/ignore [:deprecated-var]}
                (test-query-results
                 response-format
                 (client/real-client :get expected-status (card-query-url card response-format)
                                     {:request-options request-options}))))

            (testing (str "...but if the card has an invalid query we should just get a generic \"query failed\" "
                          "exception (rather than leaking query info)")
              (with-temp-card [card {:enable_embedding true, :dataset_query {:database (mt/id)
                                                                             :type     :native
                                                                             :native   {:query "SELECT * FROM XYZ"}}}]
                (is (= {:status     "failed"
                        :error      "An error occurred while running the query."
                        :error_type "invalid-query"}
                       (client/real-client :get expected-status (card-query-url card response-format)))))))

          (testing "check that if embedding *is* enabled globally but not for the Card the request fails"
            (with-temp-card [card]
              (is (= "Embedding is not enabled for this object."
                     (client/real-client :get 400 (card-query-url card response-format))))))

          (testing (str "check that if embedding is enabled globally and for the object that requests fail if they are "
                        "signed with the wrong key")
            (with-temp-card [card {:enable_embedding true}]
              (is (= "Message seems corrupt or manipulated"
                     (client/real-client :get 400 (with-new-secret-key (card-query-url card response-format))))))))))))

(deftest download-formatted-without-constraints-test
  (testing (str "Downloading CSV/JSON/XLSX results shouldn't be subject to the default query constraints -- even if "
                "the query comes in with `add-default-userland-constraints` (as will be the case if the query gets "
                "saved from one that had it -- see #9831 and #10399)")
    (with-redefs [qp.constraints/default-query-constraints (constantly {:max-results 10, :max-results-bare-rows 10})]
      (with-embedding-enabled-and-new-secret-key
        (with-temp-card [card {:enable_embedding true
                               :dataset_query    (assoc (mt/mbql-query venues)
                                                        :middleware
                                                        {:add-default-userland-constraints? true
                                                         :userland-query?                   true})}]
          (let [results (client/client :get 200 (card-query-url card "/csv"))]
            (is (= 101
                   (count (csv/read-csv results))))))))))

(deftest card-locked-params-test
  (mt/with-ensure-with-temp-no-transaction!
    (with-embedding-enabled-and-new-secret-key
      (with-temp-card [card {:enable_embedding true, :embedding_params {:venue_id "locked"}}]
        (do-response-formats [response-format request-options]
                             (testing (str "check that if embedding is enabled globally and for the object requests fail if the token is "
                                           "missing a `:locked` parameter")
                               (is (= "You must specify a value for :venue_id in the JWT."
                                      (client/client :get 400 (card-query-url card response-format)))))

                             (testing "if `:locked` param is present, request should succeed"
                               #_{:clj-kondo/ignore [:deprecated-var]}
                               (test-query-results
                                response-format
                                (client/real-client :get (response-format->status-code response-format)
                                                    (card-query-url card response-format {:params {:venue_id 100}})
                                                    {:request-options request-options})))

                             (testing "If `:locked` parameter is present in URL params, request should fail"
                               (is (= "You can only specify a value for :venue_id in the JWT."
                                      (client/client :get 400 (str (card-query-url card response-format {:params {:venue_id 100}}) "?venue_id=100"))))))))))

(deftest card-disabled-params-test
  (with-embedding-enabled-and-new-secret-key
    (with-temp-card [card {:enable_embedding true, :embedding_params {:venue_id "disabled"}}]
      (do-response-formats [response-format _request-options]
        (testing (str "check that if embedding is enabled globally and for the object requests fail if they pass a "
                      "`:disabled` parameter")
          (is (= "You're not allowed to specify a value for :venue_id."
                 (client/client :get 400 (card-query-url card response-format {:params {:venue_id 100}})))))

        (testing "If a `:disabled` param is passed in the URL the request should fail"
          (is (= "You're not allowed to specify a value for :venue_id."
                 (client/client :get 400 (str (card-query-url card response-format) "?venue_id=200")))))))))

(deftest card-enabled-params-test
  (mt/with-ensure-with-temp-no-transaction!
    (with-embedding-enabled-and-new-secret-key
      (with-temp-card [card {:enable_embedding true, :embedding_params {:venue_id "enabled"}}]
        (do-response-formats [response-format request-options]
          (testing "If `:enabled` param is present in both JWT and the URL, the request should fail"
            (is (= "You can't specify a value for :venue_id if it's already set in the JWT."
                   (client/real-client :get 400 (str (card-query-url card response-format {:params {:venue_id 100}}) "?venue_id=200")))))

          (testing "If an `:enabled` param is present in the JWT, that's ok"
            #_{:clj-kondo/ignore [:deprecated-var]}
            (test-query-results
             response-format
             (client/real-client :get (response-format->status-code response-format)
                                 (card-query-url card response-format {:params {:venue_id "enabled"}})
                                 {:request-options request-options})))

          (testing "If an `:enabled` param is present in URL params but *not* the JWT, that's ok"
            #_{:clj-kondo/ignore [:deprecated-var]}
            (test-query-results
             response-format
             (client/real-client :get (response-format->status-code response-format)
                                 (str (card-query-url card response-format) "?venue_id=200")
                                 {:request-options request-options}))))))))

(defn card-with-date-field-filter-default
  []
  {:enable_embedding true
   :dataset_query
   {:database (mt/id)
    :type     :native
    :native   {:query         "SELECT COUNT(*) AS \"count\" FROM CHECKINS WHERE {{date}}"
               :template-tags {:date {:name         "date"
                                      :display-name "Date"
                                      :type         "dimension"
                                      :default      "Q1-2014"
                                      :dimension    [:field (mt/id :checkins :date) nil]
                                      :widget-type  "date/quarter-year"}}}}})

(deftest default-value-card-query-test
  (testing "GET /api/embed/card/:token/query with default values for params"
    (with-embedding-enabled-and-new-secret-key
      (testing "if the param is enabled"
        (t2.with-temp/with-temp
          [Card card (assoc (card-with-date-field-filter-default) :embedding_params {:date :enabled})]
          (testing "the default should apply if no param value is provided"
            (is (= [[107]]
                   (mt/rows (client/client :get 202 (card-query-url card "")))))
            (testing "check this is the same result as when a default value is provided"
              (is (= [[107]]
                     (mt/rows (client/client :get 202 (str (card-query-url card "") "?date=Q1-2014")))))))
          (testing "an empty value should apply if provided as an empty string in the query params"
            (is (= [[1000]]
                   (mt/rows (client/client :get 202 (str (card-query-url card "") "?date="))))))
          (testing "an empty value should apply if provided as nil in the JWT params"
            (is (= [[1000]]
                   (mt/rows (client/client :get 202 (card-query-url card "" {:params {:date nil}}))))))))
      (testing "if the param is disabled"
        (t2.with-temp/with-temp
          [Card card (assoc (card-with-date-field-filter-default) :embedding_params {:date :disabled})]
          (testing "the default should apply if no param is provided"
            (is (= [[107]]
                   (mt/rows (client/client :get 202 (card-query-url card ""))))))
          (testing "you can't apply an empty param value if the parameter is disabled"
            (is (= "You're not allowed to specify a value for :date."
                   (client/client :get 400 (str (card-query-url card "") "?date=")))))))
      (testing "if the param is locked"
        (t2.with-temp/with-temp
          [Card card (assoc (card-with-date-field-filter-default) :embedding_params {:date :locked})]
          (testing "an empty value should apply if provided as nil in the JWT params"
            (is (= [[1000]]
                   (mt/rows (client/client :get 202 (card-query-url card "" {:params {:date nil}})))))
            (testing "check this is different to when a non-nil value is provided"
              (is (= [[138]]
                     (mt/rows (client/client :get 202 (card-query-url card "" {:params {:date "Q2-2014"}})))))))
          (testing "an empty string value is invalid and should result in an error"
            (is (= "You must specify a value for :date in the JWT."
                   (client/client :get 400 (card-query-url card "" {:params {:date ""}}))))))))))

(defn- card-with-date-field-filter []
  {:dataset_query    {:database (mt/id)
                      :type     :native
                      :native   {:query         "SELECT COUNT(*) AS \"count\" FROM CHECKINS WHERE {{date}}"
                                 :template-tags {:date {:name         "date"
                                                        :display-name "Date"
                                                        :type         "dimension"
                                                        :dimension    [:field (mt/id :checkins :date) nil]
                                                        :widget-type  "date/quarter-year"}}}}
   :enable_embedding true
   :embedding_params {:date :enabled}})

(deftest csv-reports-count
  (testing "make sure CSV (etc.) downloads take editable params into account (#6407)"
    (with-embedding-enabled-and-new-secret-key
      (t2.with-temp/with-temp [Card card (card-with-date-field-filter)]
        (is (= "count\n107\n"
               (client/client :get 200 (str (card-query-url card "/csv") "?date=Q1-2014"))))))))

(deftest csv-forward-url-test
  (with-embedding-enabled-and-new-secret-key
    (mt/with-temp! [Card card (card-with-date-field-filter)]
      ;; make sure the URL doesn't include /api/ at the beginning like it normally would
      (binding [client/*url-prefix* ""]
        (mt/with-temporary-setting-values [site-url (str "http://localhost:" (config/config-str :mb-jetty-port) client/*url-prefix*)]
          (is (= "count\n107\n"
                 (client/real-client :get 200 (str "embed/question/" (card-token card) ".csv?date=Q1-2014")))))))))


;;; ---------------------------------------- GET /api/embed/dashboard/:token -----------------------------------------

(defn- dashboard-url [dashboard & [additional-token-params]]
  (str "embed/dashboard/" (dash-token dashboard additional-token-params)))

(deftest it-should-be-possible-to-call-this-endpoint-successfully
  (with-embedding-enabled-and-new-secret-key
    (t2.with-temp/with-temp [Dashboard dash {:enable_embedding true}]
      (is (= successful-dashboard-info
             (dissoc-id-and-name
              (client/client :get 200 (dashboard-url dash))))))))

(deftest we-should-fail-when-attempting-to-use-an-expired-token-2
  (with-embedding-enabled-and-new-secret-key
    (t2.with-temp/with-temp [Dashboard dash {:enable_embedding true}]
      (is (re= #"^Token is expired.*"
               (client/client :get 400 (dashboard-url dash {:exp (buddy-util/to-timestamp yesterday)})))))))

(deftest check-that-the-dashboard-endpoint-doesn-t-work-if-embedding-isn-t-enabled
  (mt/with-temporary-setting-values [enable-embedding false]
    (with-new-secret-key
      (t2.with-temp/with-temp [Dashboard dash]
        (is (= "Embedding is not enabled."
               (client/client :get 400 (dashboard-url dash))))))))

(deftest check-that-if-embedding--is--enabled-globally-but-not-for-the-dashboard-the-request-fails
  (with-embedding-enabled-and-new-secret-key
    (t2.with-temp/with-temp [Dashboard dash]
      (is (= "Embedding is not enabled for this object."
             (client/client :get 400 (dashboard-url dash)))))))

(deftest global-embedding-check-key
  (testing (str "check that if embedding is enabled globally and for the object that requests fail if they are signed "
                "with the wrong key")
    (with-embedding-enabled-and-new-secret-key
      (t2.with-temp/with-temp [Dashboard dash {:enable_embedding true}]
        (is (= "Message seems corrupt or manipulated"
               (client/client :get 400 (with-new-secret-key (dashboard-url dash)))))))))

(deftest only-enabled-params-that-are-not-present-in-the-jwt-come-back
  (testing "check that only ENABLED params that ARE NOT PRESENT IN THE JWT come back"
    (with-embedding-enabled-and-new-secret-key
      (t2.with-temp/with-temp [Dashboard dash {:enable_embedding true
                                               :embedding_params {:a "locked", :b "disabled", :c "enabled", :d "enabled"}
                                               :parameters       [{:id "_a", :slug "a", :name "a", :type "date"}
                                                                  {:id "_b", :slug "b", :name "b", :type "date"}
                                                                  {:id "_c", :slug "c", :name "c", :type "date"}
                                                                  {:id "_d", :slug "d", :name "d", :type "date"}]}]
        (is (=? [{:id "_d", :slug "d", :name "d", :type "date"}]
                (:parameters (client/client :get 200 (dashboard-url dash {:params {:c 100}})))))))))

(deftest locked-params-are-substituted-into-text-cards
  (testing "check that locked params are substituted into text cards with mapped variables on the backend"
    (with-embedding-enabled-and-new-secret-key
      (mt/with-temp [Dashboard     dash {:enable_embedding true
                                         :parameters       [{:id "_a" :slug "a" :name "a" :type :string/=}]}
                     DashboardCard _ {:dashboard_id           (:id dash)
                                      :parameter_mappings     [{:parameter_id "_a"
                                                                :target       [:text-tag "foo"]}]
                                      :visualization_settings {:virtual_card {:display "text"}
                                                               :text         "Text card with variable: {{foo}}"}}]
        (is (= "Text card with variable: bar"
               (-> (client/client :get 200 (dashboard-url dash {:params {:a "bar"}}))
                   :dashcards
                   first
                   :visualization_settings
                   :text)))))))

(deftest locked-params-removes-values-fields-and-mappings-test
  (testing "check that locked params are removed in parameter mappings, param_values, and param_fields"
    (with-embedding-enabled-and-new-secret-key
      (t2.with-temp/with-temp [Dashboard     dashboard     {:enable_embedding true
                                                            :embedding_params {:venue_name "locked"}
                                                            :name             "Test Dashboard"
                                                            :parameters       [{:name      "venue_name"
                                                                                :slug      "venue_name"
                                                                                :id        "foo"
                                                                                :type      :string/=
                                                                                :sectionId "string"}]}
                               Card          {card-id :id} {:name "Dashboard Test Card"}
                               DashboardCard {_ :id}       {:dashboard_id       (:id dashboard)
                                                            :card_id            card-id
                                                            :parameter_mappings [{:card_id      card-id
                                                                                  :slug         "venue_name"
                                                                                  :parameter_id "foo"
                                                                                  :target       [:dimension
                                                                                                 [:field (mt/id :venues :name) nil]]}
                                                                                 {:card_id      card-id
                                                                                  :parameter_id "bar"
                                                                                  :target       [:dimension
                                                                                                 [:field (mt/id :categories :name) nil]]}]}]
        (let [embedding-dashboard (client/client :get 200 (dashboard-url dashboard {:params {:foo "BCD Tofu House"}}))]
          (is (= nil
                 (-> embedding-dashboard
                     :param_values
                     (get (mt/id :venues :name)))))
          (is (= nil
                 (-> embedding-dashboard
                     :param_fields
                     (get (mt/id :venues :name)))))
          (is (= 1
                 (-> embedding-dashboard
                     :dashcards
                     first
                     :parameter_mappings
                     count))))))))

(deftest linked-param-to-locked-removes-param-values-test
  (testing "Check that a linked parameter to a locked params we remove the param_values."
    (with-embedding-enabled-and-new-secret-key
      (t2.with-temp/with-temp [Dashboard     dashboard     {:enable_embedding true
                                                            :embedding_params {:venue_name "locked" :category_name "enabled"}
                                                            :name             "Test Dashboard"
                                                            :parameters       [{:name      "venue_name"
                                                                                :slug      "venue_name"
                                                                                :id        "foo"
                                                                                :type      :string/=
                                                                                :sectionId "string"}
                                                                               {:name                "category_name"
                                                                                :filteringParameters ["foo"]
                                                                                :slug                "category_name"
                                                                                :id                  "bar"
                                                                                :type                :string/=
                                                                                :sectionId           "string"}]}
                               Card          {card-id :id} {:name "Dashboard Test Card"}
                               DashboardCard {_ :id}       {:dashboard_id       (:id dashboard)
                                                            :card_id            card-id
                                                            :parameter_mappings [{:card_id      card-id
                                                                                  :slug         "venue_name"
                                                                                  :parameter_id "foo"
                                                                                  :target       [:dimension
                                                                                                 [:field (mt/id :venues :name) nil]]}
                                                                                 {:card_id      card-id
                                                                                  :slug         "category_name"
                                                                                  :parameter_id "bar"
                                                                                  :target       [:dimension
                                                                                                 [:field (mt/id :categories :name) nil]]}]}]
        (let [embedding-dashboard (client/client :get 200 (dashboard-url dashboard {:params {:foo "BCD Tofu House"}}))]
          (is (= []
                 (-> embedding-dashboard
                     :param_values
                     (get (mt/id :categories :name))
                     :values))))))))

;;; ---------------------- GET /api/embed/dashboard/:token/dashcard/:dashcard-id/card/:card-id -----------------------

(defn- dashcard-url [dashcard & [additional-token-params]]
  (str "embed/dashboard/" (dash-token (:dashboard_id dashcard) additional-token-params)
       "/dashcard/" (u/the-id dashcard)
       "/card/" (:card_id dashcard)))

(deftest it-should-be-possible-to-run-a-card-successfully-if-you-jump-through-the-right-hoops---
  (testing "it should be possible to run a Card successfully if you jump through the right hoops..."
    (with-embedding-enabled-and-new-secret-key
      (with-temp-dashcard [dashcard {:dash {:enable_embedding true}}]
        #_{:clj-kondo/ignore [:deprecated-var]}
        (test-query-results (client/client :get 202 (dashcard-url dashcard)))))))

(deftest downloading-csv-json-xlsx-results-from-the-dashcard-endpoint-shouldn-t-be-subject-to-the-default-query-constraints
  (testing (str "Downloading CSV/JSON/XLSX results from the dashcard endpoint shouldn't be subject to the default "
                "query constraints (#10399)")
    (with-redefs [qp.constraints/default-query-constraints (constantly {:max-results 10, :max-results-bare-rows 10})]
      (with-embedding-enabled-and-new-secret-key
        (with-temp-dashcard [dashcard {:dash {:enable_embedding true}
                                       :card {:dataset_query (assoc (mt/mbql-query venues)
                                                                    :middleware
                                                                    {:add-default-userland-constraints? true
                                                                     :userland-query?                   true})}}]
          (let [results (client/client :get 200 (str (dashcard-url dashcard) "/csv"))]
            (is (= 101
                   (count (csv/read-csv results))))))))))

(deftest downloading-csv-json-xlsx-results-from-the-dashcard-endpoint-respects-column-settings
  (testing "Downloading CSV/JSON/XLSX results should respect the column settings of the dashcard, such as column order and hidden/shown setting. (#33727)"
    (with-redefs [qp.constraints/default-query-constraints (constantly {:max-results 10, :max-results-bare-rows 10})]
      (with-embedding-enabled-and-new-secret-key
        (with-temp-dashcard [dashcard {:dash     {:enable_embedding true}
                                       :card     {:dataset_query (assoc (mt/mbql-query venues)
                                                                        :limit 1
                                                                        :middleware
                                                                        {:add-default-userland-constraints? true
                                                                         :userland-query?                   true})}
                                       ;; we set column settings on the Dashcard only to see that the settings are respected in the output
                                       :dashcard {:visualization_settings
                                                  {:column_settings {}
                                                   :table.columns
                                                   [{:name "NAME" :fieldRef [:field (mt/id :venues :name) nil] :enabled true}
                                                    {:name "ID" :fieldRef [:field (mt/id :venues :id) nil] :enabled true}
                                                    {:name "CATEGORY_ID" :fieldRef [:field (mt/id :venues :category_id) nil] :enabled true}
                                                    {:name "LATITUDE" :fieldRef [:field (mt/id :venues :latitude) nil] :enabled false}
                                                    {:name "LONGITUDE" :fieldRef [:field (mt/id :venues :longitude) nil] :enabled false}
                                                    {:name "PRICE" :fieldRef [:field (mt/id :venues :price) nil] :enabled true}]}}}]
          (let [results (client/client :get 200 (str (dashcard-url dashcard) "/csv"))]
            (is (= ["Name" "ID" "Category ID" "Price"]
                   (first (csv/read-csv results))))))))))

(deftest generic-query-failed-exception-test
  (testing (str "...but if the card has an invalid query we should just get a generic \"query failed\" exception "
                "(rather than leaking query info)")
    (with-embedding-enabled-and-new-secret-key
      (with-temp-dashcard [dashcard {:dash {:enable_embedding true}
                                     :card {:dataset_query (mt/native-query {:query "SELECT * FROM XYZ"})}}]
        (is (= {:status     "failed"
                :error      "An error occurred while running the query."
                :error_type "invalid-query"}
               (client/client :get 202 (dashcard-url dashcard))))))))

(deftest check-that-the-dashcard-endpoint-doesn-t-work-if-embedding-isn-t-enabled
  (mt/with-temporary-setting-values [enable-embedding false]
    (with-new-secret-key
      (with-temp-dashcard [dashcard]
        (is (= "Embedding is not enabled."
               (client/client :get 400 (dashcard-url dashcard))))))))

(deftest dashcard-check-that-if-embedding--is--enabled-globally-but-not-for-the-dashboard-the-request-fails
  (with-embedding-enabled-and-new-secret-key
    (with-temp-dashcard [dashcard]
      (is (= "Embedding is not enabled for this object."
             (client/client :get 400 (dashcard-url dashcard)))))))

(deftest dashcard-global-embedding-check-key
  (testing (str "check that if embedding is enabled globally and for the object that requests fail if they are signed "
                "with the wrong key")
    (with-embedding-enabled-and-new-secret-key
      (with-temp-dashcard [dashcard {:dash {:enable_embedding true}}]
        (is (= "Message seems corrupt or manipulated"
               (client/client :get 400 (with-new-secret-key (dashcard-url dashcard)))))))))

(deftest dashboard-locked-params-test
  (with-embedding-enabled-and-new-secret-key
    (with-temp-dashcard [dashcard {:dash {:enable_embedding true, :embedding_params {:venue_id "locked"}}}]
      (testing (str "check that if embedding is enabled globally and for the object requests fail if the token is "
                    "missing a `:locked` parameter")
        (is (= "You must specify a value for :venue_id in the JWT."
               (client/client :get 400 (dashcard-url dashcard)))))

      (testing "if `:locked` param is supplied, request should succeed"
        (is (=? {:status   "completed"
                 :data     {:rows [[1]]}}
                (client/client :get 202 (dashcard-url dashcard {:params {:venue_id 100}})))))

      (testing "if `:locked` parameter is present in URL params, request should fail"
        (is (= "You must specify a value for :venue_id in the JWT."
               (client/client :get 400 (str (dashcard-url dashcard) "?venue_id=100"))))))))

(deftest dashboard-disabled-params-test
  (with-embedding-enabled-and-new-secret-key
    (with-temp-dashcard [dashcard {:dash {:enable_embedding true, :embedding_params {:venue_id "disabled"}}}]
      (testing (str "check that if embedding is enabled globally and for the object requests fail if they pass a "
                    "`:disabled` parameter")
        (is (= "You're not allowed to specify a value for :venue_id."
               (client/client :get 400 (dashcard-url dashcard {:params {:venue_id 100}})))))

      (testing "If a `:disabled` param is passed in the URL the request should fail"
        (is (= "You're not allowed to specify a value for :venue_id."
               (client/client :get 400 (str (dashcard-url dashcard) "?venue_id=200"))))))))

(deftest dashboard-enabled-params-test
  (with-embedding-enabled-and-new-secret-key
    (with-temp-dashcard [dashcard {:dash {:enable_embedding true, :embedding_params {:venue_id "enabled"}}}]
      (testing "If `:enabled` param is present in both JWT and the URL, the request should fail"
        (is (= "You can't specify a value for :venue_id if it's already set in the JWT."
               (client/client :get 400 (str (dashcard-url dashcard {:params {:venue_id 100}}) "?venue_id=200")))))

      (testing "If an `:enabled` param is present in the JWT, that's ok"
        (is (=? {:status "completed"
                 :data   {:rows [[1]]}}
                (client/client :get 202 (dashcard-url dashcard {:params {:venue_id 50}})))))

      (testing "If an `:enabled` param is present in URL params but *not* the JWT, that's ok"
        (is (=? {:status   "completed"
                 :data     {:rows [[1]]}}
                (client/client :get 202 (str (dashcard-url dashcard) "?venue_id=1"))))))))

(deftest dashboard-native-query-params-with-default-test
  (testing "GET api/embed/dashboard/:token/dashcard/:dashcard-id/card/:card-id with default values for params"
   (with-embedding-enabled-and-new-secret-key
     (t2.with-temp/with-temp
       [Card      card      (card-with-date-field-filter-default)
        Dashboard dashboard {:enable_embedding true
                             :embedding_params {:date "enabled"}
                             :parameters       [{:name "Date"
                                                 :slug "date"
                                                 :id "_DATE_ID_"
                                                 :type :date/quarter-year
                                                 :sectionId "date"}]}
        DashboardCard dashcard {:dashboard_id       (u/the-id dashboard)
                                :card_id            (u/the-id card)
                                :parameter_mappings [{:parameter_id "_DATE_ID_"
                                                      :card_id (u/the-id card)
                                                      :target [:dimension [:template-tag "date"]]}]}]
       (testing "the default should apply if no param value is provided"
         (is (= [[107]]
                (mt/rows (client/client :get 202 (dashcard-url dashcard)))))
         (testing "check this is the same result as when a default value is provided"
           (is (= [[107]]
                  (mt/rows (client/client :get 202 (str (dashcard-url dashcard) "?date=Q1-2014")))))))
       (testing "an empty value should apply if provided as an empty string in the query params"
         (is (= [[1000]]
                (mt/rows (client/client :get 202 (str (dashcard-url dashcard) "?date="))))))
       (testing "an empty value should apply if provided as nil in the JWT params"
         (is (= [[1000]]
                (mt/rows (client/client :get 202 (dashcard-url dashcard {:params {:date nil}}))))))
       (testing "if the param is disabled"
         (mt/with-temp-vals-in-db Dashboard (u/the-id dashboard) {:embedding_params {:date "disabled"}}
           (testing "the default should apply if no param is provided"
             (is (= [[107]]
                    (mt/rows (client/client :get 202 (dashcard-url dashcard))))))
           (testing "you can't apply an empty param value if the parameter is disabled"
             (is (= "You're not allowed to specify a value for :date."
                    (client/client :get 400 (str (dashcard-url dashcard) "?date=")))))))
       (testing "if the param is locked"
         (mt/with-temp-vals-in-db Dashboard (u/the-id dashboard) {:embedding_params {:date "locked"}}
           (testing "an empty value should apply if provided as nil in the JWT params"
             (is (= [[1000]]
                    (mt/rows (client/client :get 202 (dashcard-url dashcard {:params {:date nil}})))))
             (testing "check this is different to when a non-nil value is provided"
               (is (= [[138]]
                      (mt/rows (client/client :get 202 (dashcard-url dashcard {:params {:date "Q2-2014"}})))))))
           (testing "an empty string value is invalid and should result in an error"
             (is (= "You must specify a value for :date in the JWT."
                    (client/client :get 400 (dashcard-url dashcard {:params {:date ""}})))))))))))


;;; -------------------------------------------------- Other Tests ---------------------------------------------------

(deftest remove-embedding-params
  (testing (str "parameters that are not in the `embedding-params` map at all should get removed by "
                "`remove-locked-and-disabled-params`")
    (is (= {:parameters []}
           (#'api.embed/remove-locked-and-disabled-params {:parameters {:slug "foo"}} {})))))


(deftest make-sure-that-multiline-series-word-as-expected---4768-
  (testing "make sure that multiline series word as expected (#4768)"
    (with-embedding-enabled-and-new-secret-key
      (t2.with-temp/with-temp [Card series-card {:dataset_query {:database (mt/id)
                                                                 :type     :query
                                                                 :query    {:source-table (mt/id :venues)}}}]
        (with-temp-dashcard [dashcard {:dash {:enable_embedding true}}]
          (t2.with-temp/with-temp [DashboardCardSeries _ {:dashboardcard_id (u/the-id dashcard)
                                                          :card_id          (u/the-id series-card)
                                                          :position         0}]
            (is (= "completed"
                   (:status (client/client :get 202 (str (dashcard-url (assoc dashcard :card_id (u/the-id series-card))))))))))))))

;;; ------------------------------- GET /api/embed/card/:token/field/:field/values nil --------------------------------

(defn- field-values-url [card-or-dashboard field-or-id]
  (str
   "embed/"
   (condp mi/instance-of? card-or-dashboard
     Card      (str "card/"      (card-token card-or-dashboard))
     Dashboard (str "dashboard/" (dash-token card-or-dashboard)))
   "/field/"
   (u/the-id field-or-id)
   "/values"))

(defn- do-with-embedding-enabled-and-temp-card-referencing {:style/indent 2} [table-kw field-kw f]
  (with-embedding-enabled-and-new-secret-key
    (t2.with-temp/with-temp [Card card (assoc (public-test/mbql-card-referencing table-kw field-kw)
                                        :enable_embedding true)]
      (f card))))

(defmacro ^:private with-embedding-enabled-and-temp-card-referencing
  {:style/indent 3}
  [table-kw field-kw [card-binding] & body]
  `(do-with-embedding-enabled-and-temp-card-referencing ~table-kw ~field-kw
     (fn [~(or card-binding '_)]
       ~@body)))

;; should be able to fetch values for a Field referenced by a public Card
(deftest should-be-able-to-fetch-values-for-a-field-referenced-by-a-public-card
  (field-values/clear-field-values-for-field! (mt/id :venues :name))
  (is (= {:values          [["20th Century Cafe"]
                            ["25°"]
                            ["33 Taps"]
                            ["800 Degrees Neapolitan Pizzeria"]
                            ["BCD Tofu House"]]
          :field_id        (mt/id :venues :name)
          :has_more_values false}
         (with-embedding-enabled-and-temp-card-referencing :venues :name [card]
           (-> (client/client :get 200 (field-values-url card (mt/id :venues :name)))
               (update :values (partial take 5)))))))

;; but for Fields that are not referenced we should get an Exception
(deftest but-for-fields-that-are-not-referenced-we-should-get-an-exception
  (is (= "Not found."
         (with-embedding-enabled-and-temp-card-referencing :venues :name [card]
           (client/client :get 400 (field-values-url card (mt/id :venues :price)))))))

;; Endpoint should fail if embedding is disabled
(deftest endpoint-should-fail-if-embedding-is-disabled
  (is (= "Embedding is not enabled."
         (with-embedding-enabled-and-temp-card-referencing :venues :name [card]
           (mt/with-temporary-setting-values [enable-embedding false]
             (client/client :get 400 (field-values-url card (mt/id :venues :name))))))))

(deftest embedding-not-enabled-message
  (is (= "Embedding is not enabled for this object."
         (with-embedding-enabled-and-temp-card-referencing :venues :name [card]
           (t2/update! Card (u/the-id card) {:enable_embedding false})
           (client/client :get 400 (field-values-url card (mt/id :venues :name)))))))

(deftest card-param-values
  (letfn [(search [card param-key prefix]
            (client/client :get 200 (format "embed/card/%s/params/%s/search/%s"
                                            (card-token card) param-key prefix)))
          (dropdown [card param-key]
            (client/client :get 200 (format "embed/card/%s/params/%s/values"
                                            (card-token card) param-key)))]
    (mt/with-temporary-setting-values [enable-embedding true]
      (with-new-secret-key
        (api.card-test/with-card-param-values-fixtures [{:keys [card field-filter-card param-keys]}]
          (t2/update! Card (:id field-filter-card)
                      {:enable_embedding true
                       :embedding_params (zipmap (map :slug (:parameters field-filter-card))
                                                 (repeat "enabled"))})
          (t2/update! Card (:id card)
                      {:enable_embedding true
                       :embedding_params (zipmap (map :slug (:parameters card))
                                                 (repeat "enabled"))})
          (testing "field filter based param"
            (let [response (dropdown field-filter-card (:field-values param-keys))]
              (is (false? (:has_more_values response)))
              (is (set/subset? #{["20th Century Cafe"] ["33 Taps"]}
                               (-> response :values set))))
            (let [response (search field-filter-card (:field-values param-keys) "bar")]
              (is (set/subset? #{["Barney's Beanery"] ["bigmista's barbecue"]}
                               (-> response :values set)))
              (is (not ((into #{} (mapcat identity) (:values response)) "The Virgil")))))
          (testing "static based param"
            (let [response (dropdown card (:static-list param-keys))]
              (is (= {:has_more_values false,
                      :values          [["African"] ["American"] ["Asian"]]}
                     response)))
            (let [response (search card (:static-list param-keys) "af")]
              (is (= {:has_more_values false,
                      :values          [["African"]]}
                     response))))
          (testing "card based param"
            (let [response (dropdown card (:card param-keys))]
              (is (= {:values          [["Brite Spot Family Restaurant"] ["Red Medicine"]
                                        ["Stout Burgers & Beers"] ["The Apple Pan"] ["Wurstküche"]]
                      :has_more_values false}
                     response)))
            (let [response (search card (:card param-keys) "red")]
              (is (= {:has_more_values false,
                      :values          [["Red Medicine"]]}
                     response)))))))))

;;; ----------------------------- GET /api/embed/dashboard/:token/field/:field/values nil -----------------------------

(defn- do-with-embedding-enabled-and-temp-dashcard-referencing {:style/indent 2} [table-kw field-kw f]
  (with-embedding-enabled-and-new-secret-key
    (mt/with-temp [Dashboard     dashboard {:enable_embedding true}
                   Card          card      (public-test/mbql-card-referencing table-kw field-kw)
                   DashboardCard dashcard  {:dashboard_id       (u/the-id dashboard)
                                            :card_id            (u/the-id card)
                                            :parameter_mappings [{:card_id (u/the-id card)
                                                                  :target  [:dimension
                                                                            [:field
                                                                             (mt/id table-kw field-kw) nil]]}]}]
      (f dashboard card dashcard))))


(defmacro ^:private with-embedding-enabled-and-temp-dashcard-referencing
  {:style/indent 3}
  [table-kw field-kw [dash-binding card-binding dashcard-binding] & body]
  `(do-with-embedding-enabled-and-temp-dashcard-referencing ~table-kw ~field-kw
     (fn [~(or dash-binding '_) ~(or card-binding '_) ~(or dashcard-binding '_)]
       ~@body)))

;; should be able to use it when everything is g2g
(deftest should-be-able-to-use-it-when-everything-is-g2g
  (is (= {:values          [["20th Century Cafe"]
                            ["25°"]
                            ["33 Taps"]
                            ["800 Degrees Neapolitan Pizzeria"]
                            ["BCD Tofu House"]]
          :field_id        (mt/id :venues :name)
          :has_more_values false}
         (with-embedding-enabled-and-temp-dashcard-referencing :venues :name [dashboard]
           (-> (client/client :get 200 (field-values-url dashboard (mt/id :venues :name)))
               (update :values (partial take 5)))))))

;; shound NOT be able to use the endpoint with a Field not referenced by the Dashboard
(deftest shound-not-be-able-to-use-the-endpoint-with-a-field-not-referenced-by-the-dashboard
  (is (= "Not found."
         (with-embedding-enabled-and-temp-dashcard-referencing :venues :name [dashboard]
           (client/client :get 400 (field-values-url dashboard (mt/id :venues :price)))))))

;; Endpoint should fail if embedding is disabled
(deftest field-values-endpoint-should-fail-if-embedding-is-disabled
  (is (= "Embedding is not enabled."
         (with-embedding-enabled-and-temp-dashcard-referencing :venues :name [dashboard]
           (mt/with-temporary-setting-values [enable-embedding false]
             (client/client :get 400 (field-values-url dashboard (mt/id :venues :name))))))))


;; Endpoint should fail if embedding is disabled for the Dashboard
(deftest endpoint-should-fail-if-embedding-is-disabled-for-the-dashboard
  (is (= "Embedding is not enabled for this object."
         (with-embedding-enabled-and-temp-dashcard-referencing :venues :name [dashboard]
           (t2/update! Dashboard (u/the-id dashboard) {:enable_embedding false})
           (client/client :get 400 (field-values-url dashboard (mt/id :venues :name)))))))


;;; --------------------------------------------- Field search endpoints ---------------------------------------------

(defn- field-search-url [card-or-dashboard field-or-id search-field-or-id]
  (str "embed/"
       (condp mi/instance-of? card-or-dashboard
         Card      (str "card/"      (card-token card-or-dashboard))
         Dashboard (str "dashboard/" (dash-token card-or-dashboard)))
       "/field/" (u/the-id field-or-id)
       "/search/" (u/the-id search-field-or-id)))

(deftest field-search-test
  (testing
    (letfn [(tests [model object]
              (is (= [[93 "33 Taps"]]
                     (client/client :get 200 (field-search-url object (mt/id :venues :id) (mt/id :venues :name))
                                    :value "33 T")))

              (testing "if search field isn't allowed to be used with the other Field endpoint should return exception"
                (is (= "Invalid Request."
                       (client/client :get 400 (field-search-url object (mt/id :venues :id) (mt/id :venues :price))
                                      :value "33 T"))))

              (testing "Endpoint should fail if embedding is disabled"
                (mt/with-temporary-setting-values [enable-embedding false]
                  (is (= "Embedding is not enabled."
                         (client/client :get 400 (field-search-url object (mt/id :venues :id) (mt/id :venues :name))
                                        :value "33 T")))))

              (testing "Endpoint should fail if embedding is disabled for the object"
                (t2/update! model (u/the-id object) {:enable_embedding false})
                (is (= "Embedding is not enabled for this object."
                       (client/client :get 400 (field-search-url object (mt/id :venues :id) (mt/id :venues :name))
                                      :value "33 T")))))]
      (testing "GET /api/embed/card/:token/field/:field/search/:search-field-id nil"
        (testing "Search for Field values for a Card"
          (with-embedding-enabled-and-temp-card-referencing :venues :id [card]
            (tests Card card))))
      (testing "GET /api/embed/dashboard/:token/field/:field/search/:search-field-id nil"
        (testing "Search for Field values for a Dashboard"
          (with-embedding-enabled-and-temp-dashcard-referencing :venues :id [dashboard]
            (tests Dashboard dashboard)))))))


;;; ----------------------- GET /api/embed/card/:token/field/:field/remapping/:remapped-id nil ------------------------

(defn- field-remapping-url [card-or-dashboard field-or-id remapped-field-or-id]
  (str "embed/"
       (condp mi/instance-of? card-or-dashboard
         Card      (str "card/"      (card-token card-or-dashboard))
         Dashboard (str "dashboard/" (dash-token card-or-dashboard)))
       "/field/" (u/the-id field-or-id)
       "/remapping/" (u/the-id remapped-field-or-id)))

(deftest field-remapping-test
  (letfn [(tests [model object]
            (testing (str "we should be able to use the API endpoint and get the same results we get by calling the "
                          "function above directly")
              (is (= [10 "Fred 62"]
                     (client/client :get 200 (field-remapping-url object (mt/id :venues :id) (mt/id :venues :name))
                                    :value "10"))))
            (testing " ...or if the remapping Field isn't allowed to be used with the other Field"
              (is (= "Invalid Request."
                     (client/client :get 400 (field-remapping-url object (mt/id :venues :id) (mt/id :venues :price))
                                    :value "10"))))

            (testing " ...or if embedding is disabled"
              (mt/with-temporary-setting-values [enable-embedding false]
                (is (= "Embedding is not enabled."
                       (client/client :get 400 (field-remapping-url object (mt/id :venues :id) (mt/id :venues :name))
                                      :value "10")))))

            (testing " ...or if embedding is disabled for the Card/Dashboard"
              (t2/update! model (u/the-id object) {:enable_embedding false})
              (is (= "Embedding is not enabled for this object."
                     (client/client :get 400 (field-remapping-url object (mt/id :venues :id) (mt/id :venues :name))
                                    :value "10")))))]

    (testing "GET /api/embed/card/:token/field/:field/remapping/:remapped-id nil"
      (testing "Get remapped Field values for a Card"
        (with-embedding-enabled-and-temp-card-referencing :venues :id [card]
          (tests Card card)))
      (testing "Shouldn't work if Card doesn't reference the Field in question"
        (with-embedding-enabled-and-temp-card-referencing :venues :price [card]
          (is (= "Not found."
                 (client/client :get 400 (field-remapping-url card (mt/id :venues :id) (mt/id :venues :name))
                                :value "10"))))))

    (testing "GET /api/embed/dashboard/:token/field/:field/remapping/:remapped-id nil"
      (testing "Get remapped Field values for a Dashboard"
        (with-embedding-enabled-and-temp-dashcard-referencing :venues :id [dashboard]
          (tests Dashboard dashboard)))
      (testing "Shouldn't work if Dashboard doesn't reference the Field in question"
        (with-embedding-enabled-and-temp-dashcard-referencing :venues :price [dashboard]
          (is (= "Not found."
                 (client/client :get 400 (field-remapping-url dashboard (mt/id :venues :id) (mt/id :venues :name))
                                :value "10"))))))))

;;; ------------------------------------------------ Chain filtering -------------------------------------------------

(defn- do-with-chain-filter-fixtures [f]
  (with-embedding-enabled-and-new-secret-key
    (api.dashboard-test/with-chain-filter-fixtures [{:keys [dashboard], :as m}]
      (t2/update! Dashboard (u/the-id dashboard) {:enable_embedding true})
      (letfn [(token [params]
                (dash-token dashboard (when params {:params params})))
              (values-url [& [params param-key]]
                (format "embed/dashboard/%s/params/%s/values"
                        (token params) (or param-key "_CATEGORY_ID_")))
              (search-url [& [params param-key query]]
                (format "embed/dashboard/%s/params/%s/search/%s"
                        (token params) (or param-key "_CATEGORY_NAME_") (or query "food")))]
        (f (assoc m
                  :token token
                  :values-url values-url
                  :search-url search-url))))))

(defmacro ^:private with-chain-filter-fixtures [[binding] & body]
  `(do-with-chain-filter-fixtures (fn [~binding] ~@body)))

(deftest chain-filter-embedding-disabled-test
  (with-chain-filter-fixtures [{:keys [dashboard values-url search-url]}]
    (testing "without embedding enabled for dashboard"
      (t2/update! Dashboard (u/the-id dashboard) {:enable_embedding false})
      (testing "GET /api/embed/dashboard/:token/params/:param-key/values"
        (is (= "Embedding is not enabled for this object."
               (client/client :get 400 (values-url)))))
      (testing "GET /api/embed/dashboard/:token/params/:param-key/search/:query"
        (is (= "Embedding is not enabled for this object."
               (client/client :get 400 (search-url))))))))

(deftest chain-filter-random-params-test
  (with-chain-filter-fixtures [{:keys [values-url search-url]}]
    (testing "Requests should fail if parameter is not explicitly enabled"
      (testing "\nGET /api/embed/dashboard/:token/params/:param-key/values"
        (is (= "Cannot search for values: \"category_id\" is not an enabled parameter."
               (client/client :get 400 (values-url)))))
      (testing "\nGET /api/embed/dashboard/:token/params/:param-key/search/:query"
        (is (= "Cannot search for values: \"category_name\" is not an enabled parameter."
               (client/client :get 400 (search-url))))))))

(deftest params-with-static-list-test
  (testing "embedding with parameter that has source is a static list"
    (with-chain-filter-fixtures [{:keys [dashboard values-url search-url]}]
      (t2/update! Dashboard (:id dashboard)
        {:embedding_params {"static_category" "enabled", "static_category_label" "enabled"}})
      (testing "Should work if the param we're fetching values for is enabled"
        (testing "\nGET /api/embed/dashboard/:token/params/:param-key/values"
          (is (= {:values          [["African"] ["American"] ["Asian"]]
                  :has_more_values false}
                 (client/client :get 200 (values-url {} "_STATIC_CATEGORY_")))))
        (testing "\nGET /api/embed/dashboard/:token/params/:param-key/search/:query"
          (is (= {:values          [["African" "Af"]]
                  :has_more_values false}
                 (client/client :get 200 (search-url {} "_STATIC_CATEGORY_LABEL_" "AF")))))))))

(deftest chain-filter-enabled-params-test
  (with-chain-filter-fixtures [{:keys [dashboard values-url search-url]}]
    (t2/update! Dashboard (:id dashboard)
      {:embedding_params {"category_id" "enabled", "category_name" "enabled", "price" "enabled"}})
    (testing "Should work if the param we're fetching values for is enabled"
      (testing "\nGET /api/embed/dashboard/:token/params/:param-key/values"
        (is (= {:values          [[2] [3] [4] [5] [6]]
                :has_more_values false}
               (chain-filer-test/take-n-values 5 (client/client :get 200 (values-url))))))
      (testing "\nGET /api/embed/dashboard/:token/params/:param-key/search/:query"
        (is (= {:values          [["Fast Food"] ["Food Truck"] ["Seafood"]]
                :has_more_values false}
               (chain-filer-test/take-n-values 3 (client/client :get 200 (search-url)))))))

    (testing "If an ENABLED constraint param is present in the JWT, that's ok"
      (testing "\nGET /api/embed/dashboard/:token/params/:param-key/values"
        (is (= {:values          [[40] [67]]
                :has_more_values false}
               (client/client :get 200 (values-url {"price" 4})))))
      (testing "\nGET /api/embed/dashboard/:token/params/:param-key/search/:query"
        (is (= {:values          []
                :has_more_values false}
               (client/client :get 200 (search-url {"price" 4}))))))

    (testing "If an ENABLED param is present in query params but *not* the JWT, that's ok"
      (testing "\nGET /api/embed/dashboard/:token/params/:param-key/values"
        (is (= {:values          [[40] [67]]
                :has_more_values false}
               (client/client :get 200 (str (values-url) "?_PRICE_=4")))))
      (testing "\nGET /api/embed/dashboard/:token/params/:param-key/search/:query"
        (is (= {:values          []
                :has_more_values false}
               (client/client :get 200 (str (search-url) "?_PRICE_=4"))))))

    (testing "If ENABLED param is present in both JWT and the URL, the request should fail"
      (doseq [url-fn [values-url search-url]
              :let   [url (str (url-fn {"price" 4}) "?_PRICE_=4")]]
        (testing (str "\n" url)
          (is (= "You can't specify a value for :price if it's already set in the JWT."
                 (client/client :get 400 url))))))))

(deftest chain-filter-ignore-current-user-permissions-test
  (testing "Should not fail if request is authenticated but current user does not have data permissions"
    (mt/with-temp-copy-of-db
      (perms/revoke-data-perms! (perms-group/all-users) (mt/db))
      (with-chain-filter-fixtures [{:keys [dashboard values-url search-url]}]
        (t2/update! Dashboard (:id dashboard)
          {:embedding_params {"category_id" "enabled", "category_name" "enabled", "price" "enabled"}})
        (testing "Should work if the param we're fetching values for is enabled"
          (testing "\nGET /api/embed/dashboard/:token/params/:param-key/values"
            (is (= {:values          [[2] [3] [4] [5] [6]]
                    :has_more_values false}
                   (chain-filer-test/take-n-values 5 (mt/user-http-request :rasta :get 200 (values-url))))))
          (testing "\nGET /api/embed/dashboard/:token/params/:param-key/search/:query"
            (is (= {:values          [["Fast Food"] ["Food Truck"] ["Seafood"]]
                    :has_more_values false}
                   (chain-filer-test/take-n-values 3 (mt/user-http-request :rasta :get 200 (search-url)))))))))))

(deftest chain-filter-locked-params-test
  (with-chain-filter-fixtures [{:keys [dashboard values-url search-url]}]
    (testing "Requests should fail if searched param is locked"
      (t2/update! Dashboard (:id dashboard)
        {:embedding_params {"category_id" "locked", "category_name" "locked"}})
      (doseq [url [(values-url) (search-url)]]
        (testing (str "\n" url)
          (is (re= #"Cannot search for values: \"category_(?:(?:name)|(?:id))\" is not an enabled parameter."
                   (client/client :get 400 url))))))

    (testing "Search param enabled\n"
      (t2/update! Dashboard (:id dashboard)
        {:embedding_params {"category_id" "enabled", "category_name" "enabled", "price" "locked"}})

      (testing "Requests should fail if the token is missing a locked parameter"
        (doseq [url [(values-url) (search-url)]]
          (testing (str "\n" url)
            (is (= "You must specify a value for :price in the JWT."
                   (client/client :get 400 url))))))

      (testing "if `:locked` param is supplied, request should succeed"
        (testing "\nGET /api/embed/dashboard/:token/params/:param-key/values"
          (is (= {:values          [[40] [67]]
                  :has_more_values false}
                 (client/client :get 200 (values-url {"price" 4})))))
        (testing "\nGET /api/embed/dashboard/:token/params/:param-key/search/:query"
          (is (= {:values          []
                  :has_more_values false}
                 (client/client :get 200 (search-url {"price" 4}))))))

      (testing "if `:locked` parameter is present in URL params, request should fail"
        (doseq [url-fn [values-url search-url]
                :let   [url (url-fn {"price" 4})]]
          (testing (str "\n" url)
            (is (= "You can only specify a value for :price in the JWT."
                   (client/client :get 400 (str url "?_PRICE_=4"))))))))))

(deftest chain-filter-disabled-params-test
  (with-chain-filter-fixtures [{:keys [dashboard values-url search-url]}]
    (testing "Requests should fail if searched param is disabled"
      (t2/update! Dashboard (:id dashboard)
        {:embedding_params {"category_id" "disabled", "category_name" "disabled"}})
      (doseq [url [(values-url) (search-url)]]
        (testing (str "\n" url)
          (is (re= #"Cannot search for values: \"category_(?:(?:name)|(?:id))\" is not an enabled parameter\."
                   (client/client :get 400 url))))))

    (testing "Search param enabled\n"
      (t2/update! Dashboard (:id dashboard)
        {:embedding_params {"category_id" "enabled", "category_name" "enabled", "price" "disabled"}})

      (testing "Requests should fail if the token has a disabled parameter"
        (doseq [url-fn [values-url search-url]
                :let   [url (url-fn {"price" 4})]]
          (testing (str "\n" url)
            (is (= "You're not allowed to specify a value for :price."
                   (client/client :get 400 url))))))

      (testing "Requests should fail if the URL has a disabled parameter"
        (doseq [url-fn [values-url search-url]
                :let   [url (str (url-fn) "?_PRICE_=4")]]
          (testing (str "\n" url)
            (is (= "You're not allowed to specify a value for :price."
                   (client/client :get 400 url)))))))))

;; Pivot tables

(defn- pivot-card-query-url [card response-format & [additional-token-params]]
  (str "/embed/pivot/card/"
       (card-token card additional-token-params)
       "/query"
       response-format))

(deftest pivot-embed-query-test
  (mt/test-drivers (api.pivots/applicable-drivers)
    (mt/dataset sample-dataset
      (testing "GET /api/embed/pivot/card/:token/query"
        (testing "check that the endpoint doesn't work if embedding isn't enabled"
          (mt/with-temporary-setting-values [enable-embedding false]
            (with-new-secret-key
              (with-temp-card [card (api.pivots/pivot-card)]
                (is (= "Embedding is not enabled."
                       (client/client :get 400 (pivot-card-query-url card ""))))))))

        (with-embedding-enabled-and-new-secret-key
          (let [expected-status 202]
            (testing "it should be possible to run a Card successfully if you jump through the right hoops..."
              (with-temp-card [card (merge {:enable_embedding true} (api.pivots/pivot-card))]
                (let [result (client/client :get expected-status (pivot-card-query-url card "") {:request-options nil})
                      rows   (mt/rows result)]
                  (is (nil? (:row_count result))) ;; row_count isn't included in public endpoints
                  (is (= "completed" (:status result)))
                  (is (= 6 (count (get-in result [:data :cols]))))
                  (is (= 1144 (count rows)))))))

          (testing "check that if embedding *is* enabled globally but not for the Card the request fails"
            (with-temp-card [card (api.pivots/pivot-card)]
              (is (= "Embedding is not enabled for this object."
                     (client/client :get 400 (pivot-card-query-url card ""))))))

          (testing (str "check that if embedding is enabled globally and for the object that requests fail if they are "
                        "signed with the wrong key")
            (with-temp-card [card (merge {:enable_embedding true} (api.pivots/pivot-card))]
              (is (= "Message seems corrupt or manipulated"
                     (client/client :get 400 (with-new-secret-key (pivot-card-query-url card ""))))))))))))

(defn- pivot-dashcard-url [dashcard & [additional-token-params]]
  (str "embed/pivot/dashboard/" (dash-token (:dashboard_id dashcard) additional-token-params)
       "/dashcard/" (u/the-id dashcard)
       "/card/" (:card_id dashcard)))

(deftest pivot-dashcard-success-test
  (mt/test-drivers (api.pivots/applicable-drivers)
    (mt/dataset sample-dataset
      (with-embedding-enabled-and-new-secret-key
        (with-temp-dashcard [dashcard {:dash     {:enable_embedding true, :parameters []}
                                       :card     (api.pivots/pivot-card)
                                       :dashcard {:parameter_mappings []}}]
          (let [result (client/client :get 202 (pivot-dashcard-url dashcard))
                rows   (mt/rows result)]
            (is (nil? (:row_count result))) ;; row_count isn't included in public endpoints
            (is (= "completed" (:status result)))
            (is (= 6 (count (get-in result [:data :cols]))))
            (is (= 1144 (count rows)))))))))

(deftest pivot-dashcard-embedding-disabled-test
  (mt/dataset sample-dataset
    (mt/with-temporary-setting-values [enable-embedding false]
      (with-new-secret-key
        (with-temp-dashcard [dashcard {:dash     {:parameters []}
                                       :card     (api.pivots/pivot-card)
                                       :dashcard {:parameter_mappings []}}]
          (is (= "Embedding is not enabled."
                 (client/client :get 400 (pivot-dashcard-url dashcard)))))))))

(deftest pivot-dashcard-embedding-disabled-for-card-test
  (mt/dataset sample-dataset
    (with-embedding-enabled-and-new-secret-key
      (with-temp-dashcard [dashcard {:dash     {:parameters []}
                                     :card     (api.pivots/pivot-card)
                                     :dashcard {:parameter_mappings []}}]
        (is (= "Embedding is not enabled for this object."
               (client/client :get 400 (pivot-dashcard-url dashcard))))))))

(deftest pivot-dashcard-signing-check-test
  (mt/dataset sample-dataset
    (testing (str "check that if embedding is enabled globally and for the object that requests fail if they are signed "
                  "with the wrong key")
      (with-embedding-enabled-and-new-secret-key
        (with-temp-dashcard [dashcard {:dash     {:enable_embedding true, :parameters []}
                                       :card     (api.pivots/pivot-card)
                                       :dashcard {:parameter_mappings []}}]
          (is (= "Message seems corrupt or manipulated"
                 (client/client :get 400 (with-new-secret-key (pivot-dashcard-url dashcard))))))))))

(deftest pivot-dashcard-locked-params-test
  (mt/dataset sample-dataset
    (mt/with-ensure-with-temp-no-transaction!
      (with-embedding-enabled-and-new-secret-key
        (with-temp-dashcard [dashcard {:dash     {:enable_embedding true
                                                  :embedding_params {:abc "locked"}
                                                  :parameters       [{:id     "_ORDER_ID_"
                                                                      :name   "Order ID"
                                                                      :slug   "abc"
                                                                      :type   "id"
                                                                      :target [:dimension (mt/id :orders :id)]}]}
                                       :card     (api.pivots/pivot-card)
                                       :dashcard {:parameter_mappings []}}]
          (testing (str "check that if embedding is enabled globally and for the object requests fail if the token is "
                        "missing a `:locked` parameter")
            (is (= "You must specify a value for :abc in the JWT."
                   (client/client :get 400 (pivot-dashcard-url dashcard)))))

          (testing "if `:locked` param is supplied, request should succeed"
            (let [result (client/client :get 202 (pivot-dashcard-url dashcard {:params {:abc 100}}))
                  rows   (mt/rows result)]
              (is (nil? (:row_count result))) ;; row_count isn't included in public endpoints
              (is (= "completed" (:status result)))
              (is (= 6 (count (get-in result [:data :cols]))))
              (is (= 1144 (count rows)))))

          (testing "if `:locked` parameter is present in URL params, request should fail"
            (is (= "You must specify a value for :abc in the JWT."
                   (client/client :get 400 (str (pivot-dashcard-url dashcard) "?abc=100"))))))))))

(deftest pivot-dashcard-disabled-params-test
  (mt/dataset sample-dataset
    (with-embedding-enabled-and-new-secret-key
      (with-temp-dashcard [dashcard {:dash     {:enable_embedding true
                                                :embedding_params {:abc "disabled"}
                                                :parameters       []}
                                     :card     (api.pivots/pivot-card)
                                     :dashcard {:parameter_mappings []}}]
        (testing (str "check that if embedding is enabled globally and for the object requests fail if they pass a "
                      "`:disabled` parameter")
          (is (= "You're not allowed to specify a value for :abc."
                 (client/client :get 400 (pivot-dashcard-url dashcard {:params {:abc 100}})))))

        (testing "If a `:disabled` param is passed in the URL the request should fail"
          (is (= "You're not allowed to specify a value for :abc."
                 (client/client :get 400 (str (pivot-dashcard-url dashcard) "?abc=200")))))))))

(deftest pivot-dashcard-enabled-params-test
  (mt/dataset sample-dataset
    (with-embedding-enabled-and-new-secret-key
      (with-temp-dashcard [dashcard {:dash     {:enable_embedding true
                                                :embedding_params {:abc "enabled"}
                                                :parameters       [{:id      "_ORDER_ID_"
                                                                    :name    "Order ID"
                                                                    :slug    "abc"
                                                                    :type    "id"
                                                                    :target  [:dimension (mt/id :orders :id)]}]}
                                     :card     (api.pivots/pivot-card)
                                     :dashcard {:parameter_mappings []}}]
        (testing "If `:enabled` param is present in both JWT and the URL, the request should fail"
          (is (= "You can't specify a value for :abc if it's already set in the JWT."
                 (client/client :get 400 (str (pivot-dashcard-url dashcard {:params {:abc 100}}) "?abc=200")))))

        (testing "If an `:enabled` param is present in the JWT, that's ok"
          (let [result (client/client :get 202 (pivot-dashcard-url dashcard {:params {:abc 100}}))
                rows   (mt/rows result)]
            (is (nil? (:row_count result))) ;; row_count isn't included in public endpoints
            (is (= "completed" (:status result)))
            (is (= 6 (count (get-in result [:data :cols]))))
            (is (= 1144 (count rows)))))

        (testing "If an `:enabled` param is present in URL params but *not* the JWT, that's ok"
          (let [result (client/client :get 202 (str (pivot-dashcard-url dashcard) "?abc=200"))
                rows   (mt/rows result)]
            (is (nil? (:row_count result))) ;; row_count isn't included in public endpoints
            (is (= "completed" (:status result)))
            (is (= 6 (count (get-in result [:data :cols]))))
            (is (= 1144 (count rows)))))))))

(deftest apply-slug->value-test
  (testing "For operator filter types treat a lone value as a one-value sequence (#20438)"
    (is (= (#'api.embed/apply-slug->value [{:type    :string/=
                                            :target  [:dimension [:template-tag "NAME"]]
                                            :name    "Name"
                                            :slug    "NAME"
                                            :default nil}]
                                          {:NAME ["Aaron Hand"]})
           (#'api.embed/apply-slug->value [{:type    :string/=
                                            :target  [:dimension [:template-tag "NAME"]]
                                            :name    "Name"
                                            :slug    "NAME"
                                            :default nil}]
                                          {:NAME "Aaron Hand"})))))

(deftest handle-single-params-for-operator-filters-test
  (testing "Query endpoints should work with a single URL parameter for an operator filter (#20438)"
    (mt/dataset sample-dataset
      (with-embedding-enabled-and-new-secret-key
        (t2.with-temp/with-temp [Card {card-id :id, :as card} {:dataset_query    (mt/native-query
                                                                                  {:query         "SELECT count(*) AS count FROM PUBLIC.PEOPLE WHERE true [[AND {{NAME}}]]"
                                                                                   :template-tags {"NAME"
                                                                                                   {:id           "9ddca4ca-3906-83fd-bc6b-8480ae9ab05e"
                                                                                                    :name         "NAME"
                                                                                                    :display-name "Name"
                                                                                                    :type         :dimension
                                                                                                    :dimension    [:field (mt/id :people :name) nil]
                                                                                                    :widget-type  :string/=
                                                                                                    :default      nil}}})
                                                               :enable_embedding true
                                                               :embedding_params {:NAME "enabled"}}]
          (testing "Card"
            (is (= [[1]]
                   (mt/rows (client/client :get 202 (card-query-url card "") :NAME "Hudson Borer"))
                   (mt/rows (client/client :get 202 (card-query-url card "") :NAME "Hudson Borer" :NAME "x")))))
          (testing "Dashcard"
            (mt/with-temp [Dashboard {dashboard-id :id} {:enable_embedding true
                                                         :embedding_params {:name "enabled"}
                                                         :parameters       [{:name      "Name"
                                                                             :slug      "name"
                                                                             :id        "_name_"
                                                                             :type      "string/="
                                                                             :sectionId "string"}]}

                           DashboardCard dashcard {:card_id            card-id
                                                   :dashboard_id       dashboard-id
                                                   :parameter_mappings [{:parameter_id "_name_"
                                                                         :card_id      card-id
                                                                         :target       [:dimension [:template-tag "NAME"]]}]}]
              (is (= [[1]]
                     (mt/rows (client/client :get 202 (dashcard-url dashcard) :name "Hudson Borer"))
                     (mt/rows (client/client :get 202 (dashcard-url dashcard) :name "Hudson Borer" :name "x")))))))))))

(deftest pass-numeric-param-as-number-test
  (testing "Embedded numeric params should work with numeric (as opposed to string) values in the JWT (#20845)"
    (mt/dataset sample-dataset
      (with-embedding-enabled-and-new-secret-key
        (t2.with-temp/with-temp [Card card {:dataset_query    (mt/native-query
                                                               {:query         "SELECT count(*) FROM orders WHERE quantity = {{qty_locked}}"
                                                                :template-tags {"qty_locked" {:name         "qty_locked"
                                                                                              :display-name "Quantity (Locked)"
                                                                                              :type         :number}}})
                                            :enable_embedding true
                                            :embedding_params {:qty_locked "locked"}}]
          (is (= [3443]
                 (mt/first-row (client/client :get 202 (card-query-url card "" {:params {:qty_locked 1}}))))))))))
