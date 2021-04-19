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
            [metabase.api.dashboard-test :as dashboard-api-test]
            [metabase.api.embed :as embed-api]
            [metabase.api.pivots :as pivots]
            [metabase.api.public-test :as public-test]
            [metabase.http-client :as http]
            [metabase.models :refer [Card Dashboard DashboardCard DashboardCardSeries]]
            [metabase.models.permissions :as perms]
            [metabase.models.permissions-group :as group]
            [metabase.query-processor-test :as qp.test]
            [metabase.query-processor.middleware.constraints :as constraints]
            [metabase.test :as mt]
            [metabase.util :as u]
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

(defmacro with-temp-card {:style/indent 1} [[card-binding & [card]] & body]
  `(let [card-defaults# ~card
         card-settings# (merge (when-not (:dataset_query card-defaults#)
                                 (public-test/count-of-venues-card))
                               card-defaults#)]
     (mt/with-temp Card [~card-binding card-settings#]
       ~@body)))

(defmacro with-temp-dashcard {:style/indent 1} [[dashcard-binding {:keys [dash card dashcard]}] & body]
  `(with-temp-card [card# ~card]
     (mt/with-temp* [Dashboard     [dash# ~dash]
                     DashboardCard [~dashcard-binding (merge {:card_id      (u/the-id card#)
                                                              :dashboard_id (u/the-id dash#)}
                                                             ~dashcard)]]
       ~@body)))

(defmacro with-embedding-enabled-and-new-secret-key {:style/indent 0} [& body]
  `(mt/with-temporary-setting-values [~'enable-embedding true]
     (with-new-secret-key
       ~@body)))

(defn test-query-results
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
   :param_values           nil
   :param_fields           nil})

(def successful-dashboard-info
  {:description nil, :parameters [], :ordered_cards [], :param_values nil, :param_fields nil})

(def ^:private yesterday (time/minus (time/now) (time/days 1)))

;;; ------------------------------------------- GET /api/embed/card/:token -------------------------------------------

(defn- card-url [card & [additional-token-params]] (str "embed/card/" (card-token card additional-token-params)))

(deftest it-should-be-possible-to-use-this-endpoint-successfully-if-all-the-conditions-are-met
  (with-embedding-enabled-and-new-secret-key
    (with-temp-card [card {:enable_embedding true}]
      (is (= successful-card-info
             (dissoc-id-and-name
               (http/client :get 200 (card-url card))))))))

(deftest we-should-fail-when-attempting-to-use-an-expired-token
  (with-embedding-enabled-and-new-secret-key
    (with-temp-card [card {:enable_embedding true}]
      (is (re= #"Token is expired"
               (http/client :get 400 (card-url card {:exp (buddy-util/to-timestamp yesterday)})))))))

(deftest check-that-the-endpoint-doesn-t-work-if-embedding-isn-t-enabled
  (mt/with-temporary-setting-values [enable-embedding false]
    (with-new-secret-key
      (with-temp-card [card]
        (is (= "Embedding is not enabled."
               (http/client :get 400 (card-url card))))))))

(deftest check-that-if-embedding--is--enabled-globally-but-not-for-the-card-the-request-fails
  (with-embedding-enabled-and-new-secret-key
    (with-temp-card [card]
      (is (= "Embedding is not enabled for this object."
             (http/client :get 400 (card-url card)))))))

(deftest global-embedding-requests-fail-with-wrong-key
  (testing (str "check that if embedding is enabled globally and for the object that requests fail if they are signed "
                "with the wrong key")
    (with-embedding-enabled-and-new-secret-key
      (with-temp-card [card {:enable_embedding true}]
        (is (= "Message seems corrupt or manipulated."
               (http/client :get 400 (with-new-secret-key (card-url card)))))))))

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
               (:parameters (http/client :get 200 (card-url card {:params {:c 100}})))))))))


;;; ------------------------- GET /api/embed/card/:token/query (and JSON/CSV/XLSX variants) --------------------------

(defn- card-query-url [card response-format & [additional-token-params]]
  (str "embed/card/"
       (card-token card additional-token-params)
       "/query"
       response-format))

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
                     (http/client :get 400 (card-query-url card response-format))))))))

      (with-embedding-enabled-and-new-secret-key
        (let [expected-status (response-format->status-code response-format)]
          (testing "it should be possible to run a Card successfully if you jump through the right hoops..."
            (with-temp-card [card {:enable_embedding true}]
              (test-query-results
               response-format
               (http/client :get expected-status (card-query-url card response-format)
                            {:request-options request-options}))))

          (testing (str "...but if the card has an invalid query we should just get a generic \"query failed\" "
                        "exception (rather than leaking query info)")
            (with-temp-card [card {:enable_embedding true, :dataset_query {:database (mt/id)
                                                                           :type     :native
                                                                           :native   {:query "SELECT * FROM XYZ"}}}]
              (is (= {:status     "failed"
                      :error      "An error occurred while running the query."
                      :error_type "invalid-query"}
                     (http/client :get expected-status (card-query-url card response-format)))))))

        (testing "check that if embedding *is* enabled globally but not for the Card the request fails"
          (with-temp-card [card]
            (is (= "Embedding is not enabled for this object."
                   (http/client :get 400 (card-query-url card response-format))))))

        (testing (str "check that if embedding is enabled globally and for the object that requests fail if they are "
                      "signed with the wrong key")
          (with-temp-card [card {:enable_embedding true}]
            (is (= "Message seems corrupt or manipulated."
                   (http/client :get 400 (with-new-secret-key (card-query-url card response-format)))))))))))


(deftest download-formatted-without-constraints-test
  (testing (str "Downloading CSV/JSON/XLSX results shouldn't be subject to the default query constraints -- even if "
                "the query comes in with `add-default-userland-constraints` (as will be the case if the query gets "
                "saved from one that had it -- see #9831 and #10399)")
    (with-redefs [constraints/default-query-constraints {:max-results 10, :max-results-bare-rows 10}]
      (with-embedding-enabled-and-new-secret-key
        (with-temp-card [card {:enable_embedding true
                               :dataset_query    (assoc (mt/mbql-query venues)
                                                        :middleware
                                                        {:add-default-userland-constraints? true
                                                         :userland-query?                   true})}]
          (let [results (http/client :get 200 (card-query-url card "/csv"))]
            (is (= 101
                   (count (csv/read-csv results))))))))))

(deftest card-locked-params-test
  (with-embedding-enabled-and-new-secret-key
    (with-temp-card [card {:enable_embedding true, :embedding_params {:abc "locked"}}]
      (do-response-formats [response-format request-options]
        (testing (str "check that if embedding is enabled globally and for the object requests fail if the token is "
                      "missing a `:locked` parameter")
          (is (= "You must specify a value for :abc in the JWT."
                 (http/client :get 400 (card-query-url card response-format)))))

        (testing "if `:locked` param is present, request should succeed"
          (test-query-results
           response-format
           (http/client :get (response-format->status-code response-format)
                        (card-query-url card response-format {:params {:abc 100}})
                        {:request-options request-options})))

        (testing "If `:locked` parameter is present in URL params, request should fail"
          (is (= "You can only specify a value for :abc in the JWT."
                 (http/client :get 400 (str (card-query-url card response-format {:params {:abc 100}}) "?abc=100")))))))))


(deftest card-disabled-params-test
  (with-embedding-enabled-and-new-secret-key
    (with-temp-card [card {:enable_embedding true, :embedding_params {:abc "disabled"}}]
      (do-response-formats [response-format request-options]
        (testing (str "check that if embedding is enabled globally and for the object requests fail if they pass a "
                      "`:disabled` parameter")
          (is (= "You're not allowed to specify a value for :abc."
                 (http/client :get 400 (card-query-url card response-format {:params {:abc 100}})))))

        (testing "If a `:disabled` param is passed in the URL the request should fail"
          (is (= "You're not allowed to specify a value for :abc."
                 (http/client :get 400 (str (card-query-url card response-format) "?abc=200")))))))))

(deftest card-enabled-params-test
  (with-embedding-enabled-and-new-secret-key
    (with-temp-card [card {:enable_embedding true, :embedding_params {:abc "enabled"}}]
      (do-response-formats [response-format request-options]
        (testing "If `:enabled` param is present in both JWT and the URL, the request should fail"
          (is (= "You can't specify a value for :abc if it's already set in the JWT."
                 (http/client :get 400 (str (card-query-url card response-format {:params {:abc 100}}) "?abc=200")))))

        (testing "If an `:enabled` param is present in the JWT, that's ok"
          (test-query-results
           response-format
           (http/client :get (response-format->status-code response-format)
                        (card-query-url card response-format {:params {:abc "enabled"}})
                        {:request-options request-options})))

        (testing "If an `:enabled` param is present in URL params but *not* the JWT, that's ok"
          (test-query-results
           response-format
           (http/client :get (response-format->status-code response-format)
                        (str (card-query-url card response-format) "?abc=200")
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
               (http/client :get 200 (str (card-query-url card "/csv") "?date=Q1-2014"))))))))

(deftest csv-forward-url-test
  (with-embedding-enabled-and-new-secret-key
    (mt/with-temp Card [card (card-with-date-field-filter)]
      ;; make sure the URL doesn't include /api/ at the beginning like it normally would
      (binding [http/*url-prefix* (str/replace http/*url-prefix* #"/api/$" "/")]
        (mt/with-temporary-setting-values [site-url http/*url-prefix*]
          (is (= "count\n107\n"
                 (http/client :get 200 (str "embed/question/" (card-token card) ".csv?date=Q1-2014")))))))))


;;; ---------------------------------------- GET /api/embed/dashboard/:token -----------------------------------------

(defn- dashboard-url [dashboard & [additional-token-params]]
  (str "embed/dashboard/" (dash-token dashboard additional-token-params)))

(deftest it-should-be-possible-to-call-this-endpoint-successfully
  (with-embedding-enabled-and-new-secret-key
    (mt/with-temp Dashboard [dash {:enable_embedding true}]
      (is (= successful-dashboard-info
             (dissoc-id-and-name
               (http/client :get 200 (dashboard-url dash))))))))

(deftest we-should-fail-when-attempting-to-use-an-expired-token
  (with-embedding-enabled-and-new-secret-key
    (mt/with-temp Dashboard [dash {:enable_embedding true}]
      (is (re= #"^Token is expired.*"
               (http/client :get 400 (dashboard-url dash {:exp (buddy-util/to-timestamp yesterday)})))))))

(deftest check-that-the-dashboard-endpoint-doesn-t-work-if-embedding-isn-t-enabled
  (mt/with-temporary-setting-values [enable-embedding false]
    (with-new-secret-key
      (mt/with-temp Dashboard [dash]
        (is (= "Embedding is not enabled."
               (http/client :get 400 (dashboard-url dash))))))))

(deftest check-that-if-embedding--is--enabled-globally-but-not-for-the-dashboard-the-request-fails
  (with-embedding-enabled-and-new-secret-key
    (mt/with-temp Dashboard [dash]
      (is (= "Embedding is not enabled for this object."
             (http/client :get 400 (dashboard-url dash)))))))

(deftest global-embedding-check-key
  (testing (str "check that if embedding is enabled globally and for the object that requests fail if they are signed "
                "with the wrong key")
    (with-embedding-enabled-and-new-secret-key
      (mt/with-temp Dashboard [dash {:enable_embedding true}]
        (is (= "Message seems corrupt or manipulated."
               (http/client :get 400 (with-new-secret-key (dashboard-url dash)))))))))

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
               (:parameters (http/client :get 200 (dashboard-url dash {:params {:c 100}})))))))))


;;; ---------------------- GET /api/embed/dashboard/:token/dashcard/:dashcard-id/card/:card-id -----------------------

(defn- dashcard-url [dashcard & [additional-token-params]]
  (str "embed/dashboard/" (dash-token (:dashboard_id dashcard) additional-token-params)
       "/dashcard/" (u/the-id dashcard)
       "/card/" (:card_id dashcard)))

(deftest it-should-be-possible-to-run-a-card-successfully-if-you-jump-through-the-right-hoops---
  (testing "it should be possible to run a Card successfully if you jump through the right hoops..."
    (with-embedding-enabled-and-new-secret-key
      (with-temp-dashcard [dashcard {:dash {:enable_embedding true}}]
        (test-query-results (http/client :get 202 (dashcard-url dashcard)))))))


(deftest downloading-csv-json-xlsx-results-from-the-dashcard-endpoint-shouldn-t-be-subject-to-the-default-query-constraints
  (testing (str "Downloading CSV/JSON/XLSX results from the dashcard endpoint shouldn't be subject to the default "
                "query constraints (#10399)")
    (with-redefs [constraints/default-query-constraints {:max-results 10, :max-results-bare-rows 10}]
      (with-embedding-enabled-and-new-secret-key
        (with-temp-dashcard [dashcard {:dash {:enable_embedding true}
                                       :card {:dataset_query (assoc (mt/mbql-query venues)
                                                                    :middleware
                                                                    {:add-default-userland-constraints? true
                                                                     :userland-query?                   true})}}]
          (let [results (http/client :get 200 (str (dashcard-url dashcard) "/csv"))]
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
               (http/client :get 202 (dashcard-url dashcard))))))))

(deftest check-that-the-dashcard-endpoint-doesn-t-work-if-embedding-isn-t-enabled
  (mt/with-temporary-setting-values [enable-embedding false]
    (with-new-secret-key
      (with-temp-dashcard [dashcard]
        (is (= "Embedding is not enabled."
               (http/client :get 400 (dashcard-url dashcard))))))))

(deftest dashcard-check-that-if-embedding--is--enabled-globally-but-not-for-the-dashboard-the-request-fails
  (with-embedding-enabled-and-new-secret-key
    (with-temp-dashcard [dashcard]
      (is (= "Embedding is not enabled for this object."
             (http/client :get 400 (dashcard-url dashcard)))))))

(deftest dashcard-global-embedding-check-key
  (testing (str "check that if embedding is enabled globally and for the object that requests fail if they are signed "
                "with the wrong key")
    (with-embedding-enabled-and-new-secret-key
      (with-temp-dashcard [dashcard {:dash {:enable_embedding true}}]
        (is (= "Message seems corrupt or manipulated."
               (http/client :get 400 (with-new-secret-key (dashcard-url dashcard)))))))))

(deftest dashboard-locked-params-test
  (with-embedding-enabled-and-new-secret-key
    (with-temp-dashcard [dashcard {:dash {:enable_embedding true, :embedding_params {:abc "locked"}}}]
      (testing (str "check that if embedding is enabled globally and for the object requests fail if the token is "
                    "missing a `:locked` parameter")
        (is (= "You must specify a value for :abc in the JWT."
               (http/client :get 400 (dashcard-url dashcard)))))

      (testing "if `:locked` param is supplied, request should succeed"
        (test-query-results (http/client :get 202 (dashcard-url dashcard {:params {:abc 100}}))))

      (testing "if `:locked` parameter is present in URL params, request should fail"
        (is (= "You must specify a value for :abc in the JWT."
               (http/client :get 400 (str (dashcard-url dashcard) "?abc=100"))))))))

(deftest dashboard-disabled-params-test
  (with-embedding-enabled-and-new-secret-key
    (with-temp-dashcard [dashcard {:dash {:enable_embedding true, :embedding_params {:abc "disabled"}}}]
      (testing (str "check that if embedding is enabled globally and for the object requests fail if they pass a "
                    "`:disabled` parameter")
        (is (= "You're not allowed to specify a value for :abc."
               (http/client :get 400 (dashcard-url dashcard {:params {:abc 100}})))))

      (testing "If a `:disabled` param is passed in the URL the request should fail"
        (is (= "You're not allowed to specify a value for :abc."
               (http/client :get 400 (str (dashcard-url dashcard) "?abc=200"))))))))

(deftest dashboard-enabled-params-test
  (with-embedding-enabled-and-new-secret-key
    (with-temp-dashcard [dashcard {:dash {:enable_embedding true, :embedding_params {:abc "enabled"}}}]
      (testing "If `:enabled` param is present in both JWT and the URL, the request should fail"
        (is (= "You can't specify a value for :abc if it's already set in the JWT."
               (http/client :get 400 (str (dashcard-url dashcard {:params {:abc 100}}) "?abc=200")))))


      (testing "If an `:enabled` param is present in the JWT, that's ok"
        (test-query-results (http/client :get 202 (dashcard-url dashcard {:params {:abc 100}}))))

      (testing "If an `:enabled` param is present in URL params but *not* the JWT, that's ok"
        (test-query-results (http/client :get 202 (str (dashcard-url dashcard) "?abc=200")))))))


;;; -------------------------------------------------- Other Tests ---------------------------------------------------

(deftest remove-embedding-params
  (testing (str "parameters that are not in the `embedding-params` map at all should get removed by "
                "`remove-locked-and-disabled-params`")
    (is (= {:parameters []}
           (#'embed-api/remove-locked-and-disabled-params {:parameters {:slug "foo"}} {})))))


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
                   (:status (http/client :get 202 (str (dashcard-url (assoc dashcard :card_id (u/the-id series-card))))))))))))))

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
  (is (= {:values   [["20th Century Cafe"]
                     ["25°"]
                     ["33 Taps"]
                     ["800 Degrees Neapolitan Pizzeria"]
                     ["BCD Tofu House"]]
          :field_id (mt/id :venues :name)}
         (with-embedding-enabled-and-temp-card-referencing :venues :name [card]
           (-> (http/client :get 200 (field-values-url card (mt/id :venues :name)))
               (update :values (partial take 5)))))))

;; but for Fields that are not referenced we should get an Exception
(deftest but-for-fields-that-are-not-referenced-we-should-get-an-exception
  (is (= "Not found."
         (with-embedding-enabled-and-temp-card-referencing :venues :name [card]
           (http/client :get 400 (field-values-url card (mt/id :venues :price)))))))

;; Endpoint should fail if embedding is disabled
(deftest endpoint-should-fail-if-embedding-is-disabled
  (is (= "Embedding is not enabled."
         (with-embedding-enabled-and-temp-card-referencing :venues :name [card]
           (mt/with-temporary-setting-values [enable-embedding false]
             (http/client :get 400 (field-values-url card (mt/id :venues :name))))))))

(deftest embedding-not-enabled-message
  (is (= "Embedding is not enabled for this object."
         (with-embedding-enabled-and-temp-card-referencing :venues :name [card]
           (db/update! Card (u/the-id card) :enable_embedding false)
           (http/client :get 400 (field-values-url card (mt/id :venues :name)))))))

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
  (is (= {:values   [["20th Century Cafe"]
                     ["25°"]
                     ["33 Taps"]
                     ["800 Degrees Neapolitan Pizzeria"]
                     ["BCD Tofu House"]]
          :field_id (mt/id :venues :name)}
         (with-embedding-enabled-and-temp-dashcard-referencing :venues :name [dashboard]
           (-> (http/client :get 200 (field-values-url dashboard (mt/id :venues :name)))
               (update :values (partial take 5)))))))

;; shound NOT be able to use the endpoint with a Field not referenced by the Dashboard
(deftest shound-not-be-able-to-use-the-endpoint-with-a-field-not-referenced-by-the-dashboard
  (is (= "Not found."
         (with-embedding-enabled-and-temp-dashcard-referencing :venues :name [dashboard]
           (http/client :get 400 (field-values-url dashboard (mt/id :venues :price)))))))

;; Endpoint should fail if embedding is disabled
(deftest field-values-endpoint-should-fail-if-embedding-is-disabled
  (is (= "Embedding is not enabled."
         (with-embedding-enabled-and-temp-dashcard-referencing :venues :name [dashboard]
           (mt/with-temporary-setting-values [enable-embedding false]
             (http/client :get 400 (field-values-url dashboard (mt/id :venues :name))))))))


;; Endpoint should fail if embedding is disabled for the Dashboard
(deftest endpoint-should-fail-if-embedding-is-disabled-for-the-dashboard
  (is (= "Embedding is not enabled for this object."
         (with-embedding-enabled-and-temp-dashcard-referencing :venues :name [dashboard]
           (db/update! Dashboard (u/the-id dashboard) :enable_embedding false)
           (http/client :get 400 (field-values-url dashboard (mt/id :venues :name)))))))


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
                     (http/client :get 200 (field-search-url object (mt/id :venues :id) (mt/id :venues :name))
                                  :value "33 T")))

              (testing "if search field isn't allowed to be used with the other Field endpoint should return exception"
                (is (= "Invalid Request."
                       (http/client :get 400 (field-search-url object (mt/id :venues :id) (mt/id :venues :price))
                                    :value "33 T"))))

              (testing "Endpoint should fail if embedding is disabled"
                (mt/with-temporary-setting-values [enable-embedding false]
                  (is (= "Embedding is not enabled."
                         (http/client :get 400 (field-search-url object (mt/id :venues :id) (mt/id :venues :name))
                                      :value "33 T")))))

              (testing "Endpoint should fail if embedding is disabled for the object"
                (db/update! model (u/the-id object) :enable_embedding false)
                (is (= "Embedding is not enabled for this object."
                       (http/client :get 400 (field-search-url object (mt/id :venues :id) (mt/id :venues :name))
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
                     (http/client :get 200 (field-remapping-url object (mt/id :venues :id) (mt/id :venues :name))
                                  :value "10"))))
            (testing " ...or if the remapping Field isn't allowed to be used with the other Field"
              (is (= "Invalid Request."
                     (http/client :get 400 (field-remapping-url object (mt/id :venues :id) (mt/id :venues :price))
                                  :value "10"))))

            (testing " ...or if embedding is disabled"
              (mt/with-temporary-setting-values [enable-embedding false]
                (is (= "Embedding is not enabled."
                       (http/client :get 400 (field-remapping-url object (mt/id :venues :id) (mt/id :venues :name))
                                    :value "10")))))

            (testing " ...or if embedding is disabled for the Card/Dashboard"
              (db/update! model (u/the-id object) :enable_embedding false)
              (is (= "Embedding is not enabled for this object."
                     (http/client :get 400 (field-remapping-url object (mt/id :venues :id) (mt/id :venues :name))
                                  :value "10")))))]

    (testing "GET /api/embed/card/:token/field/:field/remapping/:remapped-id nil"
      (testing "Get remapped Field values for a Card"
        (with-embedding-enabled-and-temp-card-referencing :venues :id [card]
          (tests Card card)))
      (testing "Shouldn't work if Card doesn't reference the Field in question"
        (with-embedding-enabled-and-temp-card-referencing :venues :price [card]
          (is (= "Not found."
                 (http/client :get 400 (field-remapping-url card (mt/id :venues :id) (mt/id :venues :name))
                              :value "10"))))))

    (testing "GET /api/embed/dashboard/:token/field/:field/remapping/:remapped-id nil"
      (testing "Get remapped Field values for a Dashboard"
        (with-embedding-enabled-and-temp-dashcard-referencing :venues :id [dashboard]
          (tests Dashboard dashboard)))
      (testing "Shouldn't work if Dashboard doesn't reference the Field in question"
        (with-embedding-enabled-and-temp-dashcard-referencing :venues :price [dashboard]
          (is (= "Not found."
                 (http/client :get 400 (field-remapping-url dashboard (mt/id :venues :id) (mt/id :venues :name))
                              :value "10"))))))))

;;; ------------------------------------------------ Chain filtering -------------------------------------------------

(defn- do-with-chain-filter-fixtures [f]
  (with-embedding-enabled-and-new-secret-key
    (dashboard-api-test/with-chain-filter-fixtures [{:keys [dashboard], :as m}]
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
               (http/client :get 400 (values-url)))))
      (testing "GET /api/embed/dashboard/:token/params/:param-key/search/:query"
        (is (= "Embedding is not enabled for this object."
               (http/client :get 400 (search-url))))))))

(deftest chain-filter-random-params-test
  (with-chain-filter-fixtures [{:keys [dashboard values-url search-url]}]
    (testing "Requests should fail if parameter is not explicitly enabled"
      (testing "\nGET /api/embed/dashboard/:token/params/:param-key/values"
        (is (= "Cannot search for values: \"category_id\" is not an enabled parameter."
               (http/client :get 400 (values-url)))))
      (testing "\nGET /api/embed/dashboard/:token/params/:param-key/search/:query"
        (is (= "Cannot search for values: \"category_name\" is not an enabled parameter."
               (http/client :get 400 (search-url))))))))

(deftest chain-filter-enabled-params-test
  (with-chain-filter-fixtures [{:keys [dashboard param-keys values-url search-url]}]
    (db/update! Dashboard (:id dashboard)
      :embedding_params {"category_id" "enabled", "category_name" "enabled", "price" "enabled"})
    (testing "Should work if the param we're fetching values for is enabled"
      (testing "\nGET /api/embed/dashboard/:token/params/:param-key/values"
        (is (= [2 3 4 5 6]
               (take 5 (http/client :get 200 (values-url))))))
      (testing "\nGET /api/embed/dashboard/:token/params/:param-key/search/:query"
        (is (= ["Fast Food" "Food Truck" "Seafood"]
               (take 3 (http/client :get 200 (search-url)))))))

    (testing "If an ENABLED constraint param is present in the JWT, that's ok"
      (testing "\nGET /api/embed/dashboard/:token/params/:param-key/values"
        (is (= [40 67]
               (http/client :get 200 (values-url {"price" 4})))))
      (testing "\nGET /api/embed/dashboard/:token/params/:param-key/search/:query"
        (is (= []
               (http/client :get 200 (search-url {"price" 4}))))))

    (testing "If an ENABLED param is present in query params but *not* the JWT, that's ok"
      (testing "\nGET /api/embed/dashboard/:token/params/:param-key/values"
        (is (= [40 67]
               (http/client :get 200 (str (values-url) "?_PRICE_=4")))))
      (testing "\nGET /api/embed/dashboard/:token/params/:param-key/search/:query"
        (is (= []
               (http/client :get 200 (str (search-url) "?_PRICE_=4"))))))

    (testing "If ENABLED param is present in both JWT and the URL, the request should fail"
      (doseq [url-fn [values-url search-url]
              :let   [url (str (url-fn {"price" 4}) "?_PRICE_=4")]]
        (testing (str "\n" url)
          (is (= "You can't specify a value for :price if it's already set in the JWT."
                 (http/client :get 400 url))))))))

(deftest chain-filter-ignore-current-user-permissions-test
  (testing "Should not fail if request is authenticated but current user does not have data permissions"
    (mt/with-temp-copy-of-db
      (perms/revoke-permissions! (group/all-users) (mt/db))
      (with-chain-filter-fixtures [{:keys [dashboard param-keys values-url search-url]}]
        (db/update! Dashboard (:id dashboard)
          :embedding_params {"category_id" "enabled", "category_name" "enabled", "price" "enabled"})
        (testing "Should work if the param we're fetching values for is enabled"
          (testing "\nGET /api/embed/dashboard/:token/params/:param-key/values"
            (is (= [2 3 4 5 6]
                   (take 5 (mt/user-http-request :rasta :get 200 (values-url))))))
          (testing "\nGET /api/embed/dashboard/:token/params/:param-key/search/:query"
            (is (= ["Fast Food" "Food Truck" "Seafood"]
                   (take 3 (mt/user-http-request :rasta :get 200 (search-url)))))))))))

(deftest chain-filter-locked-params-test
  (with-chain-filter-fixtures [{:keys [dashboard param-keys values-url search-url]}]
    (testing "Requests should fail if searched param is locked"
      (db/update! Dashboard (:id dashboard)
        :embedding_params {"category_id" "locked", "category_name" "locked"})
      (doseq [url [(values-url) (search-url)]]
        (testing (str "\n" url)
          (is (re= #"Cannot search for values: \"category_(?:(?:name)|(?:id))\" is not an enabled parameter."
                   (http/client :get 400 url))))))

    (testing "Search param enabled\n"
      (db/update! Dashboard (:id dashboard)
        :embedding_params {"category_id" "enabled", "category_name" "enabled", "price" "locked"})

      (testing "Requests should fail if the token is missing a locked parameter"
        (doseq [url [(values-url) (search-url)]]
          (testing (str "\n" url)
            (is (= "You must specify a value for :price in the JWT."
                   (http/client :get 400 url))))))

      (testing "if `:locked` param is supplied, request should succeed"
        (testing "\nGET /api/embed/dashboard/:token/params/:param-key/values"
          (is (= [40 67]
                 (http/client :get 200 (values-url {"price" 4})))))
        (testing "\nGET /api/embed/dashboard/:token/params/:param-key/search/:query"
          (is (= []
                 (http/client :get 200 (search-url {"price" 4}))))))

      (testing "if `:locked` parameter is present in URL params, request should fail"
        (doseq [url-fn [values-url search-url]
                :let   [url (url-fn {"price" 4})]]
          (testing (str "\n" url)
            (is (= "You can only specify a value for :price in the JWT."
                   (http/client :get 400 (str url "?_PRICE_=4"))))))))))

(deftest chain-filter-disabled-params-test
  (with-chain-filter-fixtures [{:keys [dashboard param-keys values-url search-url]}]
    (testing "Requests should fail if searched param is disabled"
      (db/update! Dashboard (:id dashboard)
        :embedding_params {"category_id" "disabled", "category_name" "disabled"})
      (doseq [url [(values-url) (search-url)]]
        (testing (str "\n" url)
          (is (re= #"Cannot search for values: \"category_(?:(?:name)|(?:id))\" is not an enabled parameter\."
                   (http/client :get 400 url))))))

    (testing "Search param enabled\n"
      (db/update! Dashboard (:id dashboard)
        :embedding_params {"category_id" "enabled", "category_name" "enabled", "price" "disabled"})

      (testing "Requests should fail if the token has a disabled parameter"
        (doseq [url-fn [values-url search-url]
                :let   [url (url-fn {"price" 4})]]
          (testing (str "\n" url)
            (is (= "You're not allowed to specify a value for :price."
                   (http/client :get 400 url))))))

      (testing "Requests should fail if the URL has a disabled parameter"
        (doseq [url-fn [values-url search-url]
                :let   [url (str (url-fn) "?_PRICE_=4")]]
          (testing (str "\n" url)
            (is (= "You're not allowed to specify a value for :price."
                   (http/client :get 400 url)))))))))

;; Pivot tables

(defn- pivot-card-query-url [card response-format & [additional-token-params]]
  (str "/embed/pivot/card/"
       (card-token card additional-token-params)
       "/query"
       response-format))

(deftest pivot-embed-query-test
  (mt/test-drivers pivots/applicable-drivers
    (mt/dataset sample-dataset
      (testing "GET /api/embed/pivot/card/:token/query"
        (testing "check that the endpoint doesn't work if embedding isn't enabled"
          (mt/with-temporary-setting-values [enable-embedding false]
            (with-new-secret-key
              (with-temp-card [card (pivots/pivot-card)]
                (is (= "Embedding is not enabled."
                       (http/client :get 400 (pivot-card-query-url card ""))))))))

        (with-embedding-enabled-and-new-secret-key
          (let [expected-status 202]
            (testing "it should be possible to run a Card successfully if you jump through the right hoops..."
              (with-temp-card [card (merge {:enable_embedding true} (pivots/pivot-card))]
                (let [result (http/client :get expected-status (pivot-card-query-url card "") {:request-options nil})
                      rows   (mt/rows result)]
                  (is (nil? (:row_count result))) ;; row_count isn't included in public endpoints
                  (is (= "completed" (:status result)))
                  (is (= 6 (count (get-in result [:data :cols]))))
                  (is (= 1144 (count rows)))))))

          (testing "check that if embedding *is* enabled globally but not for the Card the request fails"
            (with-temp-card [card (pivots/pivot-card)]
              (is (= "Embedding is not enabled for this object."
                     (http/client :get 400 (pivot-card-query-url card ""))))))

          (testing (str "check that if embedding is enabled globally and for the object that requests fail if they are "
                        "signed with the wrong key")
            (with-temp-card [card (merge {:enable_embedding true} (pivots/pivot-card))]
              (is (= "Message seems corrupt or manipulated."
                     (http/client :get 400 (with-new-secret-key (pivot-card-query-url card ""))))))))))))

(defn- pivot-dashcard-url [dashcard & [additional-token-params]]
  (str "embed/pivot/dashboard/" (dash-token (:dashboard_id dashcard) additional-token-params)
       "/dashcard/" (u/the-id dashcard)
       "/card/" (:card_id dashcard)))

(deftest pivot-dashcard-success-test
  (mt/test-drivers pivots/applicable-drivers
    (mt/dataset sample-dataset
      (with-embedding-enabled-and-new-secret-key
        (with-temp-dashcard [dashcard {:dash {:enable_embedding true}
                                       :card (pivots/pivot-card)}]
          (let [result (http/client :get 202 (pivot-dashcard-url dashcard))
                rows   (mt/rows result)]
            (is (nil? (:row_count result))) ;; row_count isn't included in public endpoints
            (is (= "completed" (:status result)))
            (is (= 6 (count (get-in result [:data :cols]))))
            (is (= 1144 (count rows)))))))))

(deftest pivot-dashcard-embedding-disabled-test
  (mt/dataset sample-dataset
    (mt/with-temporary-setting-values [enable-embedding false]
      (with-new-secret-key
        (with-temp-dashcard [dashcard {:card (pivots/pivot-card)}]
          (is (= "Embedding is not enabled."
                 (http/client :get 400 (pivot-dashcard-url dashcard)))))))))

(deftest pivot-dashcard-embedding-disabled-for-card-test
  (mt/dataset sample-dataset
    (with-embedding-enabled-and-new-secret-key
      (with-temp-dashcard [dashcard {:card (pivots/pivot-card)}]
        (is (= "Embedding is not enabled for this object."
               (http/client :get 400 (pivot-dashcard-url dashcard))))))))

(deftest pivot-dashcard-signing-check-test
  (mt/dataset sample-dataset
    (testing (str "check that if embedding is enabled globally and for the object that requests fail if they are signed "
                  "with the wrong key")
      (with-embedding-enabled-and-new-secret-key
        (with-temp-dashcard [dashcard {:dash {:enable_embedding true}
                                       :card (pivots/pivot-card)}]
          (is (= "Message seems corrupt or manipulated."
                 (http/client :get 400 (with-new-secret-key (pivot-dashcard-url dashcard))))))))))

(deftest pivot-dashcard-locked-params-test
  (mt/dataset sample-dataset
    (with-embedding-enabled-and-new-secret-key
      (with-temp-dashcard [dashcard {:dash {:enable_embedding true, :embedding_params {:abc "locked"}}
                                     :card (pivots/pivot-card)}]
        (testing (str "check that if embedding is enabled globally and for the object requests fail if the token is "
                      "missing a `:locked` parameter")
          (is (= "You must specify a value for :abc in the JWT."
                 (http/client :get 400 (pivot-dashcard-url dashcard)))))

        (testing "if `:locked` param is supplied, request should succeed"
          (let [result (http/client :get 202 (pivot-dashcard-url dashcard {:params {:abc 100}}))
                rows   (mt/rows result)]
            (is (nil? (:row_count result))) ;; row_count isn't included in public endpoints
            (is (= "completed" (:status result)))
            (is (= 6 (count (get-in result [:data :cols]))))
            (is (= 1144 (count rows)))))

        (testing "if `:locked` parameter is present in URL params, request should fail"
          (is (= "You must specify a value for :abc in the JWT."
                 (http/client :get 400 (str (pivot-dashcard-url dashcard) "?abc=100")))))))))

(deftest pivot-dashcard-disabled-params-test
  (mt/dataset sample-dataset
    (with-embedding-enabled-and-new-secret-key
      (with-temp-dashcard [dashcard {:dash {:enable_embedding true, :embedding_params {:abc "disabled"}}
                                     :card (pivots/pivot-card)}]
        (testing (str "check that if embedding is enabled globally and for the object requests fail if they pass a "
                      "`:disabled` parameter")
          (is (= "You're not allowed to specify a value for :abc."
                 (http/client :get 400 (pivot-dashcard-url dashcard {:params {:abc 100}})))))

        (testing "If a `:disabled` param is passed in the URL the request should fail"
          (is (= "You're not allowed to specify a value for :abc."
                 (http/client :get 400 (str (pivot-dashcard-url dashcard) "?abc=200")))))))))

(deftest pivot-dashcard-enabled-params-test
  (mt/dataset sample-dataset
    (with-embedding-enabled-and-new-secret-key
      (with-temp-dashcard [dashcard {:dash {:enable_embedding true, :embedding_params {:abc "enabled"}}
                                     :card (pivots/pivot-card)}]
        (testing "If `:enabled` param is present in both JWT and the URL, the request should fail"
          (is (= "You can't specify a value for :abc if it's already set in the JWT."
                 (http/client :get 400 (str (pivot-dashcard-url dashcard {:params {:abc 100}}) "?abc=200")))))

        (testing "If an `:enabled` param is present in the JWT, that's ok"
          (let [result (http/client :get 202 (pivot-dashcard-url dashcard {:params {:abc 100}}))
                rows   (mt/rows result)]
            (is (nil? (:row_count result))) ;; row_count isn't included in public endpoints
            (is (= "completed" (:status result)))
            (is (= 6 (count (get-in result [:data :cols]))))
            (is (= 1144 (count rows)))))

        (testing "If an `:enabled` param is present in URL params but *not* the JWT, that's ok"
          (let [result (http/client :get 202 (str (pivot-dashcard-url dashcard) "?abc=200"))
                rows   (mt/rows result)]
            (is (nil? (:row_count result))) ;; row_count isn't included in public endpoints
            (is (= "completed" (:status result)))
            (is (= 6 (count (get-in result [:data :cols]))))
            (is (= 1144 (count rows)))))))))
