(ns metabase.api.preview-embed-test
  (:require [clojure.test :refer :all]
            [metabase.api.embed-test :as embed-test]
            [metabase.api.pivots :as pivots]
            [metabase.models.card :refer [Card]]
            [metabase.models.dashboard :refer [Dashboard]]
            [metabase.test :as mt]
            [metabase.test.util :as tu]
            [metabase.util :as u]))

;;; --------------------------------------- GET /api/preview_embed/card/:token ---------------------------------------

(defn- card-url [card & [additional-token-params]]
  (str "preview_embed/card/" (embed-test/card-token card (merge {:_embedding_params {}} additional-token-params))))

(deftest card-test
  (testing "GET /api/preview_embed/card/:token"
    (embed-test/with-embedding-enabled-and-new-secret-key
      (embed-test/with-temp-card [card]
        (testing "it should be possible to use this endpoint successfully if all the conditions are met"
          (is (= embed-test/successful-card-info
                 (embed-test/dissoc-id-and-name
                  (mt/user-http-request :crowberto :get 200 (card-url card))))))

        (testing "if the user is not an admin this endpoint should fail"
          (is (= "You don't have permissions to do that."
                 (mt/user-http-request :rasta :get 403 (card-url card)))))

        (testing "check that the endpoint doesn't work if embedding isn't enabled"
          (tu/with-temporary-setting-values [enable-embedding false]
            (is (= "Embedding is not enabled."
                   (embed-test/with-temp-card [card]
                     (mt/user-http-request :crowberto :get 400 (card-url card)))))))

        (testing "check that if embedding is enabled globally requests fail if they are signed with the wrong key"
          (is (= "Message seems corrupt or manipulated."
                 (mt/user-http-request :crowberto :get 400 (embed-test/with-new-secret-key (card-url card))))))

        (testing "Check that only ENABLED params that ARE NOT PRESENT IN THE JWT come back"
          (embed-test/with-temp-card [card {:dataset_query
                                            {:database (mt/id)
                                             :type     :native
                                             :native   {:template-tags {:a {:type "date", :name "a", :display_name "a"}
                                                                        :b {:type "date", :name "b", :display_name "b"}
                                                                        :c {:type "date", :name "c", :display_name "c"}
                                                                        :d {:type "date", :name "d", :display_name "d"}}}}}]
            (is (= [{:id      nil
                     :type    "date/single"
                     :target  ["variable" ["template-tag" "d"]]
                     :name    "d"
                     :slug    "d"
                     :default nil}]
                   (-> (mt/user-http-request :crowberto :get 200 (card-url card {:_embedding_params {:a "locked"
                                                                                                          :b "disabled"
                                                                                                          :c "enabled"
                                                                                                          :d "enabled"}
                                                                                      :params            {:c 100}}))
                       :parameters)))))))))

;;; ------------------------------------ GET /api/preview_embed/card/:token/query ------------------------------------

(defn- card-query-url [card & [additional-token-params]]
  (str "preview_embed/card/"
       (embed-test/card-token card (merge {:_embedding_params {}} additional-token-params))
       "/query"))

(deftest query-test
  (testing "GET /api/preview_embed/card/:token/query"
    (embed-test/with-embedding-enabled-and-new-secret-key
      (embed-test/with-temp-card [card]
        (testing "It should be possible to run a Card successfully if you jump through the right hoops..."
          (embed-test/test-query-results
           (mt/user-http-request :crowberto :get 202 (card-query-url card))))

        (testing "if the user is not an admin this endpoint should fail"
          (is (= "You don't have permissions to do that."
                 (mt/user-http-request :rasta :get 403 (card-query-url card)))))

        (testing "check that the endpoint doesn't work if embedding isn't enabled"
          (tu/with-temporary-setting-values [enable-embedding false]
            (is (= "Embedding is not enabled."
                   (mt/user-http-request :crowberto :get 400 (card-query-url card))))))

        (testing "check that if embedding is enabled globally requests fail if they are signed with the wrong key"
          (is (= "Message seems corrupt or manipulated."
                 (mt/user-http-request :crowberto :get 400 (embed-test/with-new-secret-key (card-query-url card))))))))))

