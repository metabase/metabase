(ns metabase.api.embed-test
  "Tests for /api/embed endpoints."
  (:require [buddy.sign.jwt :as jwt]
            [buddy.sign.util :as buddy-util]
            [clj-time.core :as time]
            [clojure.data.csv :as csv]
            [clojure.string :as str]
            [clojure.test :refer :all]
            [crypto.random :as crypto-random]
            [dk.ative.docjure.spreadsheet :as spreadsheet]
            [metabase.api.dashboard-test :as api.dashboard-test]
            [metabase.api.embed :as api.embed]
            [metabase.api.pivots :as api.pivots]
            [metabase.api.public-test :as public-test]
            [metabase.http-client :as client]
            [metabase.models :refer [Card Dashboard DashboardCard DashboardCardSeries]]
            [metabase.models.params.chain-filter-test :as chain-filer-test]
            [metabase.models.permissions :as perms]
            [metabase.models.permissions-group :as perms-group]
            [metabase.query-processor-test :as qp.test]
            [metabase.query-processor.middleware.constraints :as qp.constraints]
            [metabase.test :as mt]
            [metabase.util :as u]
            [schema.core :as s]
            [toucan.db :as db])
  (:import java.io.ByteArrayInputStream))

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
    (mt/with-temp Card [card m]
      (f card))))

