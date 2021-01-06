(ns metabase.api.advanced-computation-test
  "Unit tests for /api/advanced_computation endpoints."
  (:require [buddy.sign.jwt :as jwt]
            [cheshire.core :as json]
            [clojure.test :refer :all]
            [crypto.random :as crypto-random]
            [metabase.api.embed-test :as embed-test]
            [metabase.http-client :as http]
            [metabase.models :refer [Card Dashboard DashboardCard]]
            [metabase.test :as mt]
            [metabase.test.fixtures :as fixtures]
            [metabase.test.util :as tu]
            [metabase.util :as u]
            [toucan.db :as db])
  (:import java.util.UUID))

(use-fixtures :once (fixtures/initialize :db))

(def ^:private applicable-drivers
  ;; Redshift takes A LONG TIME to insert the sample-dataset, so do not
  ;; run these tests against Redshift (for now?)
  ;;TODO: refactor Redshift testing to support a bulk COPY or something
  ;; other than INSERT INTO statements
  (disj (mt/normal-drivers-with-feature :expressions :left-join) :redshift))

(defn- pivot-query
  []
  (-> (mt/mbql-query orders
        {:aggregation [[:count] [:sum $orders.quantity]]
         :breakout    [[:fk-> $orders.user_id $people.state]
                       [:fk-> $orders.user_id $people.source]
                       [:fk-> $orders.product_id $products.category]]})
      (assoc :pivot_rows [1 0]
             :pivot_cols [2])))

(defn- filters-query
  []
  (-> (mt/mbql-query orders
        {:aggregation [[:count]]
         :breakout    [[:fk-> $orders.user_id $people.state]
                       [:fk-> $orders.user_id $people.source]]
         :filter      [:and [:= [:fk-> $orders.user_id $people.source] "Google" "Organic"]]})
      (assoc :pivot_rows [0]
             :pivot_cols [1])))

(defn- parameters-query
  []
  (-> (mt/mbql-query orders
        {:aggregation [[:count]]
         :breakout    [[:fk-> $orders.user_id $people.state]
                       [:fk-> $orders.user_id $people.source]]
         :filter      [:and [:= [:fk-> $orders.user_id $people.source] "Google" "Organic"]]
         :parameters  [{:type   "category"
                        :target [:dimension [:fk-> $orders.product_id $products.category]]
                        :value  "Gadget"}]})
      (assoc :pivot_rows [0]
             :pivot_cols [1])))

(defn- pivot-card
  []
  {:dataset_query (pivot-query)})

(defn- shared-obj []
  {:public_uuid       (str (UUID/randomUUID))
   :made_public_by_id (mt/user->id :crowberto)})

(defn- do-with-temp-pivot-card
  {:style/indent 0}
  [f]
  (mt/with-temp* [Card [card  {:dataset_query (pivot-query)}]]
    (f (mt/db) card)))