(deftest query-locked-params-test
  (testing "GET /api/preview_embed/card/:token/query"
    (testing "LOCKED params"
      (embed-test/with-embedding-enabled-and-new-secret-key
        (embed-test/with-temp-card [card]
          (testing "check that if embedding is enabled globally fail if the token is missing a `:locked` parameter"
            (is (= "You must specify a value for :abc in the JWT."
                   (mt/user-http-request :crowberto :get 400 (card-query-url card {:_embedding_params {:abc "locked"}})))))

          (testing "if `:locked` param is supplied, request should succeed"
            (embed-test/test-query-results
             (mt/user-http-request :crowberto :get 202 (card-query-url card {:_embedding_params {:abc "locked"}
                                                                             :params            {:abc 100}}))))

          (testing "if `:locked` parameter is present in URL params, request should fail"
            (is (= "You can only specify a value for :abc in the JWT."
                   (mt/user-http-request :crowberto :get 400 (str (card-query-url card {:_embedding_params {:abc "locked"}
                                                                                        :params            {:abc 100}})
                                                                  "?abc=200"))))))))))

(deftest query-disabled-params-test
  (testing "GET /api/preview_embed/card/:token/query"
    (testing "DISABLED params"
      (embed-test/with-embedding-enabled-and-new-secret-key
        (embed-test/with-temp-card [card]
          (testing "check that if embedding is enabled globally and for the object requests fail if they pass a `:disabled` parameter"
            (is (= "You're not allowed to specify a value for :abc."
                   (mt/user-http-request :crowberto :get 400 (card-query-url card {:_embedding_params {:abc "disabled"}
                                                                                   :params            {:abc 100}})))))

          (testing "If a `:disabled` param is passed in the URL the request should fail"
            (is (= "You're not allowed to specify a value for :abc."
                   (mt/user-http-request :crowberto :get 400 (str (card-query-url card {:_embedding_params {:abc "disabled"}})
                                                                  "?abc=200"))))))))))

(deftest query-enabled-params-test
  (testing "GET /api/preview_embed/card/:token/query"
    (testing "ENABLED params"
      (embed-test/with-embedding-enabled-and-new-secret-key
        (embed-test/with-temp-card [card]
          (testing "If `:enabled` param is present in both JWT and the URL, the request should fail"
            (is (= "You can't specify a value for :abc if it's already set in the JWT."
                   (mt/user-http-request :crowberto :get 400 (str (card-query-url card {:_embedding_params {:abc "enabled"}
                                                                                        :params            {:abc 100}})
                                                                  "?abc=200")))))

          (testing "If an `:enabled` param is present in the JWT, that's ok"
            (embed-test/test-query-results
             (mt/user-http-request :crowberto :get 202 (card-query-url card {:_embedding_params {:abc "enabled"}
                                                                             :params            {:abc "enabled"}}))))
          (testing "If an `:enabled` param is present in URL params but *not* the JWT, that's ok"
            (embed-test/test-query-results
             (mt/user-http-request :crowberto :get 202 (str (card-query-url card {:_embedding_params {:abc "enabled"}})
                                                            "?abc=200")))))))))


;;; ------------------------------------ GET /api/preview_embed/dashboard/:token -------------------------------------

(defn- dashboard-url {:style/indent 1} [dashboard & [additional-token-params]]
  (str "preview_embed/dashboard/" (embed-test/dash-token dashboard (merge {:_embedding_params {}}
                                                                          additional-token-params))))

(deftest dashboard-test
  (testing "GET /api/preview_embed/dashboard/:token"
    (embed-test/with-embedding-enabled-and-new-secret-key
      (mt/with-temp Dashboard [dash]
        (testing "it should be possible to call this endpoint successfully..."
          (is (= embed-test/successful-dashboard-info
                 (embed-test/dissoc-id-and-name
                   (mt/user-http-request :crowberto :get 200 (dashboard-url dash))))))

        (testing "...but if the user is not an admin this endpoint should fail"
          (is (= "You don't have permissions to do that."
                 (mt/user-http-request :rasta :get 403 (dashboard-url dash)))))

        (testing "check that the endpoint doesn't work if embedding isn't enabled"
          (tu/with-temporary-setting-values [enable-embedding false]
            (is (= "Embedding is not enabled."
                   (mt/user-http-request :crowberto :get 400 (dashboard-url dash))))))

        (testing "check that if embedding is enabled globally requests fail if they are signed with the wrong key"
          (is (= "Message seems corrupt or manipulated."
                 (mt/user-http-request :crowberto :get 400 (embed-test/with-new-secret-key (dashboard-url dash))))))))))