(defmacro with-temp-card {:style/indent 1} [[binding & [card]] & body]
  `(do-with-temp-card
    ~card
    (fn [~binding]
      ~@body)))

(defn do-with-temp-dashcard [{:keys [dash card dashcard]} f]
  (with-temp-card [card card]
    (mt/with-temp* [Dashboard     [dashboard (merge
                                              (when-not (:parameters dash)
                                                {:parameters [{:id      "_VENUE_ID_"
                                                               :name    "Venue ID"
                                                               :slug    "venue_id"
                                                               :type    "id"
                                                               :target  [:dimension (mt/id :venues :id)]
                                                               :default nil}]})
                                              dash)]
                    DashboardCard [dashcard  (merge {:dashboard_id       (u/the-id dashboard)
                                                     :card_id            (u/the-id card)
                                                     :parameter_mappings (or (:parameter_mappings dashcard)
                                                                             [{:parameter_id "_VENUE_ID_"
                                                                               :card_id      (u/the-id card)
                                                                               :target       [:dimension [:field (mt/id :venues :id) nil]]}])}
                                                    dashcard)]]
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
  "DEPRECATED -- you should use `schema=` instead"
  ([actual]
   (is (= {:data       {:cols             [(mt/obj->json->obj (qp.test/aggregate-col :count))]
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

(defn dissoc-id-and-name {:style/indent 0} [obj]
  (dissoc obj :id :name))

(def successful-card-info
  "Data that should be returned if `GET /api/embed/card/:token` completes successfully (minus `:id` and `:name`).
   This should only be the bare minimum amount of info needed to display the Card, leaving out other data we wouldn't
   want the public to have access to."
  {:description            nil
   :display                "table"
   :visualization_settings {}
   :dataset_query          {:type "query"}
   :parameters             []
   :param_fields           nil})

(def successful-dashboard-info
  {:description nil, :parameters [], :ordered_cards [], :param_fields nil})

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

(deftest check-that-if-embedding--is--enabled-globally-but-not-for-the-card-the-request-fails
  (with-embedding-enabled-and-new-secret-key
    (with-temp-card [card]
      (is (= "Embedding is not enabled for this object."
             (client/client :get 400 (card-url card)))))))

(deftest global-embedding-requests-fail-with-wrong-key
  (testing (str "check that if embedding is enabled globally and for the object that requests fail if they are signed "
                "with the wrong key")
    (with-embedding-enabled-and-new-secret-key
      (with-temp-card [card {:enable_embedding true}]
        (is (= "Message seems corrupt or manipulated."
               (client/client :get 400 (with-new-secret-key (card-url card)))))))))

(deftest check-that-only-enabled-params-that-are-not-present-in-the-jwt-come-back
  (testing "check that only ENABLED params that ARE NOT PRESENT IN THE JWT come back"
    (with-embedding-enabled-and-new-secret-key
      (with-temp-card [card {:enable_embedding true
                             :dataset_query    {:database (mt/id)
                                                :type     :native
                                                :native   {:template-tags {:a {:type "date", :name "a", :display_name "a"}
                                                                           :b {:type "date", :name "b", :display_name "b"}
                                                                           :c {:type "date", :name "c", :display_name "c"}
                                                                           :d {:type "date", :name "d", :display_name "d"}}}}
                             :embedding_params {:a "locked", :b "disabled", :c "enabled", :d "enabled"}}]
        (is (= [{:id nil, :type "date/single", :target ["variable" ["template-tag" "d"]], :name "d", :slug "d", :default nil}]
               (:parameters (client/client :get 200 (card-url card {:params {:c 100}})))))))))


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
    (do-response-formats [response-format request-options]
      (testing "check that the endpoint doesn't work if embedding isn't enabled"
        (mt/with-temporary-setting-values [enable-embedding false]
          (with-new-secret-key
            (with-temp-card [card]
              (is (= "Embedding is not enabled."
                     (client/client :get 400 (card-query-url card response-format))))))))

      (with-embedding-enabled-and-new-secret-key
        (let [expected-status (response-format->status-code response-format)]
          (testing "it should be possible to run a Card successfully if you jump through the right hoops..."
            (with-temp-card [card {:enable_embedding true}]
              (test-query-results
               response-format
               (client/client :get expected-status (card-query-url card response-format)
                              {:request-options request-options}))))

          (testing (str "...but if the card has an invalid query we should just get a generic \"query failed\" "
                        "exception (rather than leaking query info)")
            (with-temp-card [card {:enable_embedding true, :dataset_query {:database (mt/id)
                                                                           :type     :native
                                                                           :native   {:query "SELECT * FROM XYZ"}}}]
              (is (= {:status     "failed"
                      :error      "An error occurred while running the query."
                      :error_type "invalid-query"}
                     (client/client :get expected-status (card-query-url card response-format)))))))

        (testing "check that if embedding *is* enabled globally but not for the Card the request fails"
          (with-temp-card [card]
            (is (= "Embedding is not enabled for this object."
                   (client/client :get 400 (card-query-url card response-format))))))

        (testing (str "check that if embedding is enabled globally and for the object that requests fail if they are "
                      "signed with the wrong key")
          (with-temp-card [card {:enable_embedding true}]
            (is (= "Message seems corrupt or manipulated."
                   (client/client :get 400 (with-new-secret-key (card-query-url card response-format)))))))))))


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
  (with-embedding-enabled-and-new-secret-key
    (with-temp-card [card {:enable_embedding true, :embedding_params {:venue_id "locked"}}]
      (do-response-formats [response-format request-options]
        (testing (str "check that if embedding is enabled globally and for the object requests fail if the token is "
                      "missing a `:locked` parameter")
          (is (= "You must specify a value for :venue_id in the JWT."
                 (client/client :get 400 (card-query-url card response-format)))))

        (testing "if `:locked` param is present, request should succeed"
          (test-query-results
           response-format
           (client/client :get (response-format->status-code response-format)
                          (card-query-url card response-format {:params {:venue_id 100}})
                          {:request-options request-options})))

        (testing "If `:locked` parameter is present in URL params, request should fail"
          (is (= "You can only specify a value for :venue_id in the JWT."
                 (client/client :get 400 (str (card-query-url card response-format {:params {:venue_id 100}}) "?venue_id=100")))))))))


(deftest card-disabled-params-test
  (with-embedding-enabled-and-new-secret-key
    (with-temp-card [card {:enable_embedding true, :embedding_params {:venue_id "disabled"}}]
      (do-response-formats [response-format request-options]
        (testing (str "check that if embedding is enabled globally and for the object requests fail if they pass a "
                      "`:disabled` parameter")
          (is (= "You're not allowed to specify a value for :venue_id."
                 (client/client :get 400 (card-query-url card response-format {:params {:venue_id 100}})))))

        (testing "If a `:disabled` param is passed in the URL the request should fail"
          (is (= "You're not allowed to specify a value for :venue_id."
                 (client/client :get 400 (str (card-query-url card response-format) "?venue_id=200")))))))))

(deftest card-enabled-params-test
  (with-embedding-enabled-and-new-secret-key
    (with-temp-card [card {:enable_embedding true, :embedding_params {:venue_id "enabled"}}]
      (do-response-formats [response-format request-options]
        (testing "If `:enabled` param is present in both JWT and the URL, the request should fail"
          (is (= "You can't specify a value for :venue_id if it's already set in the JWT."
                 (client/client :get 400 (str (card-query-url card response-format {:params {:venue_id 100}}) "?venue_id=200")))))

        (testing "If an `:enabled` param is present in the JWT, that's ok"
          (test-query-results
           response-format
           (client/client :get (response-format->status-code response-format)
                          (card-query-url card response-format {:params {:venue_id "enabled"}})
                          {:request-options request-options})))

        (testing "If an `:enabled` param is present in URL params but *not* the JWT, that's ok"
          (test-query-results
           response-format
           (client/client :get (response-format->status-code response-format)
                          (str (card-query-url card response-format) "?venue_id=200")
                          {:request-options request-options})))))))

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
      (mt/with-temp Card [card (card-with-date-field-filter)]
        (is (= "count\n107\n"
               (client/client :get 200 (str (card-query-url card "/csv") "?date=Q1-2014"))))))))

(deftest csv-forward-url-test
  (with-embedding-enabled-and-new-secret-key
    (mt/with-temp Card [card (card-with-date-field-filter)]
      ;; make sure the URL doesn't include /api/ at the beginning like it normally would
      (binding [client/*url-prefix* (str/replace client/*url-prefix* #"/api/$" "/")]
        (mt/with-temporary-setting-values [site-url client/*url-prefix*]
          (is (= "count\n107\n"
                 (client/client :get 200 (str "embed/question/" (card-token card) ".csv?date=Q1-2014")))))))))


;;; ---------------------------------------- GET /api/embed/dashboard/:token -----------------------------------------

(defn- dashboard-url [dashboard & [additional-token-params]]
  (str "embed/dashboard/" (dash-token dashboard additional-token-params)))

(deftest it-should-be-possible-to-call-this-endpoint-successfully
  (with-embedding-enabled-and-new-secret-key
    (mt/with-temp Dashboard [dash {:enable_embedding true}]
      (is (= successful-dashboard-info
             (dissoc-id-and-name
               (client/client :get 200 (dashboard-url dash))))))))

(deftest we-should-fail-when-attempting-to-use-an-expired-token-2
  (with-embedding-enabled-and-new-secret-key
    (mt/with-temp Dashboard [dash {:enable_embedding true}]
      (is (re= #"^Token is expired.*"
               (client/client :get 400 (dashboard-url dash {:exp (buddy-util/to-timestamp yesterday)})))))))

(deftest check-that-the-dashboard-endpoint-doesn-t-work-if-embedding-isn-t-enabled
  (mt/with-temporary-setting-values [enable-embedding false]
    (with-new-secret-key
      (mt/with-temp Dashboard [dash]
        (is (= "Embedding is not enabled."
               (client/client :get 400 (dashboard-url dash))))))))

(deftest check-that-if-embedding--is--enabled-globally-but-not-for-the-dashboard-the-request-fails
  (with-embedding-enabled-and-new-secret-key
    (mt/with-temp Dashboard [dash]
      (is (= "Embedding is not enabled for this object."
             (client/client :get 400 (dashboard-url dash)))))))

(deftest global-embedding-check-key
  (testing (str "check that if embedding is enabled globally and for the object that requests fail if they are signed "
                "with the wrong key")
    (with-embedding-enabled-and-new-secret-key
      (mt/with-temp Dashboard [dash {:enable_embedding true}]
        (is (= "Message seems corrupt or manipulated."
               (client/client :get 400 (with-new-secret-key (dashboard-url dash)))))))))

(deftest only-enabled-params-that-are-not-present-in-the-jwt-come-back
  (testing "check that only ENABLED params that ARE NOT PRESENT IN THE JWT come back"
    (with-embedding-enabled-and-new-secret-key
      (mt/with-temp Dashboard [dash {:enable_embedding true
                                     :embedding_params {:a "locked", :b "disabled", :c "enabled", :d "enabled"}
                                     :parameters       [{:id "_a", :slug "a", :name "a", :type "date"}
                                                        {:id "_b", :slug "b", :name "b", :type "date"}
                                                        {:id "_c", :slug "c", :name "c", :type "date"}
                                                        {:id "_d", :slug "d", :name "d", :type "date"}]}]
        (is (= [{:id "_d", :slug "d", :name "d", :type "date"}]
               (:parameters (client/client :get 200 (dashboard-url dash {:params {:c 100}})))))))))


;;; ---------------------- GET /api/embed/dashboard/:token/dashcard/:dashcard-id/card/:card-id -----------------------

(defn- dashcard-url [dashcard & [additional-token-params]]
  (str "embed/dashboard/" (dash-token (:dashboard_id dashcard) additional-token-params)
       "/dashcard/" (u/the-id dashcard)
       "/card/" (:card_id dashcard)))

(deftest it-should-be-possible-to-run-a-card-successfully-if-you-jump-through-the-right-hoops---
  (testing "it should be possible to run a Card successfully if you jump through the right hoops..."
    (with-embedding-enabled-and-new-secret-key
      (with-temp-dashcard [dashcard {:dash {:enable_embedding true}}]
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
        (is (= "Message seems corrupt or manipulated."
               (client/client :get 400 (with-new-secret-key (dashcard-url dashcard)))))))))

(deftest dashboard-locked-params-test
  (with-embedding-enabled-and-new-secret-key
    (with-temp-dashcard [dashcard {:dash {:enable_embedding true, :embedding_params {:venue_id "locked"}}}]
      (testing (str "check that if embedding is enabled globally and for the object requests fail if the token is "
                    "missing a `:locked` parameter")
        (is (= "You must specify a value for :venue_id in the JWT."
               (client/client :get 400 (dashcard-url dashcard)))))

      (testing "if `:locked` param is supplied, request should succeed"
        (is (schema= {:status   (s/eq "completed")
                      :data     {:rows     (s/eq [[1]])
                                 s/Keyword s/Any}
                      s/Keyword s/Any}
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
        (is (schema= {:status   (s/eq "completed")
                      :data     {:rows     (s/eq [[1]])
                                 s/Keyword s/Any}
                      s/Keyword s/Any}
                     (client/client :get 202 (dashcard-url dashcard {:params {:venue_id 50}})))))

      (testing "If an `:enabled` param is present in URL params but *not* the JWT, that's ok"
        (is (schema= {:status   (s/eq "completed")
                      :data     {:rows     (s/eq [[1]])
                                 s/Keyword s/Any}
                      s/Keyword s/Any}
                     (client/client :get 202 (str (dashcard-url dashcard) "?venue_id=1"))))))))


;;; -------------------------------------------------- Other Tests ---------------------------------------------------

(deftest remove-embedding-params
  (testing (str "parameters that are not in the `embedding-params` map at all should get removed by "
                "`remove-locked-and-disabled-params`")
    (is (= {:parameters []}
           (#'api.embed/remove-locked-and-disabled-params {:parameters {:slug "foo"}} {})))))


(deftest make-sure-that-multiline-series-word-as-expected---4768-
  (testing "make sure that multiline series word as expected (#4768)"
    (with-embedding-enabled-and-new-secret-key
      (mt/with-temp Card [series-card {:dataset_query {:database (mt/id)
                                                       :type     :query
                                                       :query    {:source-table (mt/id :venues)}}}]
        (with-temp-dashcard [dashcard {:dash {:enable_embedding true}}]
          (mt/with-temp DashboardCardSeries [series {:dashboardcard_id (u/the-id dashcard)
                                                     :card_id          (u/the-id series-card)
                                                     :position         0}]
            (is (= "completed"
                   (:status (client/client :get 202 (str (dashcard-url (assoc dashcard :card_id (u/the-id series-card))))))))))))))

;;; ------------------------------- GET /api/embed/card/:token/field/:field/values nil --------------------------------

(defn- field-values-url [card-or-dashboard field-or-id]
  (str
   "embed/"
   (condp instance? card-or-dashboard
     (class Card)      (str "card/"      (card-token card-or-dashboard))
     (class Dashboard) (str "dashboard/" (dash-token card-or-dashboard)))
   "/field/"
   (u/the-id field-or-id)
   "/values"))

(defn- do-with-embedding-enabled-and-temp-card-referencing {:style/indent 2} [table-kw field-kw f]
  (with-embedding-enabled-and-new-secret-key
    (mt/with-temp Card [card (assoc (public-test/mbql-card-referencing table-kw field-kw)
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
           (db/update! Card (u/the-id card) :enable_embedding false)
           (client/client :get 400 (field-values-url card (mt/id :venues :name)))))))

;;; ----------------------------- GET /api/embed/dashboard/:token/field/:field/values nil -----------------------------

(defn- do-with-embedding-enabled-and-temp-dashcard-referencing {:style/indent 2} [table-kw field-kw f]
  (with-embedding-enabled-and-new-secret-key
    (mt/with-temp* [Dashboard     [dashboard {:enable_embedding true}]
                    Card          [card      (public-test/mbql-card-referencing table-kw field-kw)]
                    DashboardCard [dashcard  {:dashboard_id       (u/the-id dashboard)
                                              :card_id            (u/the-id card)
                                              :parameter_mappings [{:card_id (u/the-id card)
                                                                    :target  [:dimension
                                                                              [:field
                                                                               (mt/id table-kw field-kw) nil]]}]}]]
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
           (db/update! Dashboard (u/the-id dashboard) :enable_embedding false)
           (client/client :get 400 (field-values-url dashboard (mt/id :venues :name)))))))


;;; --------------------------------------------- Field search endpoints ---------------------------------------------

(defn- field-search-url [card-or-dashboard field-or-id search-field-or-id]
  (str "embed/"
       (condp instance? card-or-dashboard
         (class Card)      (str "card/"      (card-token card-or-dashboard))
         (class Dashboard) (str "dashboard/" (dash-token card-or-dashboard)))
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
                (db/update! model (u/the-id object) :enable_embedding false)
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
       (condp instance? card-or-dashboard
         (class Card)      (str "card/"      (card-token card-or-dashboard))
         (class Dashboard) (str "dashboard/" (dash-token card-or-dashboard)))
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
              (db/update! model (u/the-id object) :enable_embedding false)
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
      (db/update! Dashboard (u/the-id dashboard) :enable_embedding true)
      (letfn [(token [params]
                (dash-token dashboard (when params {:params params})))
              (values-url [& [params]]
                (format "embed/dashboard/%s/params/_CATEGORY_ID_/values" (token params)))
              (search-url [& [params]]
                (format "embed/dashboard/%s/params/_CATEGORY_NAME_/search/food" (token params)))]
        (f (assoc m
                  :token token
                  :values-url values-url
                  :search-url search-url))))))

(defmacro ^:private with-chain-filter-fixtures [[binding] & body]
  `(do-with-chain-filter-fixtures (fn [~binding] ~@body)))

