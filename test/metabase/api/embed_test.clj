(ns metabase.api.embed-test
  (:require [buddy.sign.jwt :as jwt]
            [crypto.random :as crypto-random]
            [dk.ative.docjure.spreadsheet :as spreadsheet]
            [expectations :refer :all]
            [metabase
             [http-client :as http]
             [util :as u]]
            [metabase.api.public-test :as public-test]
            [metabase.models
             [card :refer [Card]]
             [dashboard :refer [Dashboard]]
             [dashboard-card :refer [DashboardCard]]]
            [metabase.test
             [data :as data]
             [util :as tu]]
            [toucan.util.test :as tt])
  (:import java.io.ByteArrayInputStream))

(defn random-embedding-secret-key [] (crypto-random/hex 32))

(def ^:dynamic *secret-key* nil)

(defn sign [claims] (jwt/sign claims *secret-key*))

(defmacro with-new-secret-key {:style/indent 0} [& body]
  `(binding [*secret-key* (random-embedding-secret-key)]
     (tu/with-temporary-setting-values [~'embedding-secret-key *secret-key*]
       ~@body)))

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
                     DashboardCard [~dashcard-binding (merge {:card_id (u/get-id card#), :dashboard_id (u/get-id dash#)} ~dashcard)]]
       ~@body)))

(defmacro with-embedding-enabled-and-new-secret-key {:style/indent 0} [& body]
  `(tu/with-temporary-setting-values [~'enable-embedding true]
     (with-new-secret-key
       ~@body)))

(defn successful-query-results
  ([]
   {:data       {:columns ["count"]
                 :cols    [{:description nil, :table_id nil, :special_type "type/Number", :name "count", :source "aggregation",
                            :extra_info {}, :id nil, :target nil, :display_name "count", :base_type "type/Integer"}]
                 :rows    [[100]]}
    :json_query {:parameters []}
    :status     "completed"})
  ([results-format]
   (case results-format
     ""      (successful-query-results)
     "/json" [{:count 100}]
     "/csv"  "count\n100\n"
     "/xlsx" (fn [body]
               (->> (ByteArrayInputStream. body)
                    spreadsheet/load-workbook
                    (spreadsheet/select-sheet "Query result")
                    (spreadsheet/select-columns {:A :col})
                    (= [{:col "count"} {:col 100.0}]))))))

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
   :parameters             ()
   :param_values           nil})

(def successful-dashboard-info
  {:description nil, :parameters (), :ordered_cards (), :param_values nil})


;; ------------------------------------------------------------ GET /api/embed/card/:token ------------------------------------------------------------

(defn- card-url [card & [additional-token-params]] (str "embed/card/" (card-token card additional-token-params)))

;; it should be possible to use this endpoint successfully if all the conditions are met
(expect
  successful-card-info
  (with-embedding-enabled-and-new-secret-key
    (with-temp-card [card {:enable_embedding true}]
      (dissoc-id-and-name
        (http/client :get 200 (card-url card))))))

;; check that the endpoint doesn't work if embedding isn't enabled
(expect
  "Embedding is not enabled."
  (tu/with-temporary-setting-values [enable-embedding false]
    (with-new-secret-key
      (with-temp-card [card]
        (http/client :get 400 (card-url card))))))

;; check that if embedding *is* enabled globally but not for the Card the request fails
(expect
  "Embedding is not enabled for this object."
  (with-embedding-enabled-and-new-secret-key
    (with-temp-card [card]
      (http/client :get 400 (card-url card)))))

;; check that if embedding is enabled globally and for the object that requests fail if they are signed with the wrong key
(expect
  "Message seems corrupt or manipulated."
  (with-embedding-enabled-and-new-secret-key
    (with-temp-card [card {:enable_embedding true}]
      (http/client :get 400 (with-new-secret-key (card-url card))))))

;; check that only ENABLED params that ARE NOT PRESENT IN THE JWT come back
(expect
  [{:id nil, :type "date/single", :target ["variable" ["template-tag" "d"]], :name "d", :slug "d", :default nil}]
  (with-embedding-enabled-and-new-secret-key
    (with-temp-card [card {:enable_embedding true
                           :dataset_query    {:native {:template_tags {:a {:type "date", :name "a", :display_name "a"}
                                                                       :b {:type "date", :name "b", :display_name "b"}
                                                                       :c {:type "date", :name "c", :display_name "c"}
                                                                       :d {:type "date", :name "d", :display_name "d"}}}}
                           :embedding_params {:a "locked", :b "disabled", :c "enabled", :d "enabled"}}]
      (:parameters (http/client :get 200 (card-url card {:params {:c 100}}))))))


