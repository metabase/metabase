(ns metabase.api.embed-test
  "Tests for /api/embed endpoints."
  (:require [buddy.sign
             [jwt :as jwt]
             [util :as buddy-util]]
            [clj-time.core :as time]
            [clojure
             [string :as str]
             [test :refer :all]]
            [clojure.data.csv :as csv]
            [crypto.random :as crypto-random]
            [dk.ative.docjure.spreadsheet :as spreadsheet]
            [expectations :refer [expect]]
            [metabase
             [http-client :as http]
             [models :refer [Card Dashboard DashboardCard DashboardCardSeries]]
             [query-processor-test :as qp.test]
             [test :as mt]
             [util :as u]]
            [metabase.api
             [embed :as embed-api]
             [public-test :as public-test]]
            [metabase.query-processor.middleware.constraints :as constraints]
            [metabase.test
             [data :as data]
             [util :as tu]]
            [toucan.db :as db]
            [toucan.util.test :as tt])
  (:import java.io.ByteArrayInputStream))

(defn random-embedding-secret-key [] (crypto-random/hex 32))

(def ^:dynamic *secret-key* nil)

(defn sign [claims] (jwt/sign claims *secret-key*))

(defn do-with-new-secret-key [f]
  (binding [*secret-key* (random-embedding-secret-key)]
    (tu/with-temporary-setting-values [embedding-secret-key *secret-key*]
      (f))))

(defmacro with-new-secret-key {:style/indent 0} [& body]
  `(do-with-new-secret-key (fn [] ~@body)))

(defn card-token {:style/indent 1} [card-or-id & [additional-token-params]]
  (sign (merge {:resource {:question (u/get-id card-or-id)}
                :params   {}}
               additional-token-params)))

(defn dash-token {:style/indent 1} [dash-or-id & [additional-token-params]]
  (sign (merge {:resource {:dashboard (u/get-id dash-or-id)}
                :params   {}}
               additional-token-params)))

(defmacro with-temp-card {:style/indent 1} [[card-binding & [card]] & body]
  `(tt/with-temp Card [~card-binding (merge (public-test/count-of-venues-card) ~card)]
     ~@body))