(defmacro ^:private with-temp-pivot-card
  {:style/indent 1}
  [[db-binding card-binding] & body]
  `(do-with-temp-pivot-card (fn [~(or db-binding '_) ~(or card-binding '_)]
                              ~@body)))

(defmacro ^:private with-temp-pivot-public-card {:style/indent 1} [[binding & [card]] & body]
  `(let [card-settings# (merge (pivot-card) (shared-obj) ~card)]
     (mt/with-temp Card [card# card-settings#]
       ;; add :public_uuid back in to the value that gets bound because it might not come back from post-select if
       ;; public sharing is disabled; but we still want to test it
       (let [~binding (assoc card# :public_uuid (:public_uuid card-settings#))]
         ~@body))))

(deftest pivot-dataset-test
  (mt/test-drivers applicable-drivers
    (mt/dataset sample-dataset
      (testing "POST /api/advanced_computation/pivot/dataset"
        (testing "Run a pivot table"
          (let [result (mt/user-http-request :rasta :post 202 "advanced_computation/pivot/dataset" (pivot-query))
                rows   (mt/rows result)]
            (is (= 1192 (:row_count result)))
            (is (= "completed" (:status result)))
            (is (= 6 (count (get-in result [:data :cols]))))
            (is (= 1192 (count rows)))

            (is (= ["AK" "Affiliate" "Doohickey" 0 18 81] (first rows)))
            (is (= ["WV" "Facebook" nil 4 45 292] (nth rows 1000)))
            (is (= [nil nil nil 7 18760 69540] (last rows)))))

        (testing "with an added expression"
          (let [query (-> (pivot-query)
                          (assoc-in [:query :fields] [[:expression "test-expr"]])
                          (assoc-in [:query :expressions] {:test-expr [:ltrim "wheeee"]}))
                result (mt/user-http-request :rasta :post 202 "advanced_computation/pivot/dataset" query)
                rows (mt/rows result)]
            (is (= 1192 (:row_count result)))
            (is (= 1192 (count rows)))

            (let [cols (get-in result [:data :cols])]
              (is (= 7 (count cols)))
              (is (= {:base_type "type/Text"
                      :special_type nil
                      :name "test-expr"
                      :display_name "test-expr"
                      :expression_name "test-expr"
                      :field_ref ["expression" "test-expr"]
                      :source "breakout"}
                     (nth cols 3))))

            (is (= [nil nil nil "wheeee" 7 18760 69540] (last rows)))))))))

(deftest pivot-filter-dataset-test
  (mt/test-drivers applicable-drivers
    (mt/dataset sample-dataset
      (testing "POST /api/advanced_computation/pivot/dataset"
        (testing "Run a pivot table"
          (let [result (mt/user-http-request :rasta :post 202 "advanced_computation/pivot/dataset" (filters-query))
                rows   (mt/rows result)]
            (is (= 230 (:row_count result)))
            (is (= "completed" (:status result)))
            (is (= 4 (count (get-in result [:data :cols]))))
            (is (= 230 (count rows)))

            (is (= ["AK" "Google" 0 119] (first rows)))
            (is (= ["AK" "Organic" 0 89] (second rows)))
            (is (= ["MS" "Google" 0 43] (nth rows 135)))
            (is (= ["MS" nil 2 136] (nth rows 205)))
            (is (= [nil nil 3 7562] (last rows)))))))))

(deftest pivot-parameter-dataset-test
  (mt/test-drivers applicable-drivers
    (mt/dataset sample-dataset
      (testing "POST /api/advanced_computation/pivot/dataset"
        (testing "Run a pivot table"
          (let [result (mt/user-http-request :rasta :post 202 "advanced_computation/pivot/dataset" (parameters-query))
                rows   (mt/rows result)]
            (is (= 225 (:row_count result)))
            (is (= "completed" (:status result)))
            (is (= 4 (count (get-in result [:data :cols]))))
            (is (= 225 (count rows)))

            (is (= ["AK" "Google" 0 27] (first rows)))
            (is (= ["AK" "Organic" 0 25] (second rows)))
            (is (= ["MN" "Organic" 0 39] (nth rows 130)))
            (is (= ["NE" nil 2 59] (nth rows 205)))
            (is (= [nil nil 3 2009] (last rows)))))))))

(deftest pivot-card-test
  (mt/test-drivers applicable-drivers
    (mt/dataset sample-dataset
      (testing "POST /api/advanced_computation/pivot/card/id"
        (with-temp-pivot-card [_ card]
          (let [result (mt/user-http-request :rasta :post 202 (format "advanced_computation/pivot/card/%d/query" (u/get-id card)))
                rows   (mt/rows result)]
            (is (= 2273 (:row_count result)))
            (is (= "completed" (:status result)))
            (is (= 6 (count (get-in result [:data :cols]))))
            (is (= 2273 (count rows)))

            (is (= ["AK" "Affiliate" "Doohickey" 0 18 81] (first rows)))
            (is (= ["MS" "Organic" "Gizmo" 0 16 42] (nth rows 445)))
            (is (= ["ND" nil nil 6 589 2183] (nth rows 2250)))
            (is (= [nil nil nil 7 18760 69540] (last rows)))))))))

;; public endpoints

(defmacro ^:private with-temp-pivot-public-card {:style/indent 1} [[binding & [card]] & body]
  `(let [card-settings# (merge (pivot-card) (shared-obj) ~card)]
     (mt/with-temp Card [card# card-settings#]
       ;; add :public_uuid back in to the value that gets bound because it might not come back from post-select if
       ;; public sharing is disabled; but we still want to test it
       (let [~binding (assoc card# :public_uuid (:public_uuid card-settings#))]
         ~@body))))

(deftest pivot-public-card-test
  (mt/test-drivers applicable-drivers
    (mt/dataset sample-dataset
      (testing "GET /api/advanced_computation/public/pivot/card/:uuid/query"
        (mt/with-temporary-setting-values [enable-public-sharing true]
          (with-temp-pivot-public-card [{uuid :public_uuid}]
            (let [result (http/client :get 202 (format "advanced_computation/public/pivot/card/%s/query" uuid))
                  rows   (mt/rows result)]
              (is (nil? (:row_count result))) ;; row_count isn't included in public endpoints
              (is (= "completed" (:status result)))
              (is (= 6 (count (get-in result [:data :cols]))))
              (is (= 2273 (count rows)))

              (is (= ["AK" "Affiliate" "Doohickey" 0 18 81] (first rows)))
              (is (= ["CO" "Affiliate" "Gadget" 0 62 211] (nth rows 100)))
              (is (= ["ND" nil nil 6 589 2183] (nth rows 2250)))
              (is (= [nil nil nil 7 18760 69540] (last rows))))))))))

(defmacro ^:private with-temp-public-dashboard {:style/indent 1} [[binding & [dashboard]] & body]
  `(let [dashboard-settings# (merge
                              {:parameters [{:id      "_STATE_"
                                             :name    "State"
                                             :slug    "state"
                                             :type    "string"
                                             :target  [:dimension [:fk-> (mt/id :orders :user_id) (mt/id :people :state)]]
                                             :default nil}]}
                              (shared-obj)
                              ~dashboard)]
     (mt/with-temp Dashboard [dashboard# dashboard-settings#]
       (let [~binding (assoc dashboard# :public_uuid (:public_uuid dashboard-settings#))]
         ~@body))))

(defn- add-card-to-dashboard! {:style/indent 2} [card dashboard & {:as kvs}]
  (db/insert! DashboardCard (merge {:dashboard_id (u/get-id dashboard), :card_id (u/get-id card)}
                                   kvs)))

(defmacro ^:private with-temp-pivot-public-dashboard-and-card
  {:style/indent 1}
  [[dashboard-binding card-binding & [dashcard-binding]] & body]
  `(with-temp-public-dashboard [dash#]
     (with-temp-pivot-public-card [card#]
       (let [~dashboard-binding        dash#
             ~card-binding             card#
             ~(or dashcard-binding
                  (gensym "dashcard")) (add-card-to-dashboard! card# dash#)]
         ~@body))))

(defn- dashcard-url
  "URL for fetching results of a public DashCard."
  [dash card]
  (str "advanced_computation/public/pivot/dashboard/" (:public_uuid dash) "/card/" (u/get-id card)))

(deftest pivot-public-dashcard-test
  (mt/test-drivers applicable-drivers
    (mt/dataset sample-dataset
      (testing "GET /api/advanced_computation/public/pivot/dashboard/:uuid/card/:card-id"
        (testing "without parameters"
          (mt/with-temporary-setting-values [enable-public-sharing true]
            (with-temp-pivot-public-dashboard-and-card [dash card]
              (let [result (http/client :get 202 (dashcard-url dash card))
                    rows   (mt/rows result)]
                (is (nil? (:row_count result))) ;; row_count isn't included in public endpoints
                (is (= "completed" (:status result)))
                (is (= 6 (count (get-in result [:data :cols]))))
                (is (= 2273 (count rows)))

                (is (= ["AK" "Affiliate" "Doohickey" 0 18 81] (first rows)))
                (is (= ["CO" "Affiliate" "Gadget" 0 62 211] (nth rows 100)))
                (is (= ["ND" nil nil 6 589 2183] (nth rows 2250)))
                (is (= [nil nil nil 7 18760 69540] (last rows)))))))

        (testing "with parameters"
          (mt/with-temporary-setting-values [enable-public-sharing true]
            (with-temp-pivot-public-dashboard-and-card [dash card]
              (let [result (http/client :get 202 (dashcard-url dash card)
                                        :parameters (json/encode [{:name   "State"
                                                                   :slug   :state
                                                                   :target [:dimension [:fk-> (mt/id :orders :user_id) (mt/id :people :state)]]
                                                                   :value  ["CA" "WA"]}]))
                    rows   (mt/rows result)]
                (is (nil? (:row_count result))) ;; row_count isn't included in public endpoints
                (is (= "completed" (:status result)))
                (is (= 6 (count (get-in result [:data :cols]))))
                (is (= 131 (count rows)))

                (is (= ["CA" "Affiliate" "Doohickey" 0 16 48] (first rows)))
                (is (= [nil "Twitter" "Widget" 1 77 270] (nth rows 100)))
                (is (= [nil nil nil 7 1015 3758] (last rows)))))))))))

(defn random-embedding-secret-key [] (crypto-random/hex 32))

(def ^:dynamic *secret-key* nil)

(defn sign [claims] (jwt/sign claims *secret-key*))

(defn do-with-new-secret-key [f]
  (binding [*secret-key* (random-embedding-secret-key)]
    (tu/with-temporary-setting-values [embedding-secret-key *secret-key*]
      (f))))

(defmacro with-new-secret-key {:style/indent 0} [& body]
  `(do-with-new-secret-key (fn [] ~@body)))

(defmacro with-embedding-enabled-and-new-secret-key {:style/indent 0} [& body]
  `(tu/with-temporary-setting-values [~'enable-embedding true]
     (with-new-secret-key
       ~@body)))

(defmacro with-temp-card {:style/indent 1} [[card-binding & [card]] & body]
  `(mt/with-temp Card [~card-binding (merge (pivot-card) ~card)]
     ~@body))

(defn card-token {:style/indent 1} [card-or-id & [additional-token-params]]
  (sign (merge {:resource {:question (u/get-id card-or-id)}
                :params   {}}
               additional-token-params)))

(defn- card-query-url [card response-format & [additional-token-params]]
  (str "advanced_computation/public/pivot/embed/card/"
       (card-token card additional-token-params)
       "/query"
       response-format))

(deftest embed-query-test
  (mt/test-drivers applicable-drivers
    (mt/dataset sample-dataset
      (testing "GET /api/advanced_computation/public/pivot/embed/card/:token/query"
        (testing "check that the endpoint doesn't work if embedding isn't enabled"
          (tu/with-temporary-setting-values [enable-embedding false]
            (with-new-secret-key
              (with-temp-card [card]
                (is (= "Embedding is not enabled."
                       (http/client :get 400 (card-query-url card ""))))))))

        (with-embedding-enabled-and-new-secret-key
          (let [expected-status 202]
            (testing "it should be possible to run a Card successfully if you jump through the right hoops..."
              (with-temp-card [card {:enable_embedding true}]
                (let [result (http/client :get expected-status (card-query-url card "") {:request-options nil})
                      rows   (mt/rows result)]
                  (is (nil? (:row_count result))) ;; row_count isn't included in public endpoints
                  (is (= "completed" (:status result)))
                  (is (= 6 (count (get-in result [:data :cols]))))
                  (is (= 2273 (count rows)))))))

          (testing "check that if embedding *is* enabled globally but not for the Card the request fails"
            (with-temp-card [card]
              (is (= "Embedding is not enabled for this object."
                     (http/client :get 400 (card-query-url card ""))))))

          (testing (str "check that if embedding is enabled globally and for the object that requests fail if they are "
                        "signed with the wrong key")
            (with-temp-card [card {:enable_embedding true}]
              (is (= "Message seems corrupt or manipulated."
                     (http/client :get 400 (with-new-secret-key (card-query-url card ""))))))))))))

(defn- preview-embed-card-query-url [card & [additional-token-params]]
  (str "advanced_computation/public/pivot/preview_embed/card/"
       (embed-test/card-token card (merge {:_embedding_params {}} additional-token-params))
       "/query"))

;; (deftest preview-embed-card-test
;;   (mt/test-drivers applicable-drivers
;;     (mt/dataset sample-dataset
;;       (testing "GET /api/advanced_computation/public/pivot/preview_embed/card/:token/query"
;;         (testing "check that the endpoint doesn't work if embedding isn't enabled"
;;           (tu/with-temporary-setting-values [enable-embedding false]
;;             (with-new-secret-key
;;               (with-temp-card [card]
;;                 (is (= "Embedding is not enabled."
;;                        (mt/user-http-request :crowberto :get 400 (preview-embed-card-query-url card))))))))

;;         (with-embedding-enabled-and-new-secret-key
;;           (let [expected-status 202]
;;             (testing "it should be possible to run a Card successfully if you jump through the right hoops..."
;;               (with-temp-card [card {:enable_embedding true}]
;;                 (let [result (mt/user-http-request :crowberto :get 202 (preview-embed-card-query-url card))
;;                       _ (clojure.pprint/pprint result)
;;                       rows   (mt/rows result)]
;;                   (is (nil? (:row_count result))) ;; row_count isn't included in public endpoints
;;                   (is (= "completed" (:status result)))
;;                   (is (= 6 (count (get-in result [:data :cols]))))
;;                   (is (= 2273 (count rows)))))))

;;           (testing "check that if embedding *is* enabled globally but not for the Card the request fails"
;;             (with-temp-card [card]
;;               (is (= "Embedding is not enabled for this object."
;;                      (mt/user-http-request :crowberto :get 400 (preview-embed-card-query-url card))))))

;;           (testing (str "check that if embedding is enabled globally and for the object that requests fail if they are "
;;                         "signed with the wrong key")
;;             (with-temp-card [card]
;;               (is (= "Message seems corrupt or manipulated."
;;                      (mt/user-http-request :crowberto :get 400 (with-new-secret-key (preview-embed-card-query-url card))))))))))))