;; ------------------------------------------------------------ GET /api/embed/card/:token/query (and JSON/CSV/XLSX variants)  ------------------------------------------------------------

(defn- card-query-url [card response-format & [additional-token-params]]
  (str "embed/card/"
       (card-token card additional-token-params)
       "/query"
       response-format))

(defmacro ^:private expect-for-response-formats {:style/indent 1} [[response-format-binding request-options-binding] expected actual]
  `(do
     ~@(for [[response-format request-options] [[""] ["/json"] ["/csv"] ["/xlsx" {:as :byte-array}]]]
         `(expect
            (let [~response-format-binding         ~response-format
                  ~(or request-options-binding '_) {:request-options ~request-options}]
              ~expected)
            (let [~response-format-binding         ~response-format
                  ~(or request-options-binding '_) {:request-options ~request-options}]
              ~actual)))))

;; it should be possible to run a Card successfully if you jump through the right hoops...
(expect-for-response-formats [response-format request-options]
  (successful-query-results response-format)
  (with-embedding-enabled-and-new-secret-key
    (with-temp-card [card {:enable_embedding true}]
      (http/client :get 200 (card-query-url card response-format) request-options))))

;; but if the card has an invalid query we should just get a generic "query failed" exception (rather than leaking query info)
(expect-for-response-formats [response-format]
  "An error occurred while running the query."
  (with-embedding-enabled-and-new-secret-key
    (with-temp-card [card {:enable_embedding true, :dataset_query {:database (data/id), :type :native, :native {:query "SELECT * FROM XYZ"}}}]
      (http/client :get 400 (card-query-url card response-format)))))

;; check that the endpoint doesn't work if embedding isn't enabled
(expect-for-response-formats [response-format]
  "Embedding is not enabled."
  (tu/with-temporary-setting-values [enable-embedding false]
    (with-new-secret-key
      (with-temp-card [card]
        (http/client :get 400 (card-query-url card response-format))))))

;; check that if embedding *is* enabled globally but not for the Card the request fails
(expect-for-response-formats [response-format]
  "Embedding is not enabled for this object."
  (with-embedding-enabled-and-new-secret-key
    (with-temp-card [card]
      (http/client :get 400 (card-query-url card response-format)))))

;; check that if embedding is enabled globally and for the object that requests fail if they are signed with the wrong key
(expect-for-response-formats [response-format]
  "Message seems corrupt or manipulated."
  (with-embedding-enabled-and-new-secret-key
    (with-temp-card [card {:enable_embedding true}]
      (http/client :get 400 (with-new-secret-key (card-query-url card response-format))))))

;;; LOCKED params

;; check that if embedding is enabled globally and for the object requests fail if the token is missing a `:locked` parameter
(expect-for-response-formats [response-format]
  "You must specify a value for :abc in the JWT."
  (with-embedding-enabled-and-new-secret-key
    (with-temp-card [card {:enable_embedding true, :embedding_params {:abc "locked"}}]
      (http/client :get 400 (card-query-url card response-format)))))

;; if `:locked` param is present, request should succeed
(expect-for-response-formats [response-format request-options]
  (successful-query-results response-format)
  (with-embedding-enabled-and-new-secret-key
    (with-temp-card [card {:enable_embedding true, :embedding_params {:abc "locked"}}]
      (http/client :get 200 (card-query-url card response-format {:params {:abc 100}}) request-options))))

;; If `:locked` parameter is present in URL params, request should fail
(expect-for-response-formats [response-format]
  "You can only specify a value for :abc in the JWT."
  (with-embedding-enabled-and-new-secret-key
    (with-temp-card [card {:enable_embedding true, :embedding_params {:abc "locked"}}]
      (http/client :get 400 (str (card-query-url card response-format {:params {:abc 100}}) "?abc=100")))))

;;; DISABLED params

;; check that if embedding is enabled globally and for the object requests fail if they pass a `:disabled` parameter
(expect-for-response-formats [response-format]
  "You're not allowed to specify a value for :abc."
  (with-embedding-enabled-and-new-secret-key
    (with-temp-card [card {:enable_embedding true, :embedding_params {:abc "disabled"}}]
      (http/client :get 400 (card-query-url card response-format {:params {:abc 100}})))))

;; If a `:disabled` param is passed in the URL the request should fail
(expect-for-response-formats [response-format]
  "You're not allowed to specify a value for :abc."
  (with-embedding-enabled-and-new-secret-key
    (with-temp-card [card {:enable_embedding true, :embedding_params {:abc "disabled"}}]
      (http/client :get 400 (str (card-query-url card response-format) "?abc=200")))))

;;; ENABLED params

;; If `:enabled` param is present in both JWT and the URL, the request should fail
(expect-for-response-formats [response-format]
  "You can't specify a value for :abc if it's already set in the JWT."
  (with-embedding-enabled-and-new-secret-key
    (with-temp-card [card {:enable_embedding true, :embedding_params {:abc "enabled"}}]
      (http/client :get 400 (str (card-query-url card response-format {:params {:abc 100}}) "?abc=200")))))

;; If an `:enabled` param is present in the JWT, that's ok
(expect-for-response-formats [response-format request-options]
  (successful-query-results response-format)
  (with-embedding-enabled-and-new-secret-key
    (with-temp-card [card {:enable_embedding true, :embedding_params {:abc "enabled"}}]
      (http/client :get 200 (card-query-url card response-format {:params {:abc "enabled"}}) request-options))))

;; If an `:enabled` param is present in URL params but *not* the JWT, that's ok
(expect-for-response-formats [response-format request-options]
  (successful-query-results response-format)
  (with-embedding-enabled-and-new-secret-key
    (with-temp-card [card {:enable_embedding true, :embedding_params {:abc "enabled"}}]
      (http/client :get 200 (str (card-query-url card response-format) "?abc=200") request-options))))


;; ------------------------------------------------------------ GET /api/embed/dashboard/:token ------------------------------------------------------------

(defn- dashboard-url [dashboard & [additional-token-params]] (str "embed/dashboard/" (dash-token dashboard additional-token-params)))

;; it should be possible to call this endpoint successfully
(expect
  successful-dashboard-info
  (with-embedding-enabled-and-new-secret-key
    (tt/with-temp Dashboard [dash {:enable_embedding true}]
      (dissoc-id-and-name
        (http/client :get 200 (dashboard-url dash))))))

;; check that the endpoint doesn't work if embedding isn't enabled
(expect
  "Embedding is not enabled."
  (tu/with-temporary-setting-values [enable-embedding false]
    (with-new-secret-key
      (tt/with-temp Dashboard [dash]
        (http/client :get 400 (dashboard-url dash))))))

;; check that if embedding *is* enabled globally but not for the Dashboard the request fails
(expect
  "Embedding is not enabled for this object."
  (with-embedding-enabled-and-new-secret-key
    (tt/with-temp Dashboard [dash]
      (http/client :get 400 (dashboard-url dash)))))

;; check that if embedding is enabled globally and for the object that requests fail if they are signed with the wrong key
(expect
  "Message seems corrupt or manipulated."
  (with-embedding-enabled-and-new-secret-key
    (tt/with-temp Dashboard [dash {:enable_embedding true}]
      (http/client :get 400 (with-new-secret-key (dashboard-url dash))))))

;; check that only ENABLED params that ARE NOT PRESENT IN THE JWT come back
(expect
  [{:slug "d", :name "d", :type "date"}]
  (with-embedding-enabled-and-new-secret-key
    (tt/with-temp Dashboard [dash {:enable_embedding true
                                   :embedding_params {:a "locked", :b "disabled", :c "enabled", :d "enabled"}
                                   :parameters       [{:slug "a", :name "a", :type "date"}
                                                      {:slug "b", :name "b", :type "date"}
                                                      {:slug "c", :name "c", :type "date"}
                                                      {:slug "d", :name "d", :type "date"}]}]
      (:parameters (http/client :get 200 (dashboard-url dash {:params {:c 100}}))))))


;; ------------------------------------------------------------ GET /api/embed/dashboard/:token/dashcard/:dashcard-id/card/:card-id ------------------------------------------------------------

(defn- dashcard-url [dashcard & [additional-token-params]]
  (str "embed/dashboard/" (dash-token (:dashboard_id dashcard) additional-token-params)
       "/dashcard/" (u/get-id dashcard)
       "/card/" (:card_id dashcard)))

;; it should be possible to run a Card successfully if you jump through the right hoops...
(expect
  (successful-query-results)
  (with-embedding-enabled-and-new-secret-key
    (with-temp-dashcard [dashcard {:dash {:enable_embedding true}}]
      (http/client :get 200 (dashcard-url dashcard)))))

;; but if the card has an invalid query we should just get a generic "query failed" exception (rather than leaking query info)
(expect
  "An error occurred while running the query."
  (with-embedding-enabled-and-new-secret-key
    (with-temp-dashcard [dashcard {:dash {:enable_embedding true}
                                   :card {:dataset_query {:database (data/id), :type :native, :native {:query "SELECT * FROM XYZ"}}}}]
      (http/client :get 400 (dashcard-url dashcard)))))

;; check that the endpoint doesn't work if embedding isn't enabled
(expect
  "Embedding is not enabled."
  (tu/with-temporary-setting-values [enable-embedding false]
    (with-new-secret-key
      (with-temp-dashcard [dashcard]
        (http/client :get 400 (dashcard-url dashcard))))))

;; check that if embedding *is* enabled globally but not for the Dashboard the request fails
(expect
  "Embedding is not enabled for this object."
  (with-embedding-enabled-and-new-secret-key
    (with-temp-dashcard [dashcard]
      (http/client :get 400 (dashcard-url dashcard)))))

;; check that if embedding is enabled globally and for the object that requests fail if they are signed with the wrong key
(expect
  "Message seems corrupt or manipulated."
  (with-embedding-enabled-and-new-secret-key
    (with-temp-dashcard [dashcard {:dash {:enable_embedding true}}]
      (http/client :get 400 (with-new-secret-key (dashcard-url dashcard))))))

;;; LOCKED params

;; check that if embedding is enabled globally and for the object requests fail if the token is missing a `:locked` parameter
(expect
  "You must specify a value for :abc in the JWT."
  (with-embedding-enabled-and-new-secret-key
    (with-temp-dashcard [dashcard {:dash {:enable_embedding true, :embedding_params {:abc "locked"}}}]
      (http/client :get 400 (dashcard-url dashcard)))))

;; if `:locked` param is supplied, request should succeed
(expect
  (successful-query-results)
  (with-embedding-enabled-and-new-secret-key
    (with-temp-dashcard [dashcard {:dash {:enable_embedding true, :embedding_params {:abc "locked"}}}]
      (http/client :get 200 (dashcard-url dashcard {:params {:abc 100}})))))

;; if `:locked` parameter is present in URL params, request should fail
(expect
  "You must specify a value for :abc in the JWT."
  (with-embedding-enabled-and-new-secret-key
    (with-temp-dashcard [dashcard {:dash {:enable_embedding true, :embedding_params {:abc "locked"}}}]
      (http/client :get 400 (str (dashcard-url dashcard) "?abc=100")))))

;;; DISABLED params

;; check that if embedding is enabled globally and for the object requests fail if they pass a `:disabled` parameter
(expect
  "You're not allowed to specify a value for :abc."
  (with-embedding-enabled-and-new-secret-key
    (with-temp-dashcard [dashcard {:dash {:enable_embedding true, :embedding_params {:abc "disabled"}}}]
      (http/client :get 400 (dashcard-url dashcard {:params {:abc 100}})))))

;; If a `:disabled` param is passed in the URL the request should fail
(expect
  "You're not allowed to specify a value for :abc."
  (with-embedding-enabled-and-new-secret-key
    (with-temp-dashcard [dashcard {:dash {:enable_embedding true, :embedding_params {:abc "disabled"}}}]
      (http/client :get 400 (str (dashcard-url dashcard) "?abc=200")))))

;;; ENABLED params

;; If `:enabled` param is present in both JWT and the URL, the request should fail
(expect
  "You can't specify a value for :abc if it's already set in the JWT."
  (with-embedding-enabled-and-new-secret-key
    (with-temp-dashcard [dashcard {:dash {:enable_embedding true, :embedding_params {:abc "enabled"}}}]
      (http/client :get 400 (str (dashcard-url dashcard {:params {:abc 100}}) "?abc=200")))))

;; If an `:enabled` param is present in the JWT, that's ok
(expect
  (successful-query-results)
  (with-embedding-enabled-and-new-secret-key
    (with-temp-dashcard [dashcard {:dash {:enable_embedding true, :embedding_params {:abc "enabled"}}}]
      (http/client :get 200 (dashcard-url dashcard {:params {:abc 100}})))))

;; If an `:enabled` param is present in URL params but *not* the JWT, that's ok
(expect
  (successful-query-results)
  (with-embedding-enabled-and-new-secret-key
    (with-temp-dashcard [dashcard {:dash {:enable_embedding true, :embedding_params {:abc "enabled"}}}]
      (http/client :get 200 (str (dashcard-url dashcard) "?abc=200")))))


;;; ------------------------------------------------------------ Other Tests ------------------------------------------------------------

(tu/resolve-private-vars metabase.api.embed
  remove-locked-and-disabled-params)

;; parameters that are not in the `embedding-params` map at all should get removed by `remove-locked-and-disabled-params`
(expect
  {:parameters []}
  (remove-locked-and-disabled-params {:parameters {:slug "foo"}} {}))