(deftest only-enabled-params-not-in-jwt-test
  (testing "Check that only ENABLED params that ARE NOT PRESENT IN THE JWT come back"
    (embed-test/with-embedding-enabled-and-new-secret-key
      (mt/with-temp Dashboard [dash {:parameters [{:id "_a", :slug "a", :name "a", :type "date"}
                                                  {:id "_b", :slug "b", :name "b", :type "date"}
                                                  {:id "_c", :slug "c", :name "c", :type "date"}
                                                  {:id "_d", :slug "d", :name "d", :type "date"}]}]
        (is (= [{:id "_d", :slug "d", :name "d", :type "date"}]
               (:parameters (mt/user-http-request :crowberto :get 200 (dashboard-url dash
                                                                        {:params            {:c 100}
                                                                         :_embedding_params {:a "locked"
                                                                                             :b "disabled"
                                                                                             :c "enabled"
                                                                                             :d "enabled"}})))))))))

;;; ------------------ GET /api/preview_embed/dashboard/:token/dashcard/:dashcard-id/card/:card-id -------------------

(defn- dashcard-url {:style/indent 1} [dashcard & [additional-token-params]]
  (str "preview_embed/dashboard/" (embed-test/dash-token (:dashboard_id dashcard) (merge {:_embedding_params {}}
                                                                                         additional-token-params))
       "/dashcard/" (u/the-id dashcard)
       "/card/" (:card_id dashcard)))

(deftest dashcard-test
  (testing "/api/preview_embed/dashboard/:token/dashcard/:dashcard-id/card/:card-id"
    (embed-test/with-embedding-enabled-and-new-secret-key
      (embed-test/with-temp-dashcard [dashcard]
        (testing "It should be possible to run a Card successfully if you jump through the right hoops..."
          (embed-test/test-query-results
           (mt/user-http-request :crowberto :get 202 (dashcard-url dashcard))))

        (testing "...but if the user is not an admin this endpoint should fail"
          (is (= "You don't have permissions to do that."
                 (mt/user-http-request :rasta :get 403 (dashcard-url dashcard)))))

        (testing "check that the endpoint doesn't work if embedding isn't enabled"
          (is (= "Embedding is not enabled."
                 (tu/with-temporary-setting-values [enable-embedding false]
                   (mt/user-http-request :crowberto :get 400 (dashcard-url dashcard))))))

        (testing "check that if embedding is enabled globally requests fail if they are signed with the wrong key"
          (is (= "Message seems corrupt or manipulated."
                 (mt/user-http-request :crowberto :get 400 (embed-test/with-new-secret-key (dashcard-url dashcard))))))))))

(deftest dashcard-locked-params-test
  (testing "/api/preview_embed/dashboard/:token/dashcard/:dashcard-id/card/:card-id"
    (testing "LOCKED params"
      (embed-test/with-embedding-enabled-and-new-secret-key
        (embed-test/with-temp-dashcard [dashcard]
          (testing "check that if embedding is enabled globally fail if the token is missing a `:locked` parameter"
            (is (= "You must specify a value for :abc in the JWT."
                   (mt/user-http-request :crowberto :get 400 (dashcard-url dashcard
                                                                           {:_embedding_params {:abc "locked"}})))))

          (testing "If `:locked` param is supplied, request should succeed"
            (embed-test/test-query-results
             (mt/user-http-request :crowberto :get 202
                                   (dashcard-url dashcard {:_embedding_params {:abc "locked"}, :params {:abc 100}}))))

          (testing "If `:locked` parameter is present in URL params, request should fail"
            (is (= "You can only specify a value for :abc in the JWT."
                   (mt/user-http-request :crowberto :get 400 (str (dashcard-url dashcard
                                                                                {:_embedding_params {:abc "locked"}, :params {:abc 100}})
                                                                  "?abc=200"))))))))))

(deftest dashcard-disabled-params-test
  (testing "/api/preview_embed/dashboard/:token/dashcard/:dashcard-id/card/:card-id"
    (testing "DISABLED params"
      (embed-test/with-embedding-enabled-and-new-secret-key
        (embed-test/with-temp-dashcard [dashcard]
          (testing "check that if embedding is enabled globally and for the object requests fail if they pass a `:disabled` parameter"
            (is (= "You're not allowed to specify a value for :abc."
                   (mt/user-http-request :crowberto :get 400 (dashcard-url dashcard
                                                               {:_embedding_params {:abc "disabled"}, :params {:abc 100}})))))

          (testing "If a `:disabled` param is passed in the URL the request should fail"
            (is (= "You're not allowed to specify a value for :abc."
                   (mt/user-http-request :crowberto :get 400 (str (dashcard-url dashcard {:_embedding_params {:abc "disabled"}})
                                                                  "?abc=200"))))))))))

