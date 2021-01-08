(ns metabase.api.advanced-computation.public-test
  (:require [cheshire.core :as json]
            [clojure.test :refer :all]
            [metabase.api.advanced-computation.common-test :as common]
            [metabase.api.embed-test :as embed-test]
            [metabase.http-client :as http]
            [metabase.models :refer [Card Dashboard DashboardCard]]
            [metabase.test :as mt]
            [metabase.test.util :as tu]
            [metabase.util :as u]
            [toucan.db :as db]))

;; public endpoints

(defmacro ^:private with-temp-pivot-public-card {:style/indent 1} [[binding & [card]] & body]
  `(let [card-settings# (merge (common/pivot-card) (common/shared-obj) ~card)]
     (mt/with-temp Card [card# card-settings#]
       ;; add :public_uuid back in to the value that gets bound because it might not come back from post-select if
       ;; public sharing is disabled; but we still want to test it
       (let [~binding (assoc card# :public_uuid (:public_uuid card-settings#))]
         ~@body))))

(deftest pivot-public-card-test
  (mt/test-drivers common/applicable-drivers
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
                              (common/shared-obj)
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
  (mt/test-drivers common/applicable-drivers
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

(defn card-token {:style/indent 1} [card-or-id & [additional-token-params]]
  (embed-test/sign (merge {:resource {:question (u/get-id card-or-id)}
                           :params   {}}
                          additional-token-params)))

(defn- card-query-url [card response-format & [additional-token-params]]
  (str "advanced_computation/public/pivot/embed/card/"
       (card-token card additional-token-params)
       "/query"
       response-format))

(deftest embed-query-test
  (mt/test-drivers common/applicable-drivers
    (mt/dataset sample-dataset
      (testing "GET /api/advanced_computation/public/pivot/embed/card/:token/query"
        (testing "check that the endpoint doesn't work if embedding isn't enabled"
          (tu/with-temporary-setting-values [enable-embedding false]
            (embed-test/with-new-secret-key
              (common/with-temp-card [card]
                (is (= "Embedding is not enabled."
                       (http/client :get 400 (card-query-url card ""))))))))

        (embed-test/with-embedding-enabled-and-new-secret-key
          (let [expected-status 202]
            (testing "it should be possible to run a Card successfully if you jump through the right hoops..."
              (common/with-temp-card [card {:enable_embedding true}]
                (let [result (http/client :get expected-status (card-query-url card "") {:request-options nil})
                      rows   (mt/rows result)]
                  (is (nil? (:row_count result))) ;; row_count isn't included in public endpoints
                  (is (= "completed" (:status result)))
                  (is (= 6 (count (get-in result [:data :cols]))))
                  (is (= 2273 (count rows)))))))

          (testing "check that if embedding *is* enabled globally but not for the Card the request fails"
            (common/with-temp-card [card]
              (is (= "Embedding is not enabled for this object."
                     (http/client :get 400 (card-query-url card ""))))))

          (testing (str "check that if embedding is enabled globally and for the object that requests fail if they are "
                        "signed with the wrong key")
            (common/with-temp-card [card {:enable_embedding true}]
              (is (= "Message seems corrupt or manipulated."
                     (http/client :get 400 (embed-test/with-new-secret-key (card-query-url card ""))))))))))))