(defmacro with-temp-dashcard {:style/indent 1} [[dashcard-binding {:keys [dash card dashcard]}] & body]
  `(with-temp-card [card# ~card]
     (tt/with-temp* [Dashboard     [dash# ~dash]
                     DashboardCard [~dashcard-binding (merge {:card_id      (u/get-id card#)
                                                              :dashboard_id (u/get-id dash#)}
                                                             ~dashcard)]]
       ~@body)))

(defmacro with-embedding-enabled-and-new-secret-key {:style/indent 0} [& body]
  `(tu/with-temporary-setting-values [~'enable-embedding true]
     (with-new-secret-key
       ~@body)))

(defn successful-query-results
  ([]
   {:data       {:cols             [(tu/obj->json->obj (qp.test/aggregate-col :count))]
                 :rows             [[100]]
                 :insights         nil
                 :results_timezone "UTC"}
    :json_query {}
    :status     "completed"})

  ([results-format]
   (case results-format
     ""      (successful-query-results)
     "/json" [{:Count 100}]
     "/csv"  "Count\n100\n"
     "/xlsx" (fn [body]
               (->> (ByteArrayInputStream. body)
                    spreadsheet/load-workbook
                    (spreadsheet/select-sheet "Query result")
                    (spreadsheet/select-columns {:A :col})
                    (= [{:col "Count"} {:col 100.0}]))))))

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
  (tu/with-temporary-setting-values [enable-embedding false]
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
                             :dataset_query    {:database (data/id)
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

(defmacro ^:private do-response-formats {:style/indent 1} [[response-format-binding request-options-binding] & body]
  `(doseq [[response-format# ~request-options-binding] response-format->request-options
           :let                                        [~response-format-binding response-format#]]
     (testing (format "response-format = %s\n" (pr-str response-format#))
       ~@body)))

(deftest card-query-test
  (testing "GET /api/embed/card/:token/query and GET /api/embed/card/:token/query/:export-format"
    (do-response-formats [response-format request-options]
      (testing "check that the endpoint doesn't work if embedding isn't enabled"
        (tu/with-temporary-setting-values [enable-embedding false]
          (with-new-secret-key
            (with-temp-card [card]
              (is (= "Embedding is not enabled."
                     (http/client :get 400 (card-query-url card response-format))))))))

      (with-embedding-enabled-and-new-secret-key
        (testing "it should be possible to run a Card successfully if you jump through the right hoops..."
          (with-temp-card [card {:enable_embedding true}]
            (is (expect= (successful-query-results response-format)
                         (http/client :get 202 (card-query-url card response-format) {:request-options request-options})))))

        (testing (str "...but if the card has an invalid query we should just get a generic \"query failed\" "
                      "exception (rather than leaking query info)")
          (mt/suppress-output
            (with-temp-card [card {:enable_embedding true, :dataset_query {:database (data/id)
                                                                           :type     :native
                                                                           :native   {:query "SELECT * FROM XYZ"}}}]
              (is (= {:status "failed" :error "An error occurred while running the query."}
                     (http/client :get 202 (card-query-url card response-format)))))))

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
                               :dataset_query    (assoc (data/mbql-query venues)
                                                        :middleware
                                                        {:add-default-userland-constraints? true
                                                         :userland-query?                   true})}]
          (let [results (http/client :get 202 (card-query-url card "/csv"))]
            (is (= 101
                   (count (csv/read-csv results))))))))))

(deftest locked-params-test
  (with-embedding-enabled-and-new-secret-key
    (with-temp-card [card {:enable_embedding true, :embedding_params {:abc "locked"}}]
      (do-response-formats [response-format request-options]
        (testing (str "check that if embedding is enabled globally and for the object requests fail if the token is "
                      "missing a `:locked` parameter")
          (is (= "You must specify a value for :abc in the JWT."
                 (http/client :get 400 (card-query-url card response-format)))))

        (testing "if `:locked` param is present, request should succeed"
          (is (expect= (successful-query-results response-format)
                       (http/client :get 202
                                    (card-query-url card response-format {:params {:abc 100}})
                                    {:request-options request-options}))))

        (testing "If `:locked` parameter is present in URL params, request should fail"
          (is (= "You can only specify a value for :abc in the JWT."
                 (http/client :get 400 (str (card-query-url card response-format {:params {:abc 100}}) "?abc=100")))))))))


(deftest disabled-params-test
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

(deftest enabled-params-test
  (with-embedding-enabled-and-new-secret-key
    (with-temp-card [card {:enable_embedding true, :embedding_params {:abc "enabled"}}]
      (do-response-formats [response-format request-options]
        (testing "If `:enabled` param is present in both JWT and the URL, the request should fail"
          (is (= "You can't specify a value for :abc if it's already set in the JWT."
                 (http/client :get 400 (str (card-query-url card response-format {:params {:abc 100}}) "?abc=200")))))

        (testing "If an `:enabled` param is present in the JWT, that's ok"
          (is (expect= (successful-query-results response-format)
                       (http/client :get 202
                                    (card-query-url card response-format {:params {:abc "enabled"}})
                                    {:request-options request-options}))))

        (testing "If an `:enabled` param is present in URL params but *not* the JWT, that's ok"
          (is (expect= (successful-query-results response-format)
                       (http/client :get 202
                                    (str (card-query-url card response-format) "?abc=200")
                                    {:request-options request-options}))))))))


;; make sure CSV (etc.) downloads take editable params into account (#6407)

(defn- card-with-date-field-filter []
  {:dataset_query    {:database (data/id)
                      :type     :native
                      :native   {:query         "SELECT COUNT(*) AS \"count\" FROM CHECKINS WHERE {{date}}"
                                 :template-tags {:date {:name         "date"
                                                        :display-name "Date"
                                                        :type         "dimension"
                                                        :dimension    [:field-id (data/id :checkins :date)]
                                                        :widget-type  "date/quarter-year"}}}}
   :enable_embedding true
   :embedding_params {:date :enabled}})

(deftest csv-reports-count
  (is (= "count\n107\n"
         (with-embedding-enabled-and-new-secret-key
           (tt/with-temp Card [card (card-with-date-field-filter)]
             (http/client :get 202 (str (card-query-url card "/csv") "?date=Q1-2014")))))))


(deftest make-sure-it-also-works-with-the-forwarded-url
  (is (= "count\n107\n"
         (with-embedding-enabled-and-new-secret-key
           (tt/with-temp Card [card (card-with-date-field-filter)]
             ;; make sure the URL doesn't include /api/ at the beginning like it normally would
             (binding [http/*url-prefix* (str/replace http/*url-prefix* #"/api/$" "/")]
               (tu/with-temporary-setting-values [site-url http/*url-prefix*]
                 (http/client :get 202 (str "embed/question/" (card-token card) ".csv?date=Q1-2014")))))))))

;;; ---------------------------------------- GET /api/embed/dashboard/:token -----------------------------------------

(defn- dashboard-url [dashboard & [additional-token-params]]
  (str "embed/dashboard/" (dash-token dashboard additional-token-params)))


(deftest it-should-be-possible-to-call-this-endpoint-successfully
  (with-embedding-enabled-and-new-secret-key
    (tt/with-temp Dashboard [dash {:enable_embedding true}]
      (is (= successful-dashboard-info
             (dissoc-id-and-name
               (http/client :get 200 (dashboard-url dash))))))))

(deftest we-should-fail-when-attempting-to-use-an-expired-token
  (with-embedding-enabled-and-new-secret-key
    (tt/with-temp Dashboard [dash {:enable_embedding true}]
      (is (re= #"^Token is expired.*"
               (http/client :get 400 (dashboard-url dash {:exp (buddy-util/to-timestamp yesterday)})))))))

(deftest check-that-the-dashboard-endpoint-doesn-t-work-if-embedding-isn-t-enabled
  (tu/with-temporary-setting-values [enable-embedding false]
    (with-new-secret-key
      (tt/with-temp Dashboard [dash]
        (is (= "Embedding is not enabled."
               (http/client :get 400 (dashboard-url dash))))))))

(deftest check-that-if-embedding--is--enabled-globally-but-not-for-the-dashboard-the-request-fails
  (with-embedding-enabled-and-new-secret-key
    (tt/with-temp Dashboard [dash]
      (is (= "Embedding is not enabled for this object."
             (http/client :get 400 (dashboard-url dash)))))))

(deftest global-embedding-check-key
  (testing (str "check that if embedding is enabled globally and for the object that requests fail if they are signed "
                "with the wrong key")
    (with-embedding-enabled-and-new-secret-key
      (tt/with-temp Dashboard [dash {:enable_embedding true}]
        (is (= "Message seems corrupt or manipulated."
               (http/client :get 400 (with-new-secret-key (dashboard-url dash)))))))))


(deftest only-enabled-params-that-are-not-present-in-the-jwt-come-back
  (testing "check that only ENABLED params that ARE NOT PRESENT IN THE JWT come back"
    (with-embedding-enabled-and-new-secret-key
      (tt/with-temp Dashboard [dash {:enable_embedding true
                                     :embedding_params {:a "locked", :b "disabled", :c "enabled", :d "enabled"}
                                     :parameters       [{:slug "a", :name "a", :type "date"}
                                                        {:slug "b", :name "b", :type "date"}
                                                        {:slug "c", :name "c", :type "date"}
                                                        {:slug "d", :name "d", :type "date"}]}]
        (is (= [{:slug "d", :name "d", :type "date"}]
               (:parameters (http/client :get 200 (dashboard-url dash {:params {:c 100}})))))))))

;;; ---------------------- GET /api/embed/dashboard/:token/dashcard/:dashcard-id/card/:card-id -----------------------

(defn- dashcard-url [dashcard & [additional-token-params]]
  (str "embed/dashboard/" (dash-token (:dashboard_id dashcard) additional-token-params)
       "/dashcard/" (u/get-id dashcard)
       "/card/" (:card_id dashcard)))

;; it should be possible to run a Card successfully if you jump through the right hoops...
(deftest it-should-be-possible-to-run-a-card-successfully-if-you-jump-through-the-right-hoops---
  (is (expect= (successful-query-results)
               (with-embedding-enabled-and-new-secret-key
                 (with-temp-dashcard [dashcard {:dash {:enable_embedding true}}]
                   (http/client :get 202 (dashcard-url dashcard)))))))


(deftest downloading-csv-json-xlsx-results-from-the-dashcard-endpoint-shouldn-t-be-subject-to-the-default-query-constraints
  (testing (str "Downloading CSV/JSON/XLSX results from the dashcard endpoint shouldn't be subject to the default "
                "query constraints (#10399)")
    (with-redefs [constraints/default-query-constraints {:max-results 10, :max-results-bare-rows 10}]
      (with-embedding-enabled-and-new-secret-key
        (with-temp-dashcard [dashcard {:dash {:enable_embedding true}
                                       :card {:dataset_query (assoc (data/mbql-query venues)
                                                                    :middleware
                                                                    {:add-default-userland-constraints? true
                                                                     :userland-query?                   true})}}]
          (let [results (http/client :get 202 (str (dashcard-url dashcard) "/csv"))]
            (is (= 101
                   (count (csv/read-csv results))))))))))

(deftest generic-query-failed-exception-test
  (testing (str "...but if the card has an invalid query we should just get a generic \"query failed\" exception "
                "(rather than leaking query info)")
    (mt/suppress-output
      (with-embedding-enabled-and-new-secret-key
        (with-temp-dashcard [dashcard {:dash {:enable_embedding true}
                                       :card {:dataset_query (data/native-query {:query "SELECT * FROM XYZ"})}}]
          (is (= {:status "failed"
                  :error  "An error occurred while running the query." }
                 (http/client :get 202 (dashcard-url dashcard)))))))))

(deftest check-that-the-dashcard-endpoint-doesn-t-work-if-embedding-isn-t-enabled
  (tu/with-temporary-setting-values [enable-embedding false]
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

(deftest locked-params-test
  (with-embedding-enabled-and-new-secret-key
    (with-temp-dashcard [dashcard {:dash {:enable_embedding true, :embedding_params {:abc "locked"}}}]
      (testing (str "check that if embedding is enabled globally and for the object requests fail if the token is "
                    "missing a `:locked` parameter")
        (is (= "You must specify a value for :abc in the JWT."
               (http/client :get 400 (dashcard-url dashcard)))))

      (testing "if `:locked` param is supplied, request should succeed"
        (is (expect= (successful-query-results)
                     (http/client :get 202 (dashcard-url dashcard {:params {:abc 100}})))))

      (testing "if `:locked` parameter is present in URL params, request should fail"
        (is (= "You must specify a value for :abc in the JWT."
               (http/client :get 400 (str (dashcard-url dashcard) "?abc=100"))))))))

(deftest disabled-params-test
  (with-embedding-enabled-and-new-secret-key
    (with-temp-dashcard [dashcard {:dash {:enable_embedding true, :embedding_params {:abc "disabled"}}}]
      (testing (str "check that if embedding is enabled globally and for the object requests fail if they pass a "
                    "`:disabled` parameter")
        (is (= "You're not allowed to specify a value for :abc."
               (http/client :get 400 (dashcard-url dashcard {:params {:abc 100}})))))

      (testing "If a `:disabled` param is passed in the URL the request should fail"
        (is (= "You're not allowed to specify a value for :abc."
               (http/client :get 400 (str (dashcard-url dashcard) "?abc=200"))))))))

(deftest enabled-params-test
  (with-embedding-enabled-and-new-secret-key
    (with-temp-dashcard [dashcard {:dash {:enable_embedding true, :embedding_params {:abc "enabled"}}}]
      (testing "If `:enabled` param is present in both JWT and the URL, the request should fail"
        (is (= "You can't specify a value for :abc if it's already set in the JWT."
               (http/client :get 400 (str (dashcard-url dashcard {:params {:abc 100}}) "?abc=200")))))


      (testing "If an `:enabled` param is present in the JWT, that's ok"
        (is (expect= (successful-query-results)
                     (http/client :get 202 (dashcard-url dashcard {:params {:abc 100}})))))

      (testing "If an `:enabled` param is present in URL params but *not* the JWT, that's ok"
        (is (expect= (successful-query-results)
                     (http/client :get 202 (str (dashcard-url dashcard) "?abc=200"))))))))


;;; -------------------------------------------------- Other Tests ---------------------------------------------------

(deftest remove-embedding-params
  (testing (str "parameters that are not in the `embedding-params` map at all should get removed by "
                "`remove-locked-and-disabled-params`")
    (is (= {:parameters []}
           (#'embed-api/remove-locked-and-disabled-params {:parameters {:slug "foo"}} {})))))


(deftest make-sure-that-multiline-series-word-as-expected---4768-
  (testing "make sure that multiline series word as expected (#4768)"
    (with-embedding-enabled-and-new-secret-key
      (tt/with-temp Card [series-card {:dataset_query {:database (data/id)
                                                       :type     :query
                                                       :query    {:source-table (data/id :venues)}}}]
        (with-temp-dashcard [dashcard {:dash {:enable_embedding true}}]
          (tt/with-temp DashboardCardSeries [series {:dashboardcard_id (u/get-id dashcard)
                                                     :card_id          (u/get-id series-card)
                                                     :position         0}]
            (is (= "completed"
                   (:status (http/client :get 202 (str (dashcard-url (assoc dashcard :card_id (u/get-id series-card))))))))))))))

;;; ------------------------------- GET /api/embed/card/:token/field/:field-id/values --------------------------------

(defn- field-values-url [card-or-dashboard field-or-id]
  (str
   "embed/"
   (condp instance? card-or-dashboard
     (class Card)      (str "card/"      (card-token card-or-dashboard))
     (class Dashboard) (str "dashboard/" (dash-token card-or-dashboard)))
   "/field/"
   (u/get-id field-or-id)
   "/values"))

(defn- do-with-embedding-enabled-and-temp-card-referencing {:style/indent 2} [table-kw field-kw f]
  (with-embedding-enabled-and-new-secret-key
    (tt/with-temp Card [card (assoc (public-test/mbql-card-referencing table-kw field-kw)
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
          :field_id (data/id :venues :name)}
         (with-embedding-enabled-and-temp-card-referencing :venues :name [card]
           (-> (http/client :get 200 (field-values-url card (data/id :venues :name)))
               (update :values (partial take 5)))))))

;; but for Fields that are not referenced we should get an Exception
(deftest but-for-fields-that-are-not-referenced-we-should-get-an-exception
  (is (= "Not found."
         (with-embedding-enabled-and-temp-card-referencing :venues :name [card]
           (http/client :get 400 (field-values-url card (data/id :venues :price)))))))

;; Endpoint should fail if embedding is disabled
(deftest endpoint-should-fail-if-embedding-is-disabled
  (is (= "Embedding is not enabled."
         (with-embedding-enabled-and-temp-card-referencing :venues :name [card]
           (tu/with-temporary-setting-values [enable-embedding false]
             (http/client :get 400 (field-values-url card (data/id :venues :name))))))))

(deftest embedding-not-enabled-message
  (is (= "Embedding is not enabled for this object."
         (with-embedding-enabled-and-temp-card-referencing :venues :name [card]
           (db/update! Card (u/get-id card) :enable_embedding false)
           (http/client :get 400 (field-values-url card (data/id :venues :name)))))))

;;; ----------------------------- GET /api/embed/dashboard/:token/field/:field-id/values -----------------------------

(defn- do-with-embedding-enabled-and-temp-dashcard-referencing {:style/indent 2} [table-kw field-kw f]
  (with-embedding-enabled-and-new-secret-key
    (tt/with-temp* [Dashboard     [dashboard {:enable_embedding true}]
                    Card          [card      (public-test/mbql-card-referencing table-kw field-kw)]
                    DashboardCard [dashcard  {:dashboard_id       (u/get-id dashboard)
                                              :card_id            (u/get-id card)
                                              :parameter_mappings [{:card_id (u/get-id card)
                                                                    :target  [:dimension
                                                                              [:field-id
                                                                               (data/id table-kw field-kw)]]}]}]]
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
          :field_id (data/id :venues :name)}
         (with-embedding-enabled-and-temp-dashcard-referencing :venues :name [dashboard]
           (-> (http/client :get 200 (field-values-url dashboard (data/id :venues :name)))
               (update :values (partial take 5)))))))

;; shound NOT be able to use the endpoint with a Field not referenced by the Dashboard
(deftest shound-not-be-able-to-use-the-endpoint-with-a-field-not-referenced-by-the-dashboard
  (is (= "Not found."
         (with-embedding-enabled-and-temp-dashcard-referencing :venues :name [dashboard]
           (http/client :get 400 (field-values-url dashboard (data/id :venues :price)))))))

;; Endpoint should fail if embedding is disabled
(deftest field-values-endpoint-should-fail-if-embedding-is-disabled
  (is (= "Embedding is not enabled."
         (with-embedding-enabled-and-temp-dashcard-referencing :venues :name [dashboard]
           (tu/with-temporary-setting-values [enable-embedding false]
             (http/client :get 400 (field-values-url dashboard (data/id :venues :name))))))))


;; Endpoint should fail if embedding is disabled for the Dashboard
(deftest endpoint-should-fail-if-embedding-is-disabled-for-the-dashboard
  (is (= "Embedding is not enabled for this object."
         (with-embedding-enabled-and-temp-dashcard-referencing :venues :name [dashboard]
           (db/update! Dashboard (u/get-id dashboard) :enable_embedding false)
           (http/client :get 400 (field-values-url dashboard (data/id :venues :name)))))))



;;; ----------------------- GET /api/embed/card/:token/field/:field-id/search/:search-field-id -----------------------

(defn- field-search-url [card-or-dashboard field-or-id search-field-or-id]
  (str "embed/"
       (condp instance? card-or-dashboard
         (class Card)      (str "card/"      (card-token card-or-dashboard))
         (class Dashboard) (str "dashboard/" (dash-token card-or-dashboard)))
       "/field/" (u/get-id field-or-id)
       "/search/" (u/get-id search-field-or-id)))

(expect
 [[93 "33 Taps"]]
 (with-embedding-enabled-and-temp-card-referencing :venues :id [card]
   (http/client :get 200 (field-search-url card (data/id :venues :id) (data/id :venues :name))
                :value "33 T")))

;; if search field isn't allowed to be used with the other Field endpoint should return exception
(expect
 "Invalid Request."
 (with-embedding-enabled-and-temp-card-referencing :venues :id [card]
   (http/client :get 400 (field-search-url card (data/id :venues :id) (data/id :venues :price))
                :value "33 T")))

;; Endpoint should fail if embedding is disabled
(expect
 "Embedding is not enabled."
  (with-embedding-enabled-and-temp-card-referencing :venues :id [card]
    (tu/with-temporary-setting-values [enable-embedding false]
      (http/client :get 400 (field-search-url card (data/id :venues :id) (data/id :venues :name))
                   :value "33 T"))))

;; Endpoint should fail if embedding is disabled for the Card
(expect
 "Embedding is not enabled for this object."
 (with-embedding-enabled-and-temp-card-referencing :venues :id [card]
   (db/update! Card (u/get-id card) :enable_embedding false)
   (http/client :get 400 (field-search-url card (data/id :venues :id) (data/id :venues :name))
                :value "33 T")))


;;; -------------------- GET /api/embed/dashboard/:token/field/:field-id/search/:search-field-id ---------------------

(expect
  [[93 "33 Taps"]]
 (with-embedding-enabled-and-temp-dashcard-referencing :venues :id [dashboard]
   (http/client :get (field-search-url dashboard (data/id :venues :id) (data/id :venues :name))
                :value "33 T")))

;; if search field isn't allowed to be used with the other Field endpoint should return exception
(expect
 "Invalid Request."
 (with-embedding-enabled-and-temp-dashcard-referencing :venues :id [dashboard]
   (http/client :get 400 (field-search-url dashboard (data/id :venues :id) (data/id :venues :price))
                :value "33 T")))

;; Endpoint should fail if embedding is disabled
(expect
 "Embedding is not enabled."
  (with-embedding-enabled-and-temp-dashcard-referencing :venues :id [dashboard]
    (tu/with-temporary-setting-values [enable-embedding false]
      (http/client :get 400 (field-search-url dashboard (data/id :venues :name) (data/id :venues :name))
                   :value "33 T"))))

;; Endpoint should fail if embedding is disabled for the Dashboard
(expect
 "Embedding is not enabled for this object."
 (with-embedding-enabled-and-temp-dashcard-referencing :venues :id [dashboard]
   (db/update! Dashboard (u/get-id dashboard) :enable_embedding false)
   (http/client :get 400 (field-search-url dashboard (data/id :venues :name) (data/id :venues :name))
                :value "33 T")))


;;; ----------------------- GET /api/embed/card/:token/field/:field-id/remapping/:remapped-id ------------------------

(defn- field-remapping-url [card-or-dashboard field-or-id remapped-field-or-id]
  (str "embed/"
       (condp instance? card-or-dashboard
         (class Card)      (str "card/"      (card-token card-or-dashboard))
         (class Dashboard) (str "dashboard/" (dash-token card-or-dashboard)))
       "/field/" (u/get-id field-or-id)
       "/remapping/" (u/get-id remapped-field-or-id)))

;; we should be able to use the API endpoint and get the same results we get by calling the function above directly
(expect
 [10 "Fred 62"]
 (with-embedding-enabled-and-temp-card-referencing :venues :id [card]
   (http/client :get 200 (field-remapping-url card (data/id :venues :id) (data/id :venues :name))
                :value "10")))

;; shouldn't work if Card doesn't reference the Field in question
(expect
 "Not found."
 (with-embedding-enabled-and-temp-card-referencing :venues :price [card]
   (http/client :get 400 (field-remapping-url card (data/id :venues :id) (data/id :venues :name))
                :value "10")))

;; ...or if the remapping Field isn't allowed to be used with the other Field
(expect
 "Invalid Request."
 (with-embedding-enabled-and-temp-card-referencing :venues :id [card]
   (http/client :get 400 (field-remapping-url card (data/id :venues :id) (data/id :venues :price))
                :value "10")))

;; ...or if embedding is disabled
(expect
 "Embedding is not enabled."
 (with-embedding-enabled-and-temp-card-referencing :venues :id [card]
   (tu/with-temporary-setting-values [enable-embedding false]
     (http/client :get 400 (field-remapping-url card (data/id :venues :id) (data/id :venues :name))
                  :value "10"))))

;; ...or if embedding is disabled for the Card
(expect
 "Embedding is not enabled for this object."
  (with-embedding-enabled-and-temp-card-referencing :venues :id [card]
    (db/update! Card (u/get-id card) :enable_embedding false)
    (http/client :get 400 (field-remapping-url card (data/id :venues :id) (data/id :venues :name))
                 :value "10")))


;;; --------------------- GET /api/embed/dashboard/:token/field/:field-id/remapping/:remapped-id ---------------------

;; we should be able to use the API endpoint and get the same results we get by calling the function above directly
(expect
 [10 "Fred 62"]
 (with-embedding-enabled-and-temp-dashcard-referencing :venues :id [dashboard]
   (http/client :get 200 (field-remapping-url dashboard (data/id :venues :id) (data/id :venues :name))
                :value "10")))

;; shouldn't work if Card doesn't reference the Field in question
(expect
 "Not found."
 (with-embedding-enabled-and-temp-dashcard-referencing :venues :price [dashboard]
   (http/client :get 400 (field-remapping-url dashboard (data/id :venues :id) (data/id :venues :name))
                :value "10")))

;; ...or if the remapping Field isn't allowed to be used with the other Field
(expect
 "Invalid Request."
 (with-embedding-enabled-and-temp-dashcard-referencing :venues :id [dashboard]
   (http/client :get 400 (field-remapping-url dashboard (data/id :venues :id) (data/id :venues :price))
                :value "10")))

;; ...or if embedding is disabled
(expect
 "Embedding is not enabled."
 (with-embedding-enabled-and-temp-dashcard-referencing :venues :id [dashboard]
   (tu/with-temporary-setting-values [enable-embedding false]
     (http/client :get 400 (field-remapping-url dashboard (data/id :venues :id) (data/id :venues :name))
                  :value "10"))))

;; ...or if embedding is disabled for the Dashboard
(expect
 "Embedding is not enabled for this object."
 (with-embedding-enabled-and-temp-dashcard-referencing :venues :id [dashboard]
   (db/update! Dashboard (u/get-id dashboard) :enable_embedding false)
   (http/client :get 400 (field-remapping-url dashboard (data/id :venues :id) (data/id :venues :name))
                :value "10")))