(deftest dashcard-disabled-params-test
  (testing "/api/preview_embed/dashboard/:token/dashcard/:dashcard-id/card/:card-id"
    (testing "ENABLED params"
      (embed-test/with-embedding-enabled-and-new-secret-key
        (embed-test/with-temp-dashcard [dashcard]
          (testing "If `:enabled` param is present in both JWT and the URL, the request should fail"
            (is (= "You can't specify a value for :abc if it's already set in the JWT."
                   (mt/user-http-request :crowberto :get 400 (str (dashcard-url dashcard {:_embedding_params {:abc "enabled"}
                                                                                          :params            {:abc 100}})
                                                                  "?abc=200")))))

          (testing "If an `:enabled` param is present in the JWT, that's ok"
            (embed-test/test-query-results
             (mt/user-http-request :crowberto :get 202 (dashcard-url dashcard {:_embedding_params {:abc "enabled"}
                                                                               :params            {:abc 100}}))))

          (testing "If an `:enabled` param is present in URL params but *not* the JWT, that's ok"
            (embed-test/test-query-results
             (mt/user-http-request :crowberto :get 202 (str (dashcard-url dashcard {:_embedding_params {:abc "enabled"}})
                                                            "?abc=200")))))))))

(deftest dashcard-editable-query-params-test
  (testing (str "Check that editable query params work correctly and keys get coverted from strings to keywords, even "
                "if they're something that our middleware doesn't normally assume is implicitly convertable to a "
                "keyword. See `ring.middleware.keyword-params/keyword-syntax?` (#6783)")
    (embed-test/with-embedding-enabled-and-new-secret-key
      (embed-test/with-temp-dashcard [dashcard {:dash {:enable_embedding true}}]
        (is (= "completed"
               (-> (mt/user-http-request :crowberto :get 202 (str (dashcard-url dashcard
                                                                    {:_embedding_params {:num_birds     :locked
                                                                                         :2nd_date_seen :enabled}
                                                                     :params            {:num_birds 2}})
                                                                  "?2nd_date_seen=2018-02-14"))
                   :status)))))))

(deftest editable-params-should-not-be-invalid-test
  (testing "Make sure that editable params do not result in \"Invalid Parameter\" exceptions (#7212)"
    (embed-test/with-embedding-enabled-and-new-secret-key
      (mt/with-temp Card [card {:dataset_query {:database (mt/id)
                                                :type     :native
                                                :native   {:query         "SELECT {{num}} AS num"
                                                           :template-tags {:num {:name         "num"
                                                                                 :display_name "Num"
                                                                                 :type         "number"
                                                                                 :required     true
                                                                                 :default      "1"}}}}}]
        (embed-test/with-temp-dashcard [dashcard {:dash     {:parameters [{:name "Num"
                                                                           :slug "num"
                                                                           :id   "537e37b4"
                                                                           :type "category"}]}
                                                  :dashcard {:card_id            (u/the-id card)
                                                             :parameter_mappings [{:card_id      (u/the-id card)
                                                                                   :target       [:variable
                                                                                                  [:template-tag :num]]
                                                                                   :parameter_id "537e37b4"}]}}]
          (-> (is (= [[50]]
                     (mt/rows (mt/user-http-request :crowberto :get
                                                    (str (dashcard-url dashcard {:_embedding_params {:num "enabled"}})
                                                         "?num=50")))))))))))

(deftest postgres-convert-parameters-to-numbers-test
  (mt/test-driver :postgres
    (testing "Make sure that ID params correctly get converted to numbers as needed (Postgres-specific)..."
      (embed-test/with-embedding-enabled-and-new-secret-key
        (mt/with-temp Card [card {:dataset_query {:database (mt/id)
                                                  :type     :query
                                                  :query    {:source-table (mt/id :venues)
                                                             :aggregation  [:count]}}}]
          (embed-test/with-temp-dashcard [dashcard {:dash     {:parameters [{:name "Venue ID"
                                                                             :slug "venue_id"
                                                                             :id   "22486e00"
                                                                             :type "id"}]}
                                                    :dashcard {:card_id            (u/the-id card)
                                                               :parameter_mappings [{:parameter_id "22486e00"
                                                                                     :card_id      (u/the-id card)
                                                                                     :target       [:dimension
                                                                                                    [:field-id
                                                                                                     (mt/id :venues :id)]]}]}}]
            (is (= [[1]]
                   (mt/rows (mt/user-http-request :crowberto :get (str (dashcard-url dashcard {:_embedding_params {:venue_id "enabled"}})
                                                                       "?venue_id=1")))))))))))