(deftest chain-filter-embedding-disabled-test
  (with-chain-filter-fixtures [{:keys [dashboard values-url search-url]}]
    (testing "without embedding enabled for dashboard"
      (db/update! Dashboard (u/the-id dashboard) :enable_embedding false)
      (testing "GET /api/embed/dashboard/:token/params/:param-key/values"
        (is (= "Embedding is not enabled for this object."
               (client/client :get 400 (values-url)))))
      (testing "GET /api/embed/dashboard/:token/params/:param-key/search/:query"
        (is (= "Embedding is not enabled for this object."
               (client/client :get 400 (search-url))))))))

(deftest chain-filter-random-params-test
  (with-chain-filter-fixtures [{:keys [dashboard values-url search-url]}]
    (testing "Requests should fail if parameter is not explicitly enabled"
      (testing "\nGET /api/embed/dashboard/:token/params/:param-key/values"
        (is (= "Cannot search for values: \"category_id\" is not an enabled parameter."
               (client/client :get 400 (values-url)))))
      (testing "\nGET /api/embed/dashboard/:token/params/:param-key/search/:query"
        (is (= "Cannot search for values: \"category_name\" is not an enabled parameter."
               (client/client :get 400 (search-url))))))))

(deftest chain-filter-enabled-params-test
  (with-chain-filter-fixtures [{:keys [dashboard param-keys values-url search-url]}]
    (db/update! Dashboard (:id dashboard)
      :embedding_params {"category_id" "enabled", "category_name" "enabled", "price" "enabled"})
    (testing "Should work if the param we're fetching values for is enabled"
      (testing "\nGET /api/embed/dashboard/:token/params/:param-key/values"
        (is (= {:values          [2 3 4 5 6]
                :has_more_values false}
               (chain-filer-test/take-n-values 5 (client/client :get 200 (values-url))))))
      (testing "\nGET /api/embed/dashboard/:token/params/:param-key/search/:query"
        (is (= {:values          ["Fast Food" "Food Truck" "Seafood"]
                :has_more_values false}
               (chain-filer-test/take-n-values 3 (client/client :get 200 (search-url)))))))

    (testing "If an ENABLED constraint param is present in the JWT, that's ok"
      (testing "\nGET /api/embed/dashboard/:token/params/:param-key/values"
        (is (= {:values          [40 67]
                :has_more_values false}
               (client/client :get 200 (values-url {"price" 4})))))
      (testing "\nGET /api/embed/dashboard/:token/params/:param-key/search/:query"
        (is (= {:values          []
                :has_more_values false}
               (client/client :get 200 (search-url {"price" 4}))))))

    (testing "If an ENABLED param is present in query params but *not* the JWT, that's ok"
      (testing "\nGET /api/embed/dashboard/:token/params/:param-key/values"
        (is (= {:values          [40 67]
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
      (with-chain-filter-fixtures [{:keys [dashboard param-keys values-url search-url]}]
        (db/update! Dashboard (:id dashboard)
          :embedding_params {"category_id" "enabled", "category_name" "enabled", "price" "enabled"})
        (testing "Should work if the param we're fetching values for is enabled"
          (testing "\nGET /api/embed/dashboard/:token/params/:param-key/values"
            (is (= {:values          [2 3 4 5 6]
                    :has_more_values false}
                   (chain-filer-test/take-n-values 5 (mt/user-http-request :rasta :get 200 (values-url))))))
          (testing "\nGET /api/embed/dashboard/:token/params/:param-key/search/:query"
            (is (= {:values          ["Fast Food" "Food Truck" "Seafood"]
                    :has_more_values false}
                   (chain-filer-test/take-n-values 3 (mt/user-http-request :rasta :get 200 (search-url)))))))))))

(deftest chain-filter-locked-params-test
  (with-chain-filter-fixtures [{:keys [dashboard param-keys values-url search-url]}]
    (testing "Requests should fail if searched param is locked"
      (db/update! Dashboard (:id dashboard)
        :embedding_params {"category_id" "locked", "category_name" "locked"})
      (doseq [url [(values-url) (search-url)]]
        (testing (str "\n" url)
          (is (re= #"Cannot search for values: \"category_(?:(?:name)|(?:id))\" is not an enabled parameter."
                   (client/client :get 400 url))))))

    (testing "Search param enabled\n"
      (db/update! Dashboard (:id dashboard)
        :embedding_params {"category_id" "enabled", "category_name" "enabled", "price" "locked"})

      (testing "Requests should fail if the token is missing a locked parameter"
        (doseq [url [(values-url) (search-url)]]
          (testing (str "\n" url)
            (is (= "You must specify a value for :price in the JWT."
                   (client/client :get 400 url))))))

      (testing "if `:locked` param is supplied, request should succeed"
        (testing "\nGET /api/embed/dashboard/:token/params/:param-key/values"
          (is (= {:values          [40 67]
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
  (with-chain-filter-fixtures [{:keys [dashboard param-keys values-url search-url]}]
    (testing "Requests should fail if searched param is disabled"
      (db/update! Dashboard (:id dashboard)
        :embedding_params {"category_id" "disabled", "category_name" "disabled"})
      (doseq [url [(values-url) (search-url)]]
        (testing (str "\n" url)
          (is (re= #"Cannot search for values: \"category_(?:(?:name)|(?:id))\" is not an enabled parameter\."
                   (client/client :get 400 url))))))

    (testing "Search param enabled\n"
      (db/update! Dashboard (:id dashboard)
        :embedding_params {"category_id" "enabled", "category_name" "enabled", "price" "disabled"})

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
              (is (= "Message seems corrupt or manipulated."
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
          (is (= "Message seems corrupt or manipulated."
                 (client/client :get 400 (with-new-secret-key (pivot-dashcard-url dashcard))))))))))

(deftest pivot-dashcard-locked-params-test
  (mt/dataset sample-dataset
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
                 (client/client :get 400 (str (pivot-dashcard-url dashcard) "?abc=100")))))))))

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
        (mt/with-temp Card [{card-id :id, :as card} {:dataset_query    (mt/native-query
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
                   (mt/rows (client/client :get 202 (str (card-query-url card "") "?NAME=Hudson%20Borer")))
                   (mt/rows (client/client :get 202 (str (card-query-url card "") "?NAME=Hudson%20Borer&NAME=x"))))))
          (testing "Dashcard"
            (mt/with-temp* [Dashboard [{dashboard-id :id, :as dashboard} {:enable_embedding true
                                                                          :embedding_params {:name "enabled"}
                                                                          :parameters       [{:name      "Name"
                                                                                              :slug      "name"
                                                                                              :id        "_name_"
                                                                                              :type      "string/="
                                                                                              :sectionId "string"}]}]

                            DashboardCard [{dashcard-id :id, :as dashcard} {:card_id            card-id
                                                                            :dashboard_id       dashboard-id
                                                                            :parameter_mappings [{:parameter_id "_name_"
                                                                                                  :card_id      card-id
                                                                                                  :target       [:dimension [:template-tag "NAME"]]}]}]]
              (is (= [[1]]
                     (mt/rows (client/client :get 202 (str (dashcard-url dashcard) "?name=Hudson%20Borer")))
                     (mt/rows (client/client :get 202 (str (dashcard-url dashcard) "?name=Hudson%20Borer&name=x"))))))))))))

(deftest pass-numeric-param-as-number-test
  (testing "Embedded numeric params should work with numeric (as opposed to string) values in the JWT (#20845)"
    (mt/dataset sample-dataset
      (with-embedding-enabled-and-new-secret-key
        (mt/with-temp Card [card {:dataset_query    (mt/native-query
                                                      {:query         "SELECT count(*) FROM orders WHERE quantity = {{qty_locked}}"
                                                       :template-tags {"qty_locked" {:name         "qty_locked"
                                                                                     :display-name "Quantity (Locked)"
                                                                                     :type         :number}}})
                                  :enable_embedding true
                                  :embedding_params {:qty_locked "locked"}}]
          (is (= [3443]
                 (mt/first-row (client/client :get 202 (card-query-url card "" {:params {:qty_locked 1}}))))))))))