;; pivot tables

(defn- pivot-card-query-url [card & [additional-token-params]]
  (str "preview_embed/pivot/card/"
       (embed-test/card-token card (merge {:_embedding_params {}} additional-token-params))
       "/query"))

(deftest pivot-query-test
  (mt/test-drivers pivots/applicable-drivers
    (mt/dataset sample-dataset
      (testing "GET /api/preview_embed/pivot/card/:token/query"
        (testing "successful preview"
          (let [result (embed-test/with-embedding-enabled-and-new-secret-key
                         (embed-test/with-temp-card [card (pivots/pivot-card)]
                           (mt/user-http-request :crowberto :get 202 (pivot-card-query-url card))))
                rows   (mt/rows result)]
            (is (nil? (:row_count result))) ;; row_count isn't included in public endpoints
            (is (= "completed" (:status result)))
            (is (= 6 (count (get-in result [:data :cols]))))
            (is (= 1144 (count rows)))))

        (testing "should fail if user is not an admin"
          (is (= "You don't have permissions to do that."
                 (embed-test/with-embedding-enabled-and-new-secret-key
                   (embed-test/with-temp-card [card (pivots/pivot-card)]
                     (mt/user-http-request :rasta :get 403 (pivot-card-query-url card)))))))

        (testing "should fail if embedding is disabled"
          (is (= "Embedding is not enabled."
                 (tu/with-temporary-setting-values [enable-embedding false]
                   (embed-test/with-new-secret-key
                     (embed-test/with-temp-card [card (pivots/pivot-card)]
                       (mt/user-http-request :crowberto :get 400 (pivot-card-query-url card))))))))

        (testing "should fail if embedding is enabled and the wrong key is used"
          (is (= "Message seems corrupt or manipulated."
                 (embed-test/with-embedding-enabled-and-new-secret-key
                   (embed-test/with-temp-card [card (pivots/pivot-card)]
                     (mt/user-http-request :crowberto :get 400 (embed-test/with-new-secret-key (pivot-card-query-url card))))))))))))

(defn- pivot-dashcard-url {:style/indent 1} [dashcard & [additional-token-params]]
  (str "preview_embed/pivot/dashboard/"
       (embed-test/dash-token (:dashboard_id dashcard) (merge {:_embedding_params {}}
                                                              additional-token-params))
       "/dashcard/" (u/the-id dashcard)
       "/card/" (:card_id dashcard)))

(deftest pivot-card-id-test
  (mt/test-drivers pivots/applicable-drivers
    (mt/dataset sample-dataset
      (testing "GET /api/preview_embed/pivot/dashboard/:token/dashcard/:dashcard-id/card/:card-id"
        (testing "successful preview"
          (let [result (embed-test/with-embedding-enabled-and-new-secret-key
                         (embed-test/with-temp-dashcard [dashcard {:card (pivots/pivot-card)}]
                           (mt/user-http-request :crowberto :get 202 (pivot-dashcard-url dashcard))))
                rows   (mt/rows result)]
            (is (nil? (:row_count result))) ;; row_count isn't included in public endpoints
            (is (= "completed" (:status result)))
            (is (= 6 (count (get-in result [:data :cols]))))
            (is (= 1144 (count rows)))))

       (testing "should fail if user is not an admin"
          (is (= "You don't have permissions to do that."
                 (embed-test/with-embedding-enabled-and-new-secret-key
                   (embed-test/with-temp-dashcard [dashcard {:card (pivots/pivot-card)}]
                     (mt/user-http-request :rasta :get 403 (pivot-dashcard-url dashcard)))))))

        (testing "should fail if embedding is disabled"
          (is (= "Embedding is not enabled."
                 (tu/with-temporary-setting-values [enable-embedding false]
                   (embed-test/with-new-secret-key
                     (embed-test/with-temp-dashcard [dashcard {:card (pivots/pivot-card)}]
                       (mt/user-http-request :crowberto :get 400 (pivot-dashcard-url dashcard))))))))

        (testing "should fail if embedding is enabled and the wrong key is used"
          (is (= "Message seems corrupt or manipulated."
                 (embed-test/with-embedding-enabled-and-new-secret-key
                   (embed-test/with-temp-dashcard [dashcard {:card (pivots/pivot-card)}]
                     (mt/user-http-request :crowberto :get 400 (embed-test/with-new-secret-key (pivot-dashcard-url dashcard))))))))))))
