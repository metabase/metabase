(ns metabase.api.preview-embed-test
  (:require [expectations :refer :all]
            [metabase.api.embed-test :as embed-test]
            [metabase.models
             [card :refer [Card]]
             [dashboard :refer [Dashboard]]]
            [metabase.test
             [data :as data]
             [util :as tu]]
            [metabase.test.data
             [datasets :as datasets]
             [users :as test-users]]
            [metabase.util :as u]
            [toucan.util.test :as tt]))

;;; --------------------------------------- GET /api/preview_embed/card/:token ---------------------------------------

(defn- card-url [card & [additional-token-params]]
  (str "preview_embed/card/" (embed-test/card-token card (merge {:_embedding_params {}} additional-token-params))))

;; it should be possible to use this endpoint successfully if all the conditions are met
(expect
  embed-test/successful-card-info
  (embed-test/with-embedding-enabled-and-new-secret-key
    (embed-test/with-temp-card [card]
      (embed-test/dissoc-id-and-name
        ((test-users/user->client :crowberto) :get 200 (card-url card))))))

;; ...but if the user is not an admin this endpoint should fail
(expect
  "You don't have permissions to do that."
  (embed-test/with-embedding-enabled-and-new-secret-key
    (embed-test/with-temp-card [card]
      ((test-users/user->client :rasta) :get 403 (card-url card)))))

;; check that the endpoint doesn't work if embedding isn't enabled
(expect
  "Embedding is not enabled."
  (tu/with-temporary-setting-values [enable-embedding false]
    (embed-test/with-new-secret-key
      (embed-test/with-temp-card [card]
        ((test-users/user->client :crowberto) :get 400 (card-url card))))))

;; check that if embedding is enabled globally requests fail if they are signed with the wrong key
(expect
  "Message seems corrupt or manipulated."
  (embed-test/with-embedding-enabled-and-new-secret-key
    (embed-test/with-temp-card [card]
      ((test-users/user->client :crowberto) :get 400 (embed-test/with-new-secret-key (card-url card))))))

;; Check that only ENABLED params that ARE NOT PRESENT IN THE JWT come back
(expect
  [{:id nil, :type "date/single", :target ["variable" ["template-tag" "d"]], :name "d", :slug "d", :default nil}]
  (embed-test/with-embedding-enabled-and-new-secret-key
    (embed-test/with-temp-card [card {:dataset_query
                                      {:database (data/id)
                                       :type     :native
                                       :native   {:template-tags {:a {:type "date", :name "a", :display_name "a"}
                                                                  :b {:type "date", :name "b", :display_name "b"}
                                                                  :c {:type "date", :name "c", :display_name "c"}
                                                                  :d {:type "date", :name "d", :display_name "d"}}}}}]
      (-> ((test-users/user->client :crowberto) :get 200 (card-url card {:_embedding_params {:a "locked"
                                                                                             :b "disabled"
                                                                                             :c "enabled"
                                                                                             :d "enabled"}
                                                                         :params            {:c 100}}))
          :parameters))))


;;; ------------------------------------ GET /api/preview_embed/card/:token/query ------------------------------------

(defn- card-query-url [card & [additional-token-params]]
  (str "preview_embed/card/"
       (embed-test/card-token card (merge {:_embedding_params {}} additional-token-params))
       "/query"))

;; It should be possible to run a Card successfully if you jump through the right hoops...
(expect
  (embed-test/successful-query-results)
  (embed-test/with-embedding-enabled-and-new-secret-key
    (embed-test/with-temp-card [card]
      ((test-users/user->client :crowberto) :get 200 (card-query-url card)))))

;; ...but if the user is not an admin this endpoint should fail
(expect
  "You don't have permissions to do that."
  (embed-test/with-embedding-enabled-and-new-secret-key
    (embed-test/with-temp-card [card]
      ((test-users/user->client :rasta) :get 403 (card-query-url card)))))

;; check that the endpoint doesn't work if embedding isn't enabled
(expect
  "Embedding is not enabled."
  (tu/with-temporary-setting-values [enable-embedding false]
    (embed-test/with-new-secret-key
      (embed-test/with-temp-card [card]
        ((test-users/user->client :crowberto) :get 400 (card-query-url card))))))

;; check that if embedding is enabled globally requests fail if they are signed with the wrong key
(expect
  "Message seems corrupt or manipulated."
  (embed-test/with-embedding-enabled-and-new-secret-key
    (embed-test/with-temp-card [card]
      ((test-users/user->client :crowberto) :get 400 (embed-test/with-new-secret-key (card-query-url card))))))


;;; LOCKED params

;; check that if embedding is enabled globally fail if the token is missing a `:locked` parameter
(expect
  "You must specify a value for :abc in the JWT."
  (embed-test/with-embedding-enabled-and-new-secret-key
    (embed-test/with-temp-card [card]
      ((test-users/user->client :crowberto) :get 400 (card-query-url card {:_embedding_params {:abc "locked"}})))))

;; if `:locked` param is supplied, request should succeed
(expect
  (embed-test/successful-query-results)
  (embed-test/with-embedding-enabled-and-new-secret-key
    (embed-test/with-temp-card [card]
      ((test-users/user->client :crowberto) :get 200 (card-query-url card {:_embedding_params {:abc "locked"}
                                                                           :params            {:abc 100}})))))

;; if `:locked` parameter is present in URL params, request should fail
(expect
  "You can only specify a value for :abc in the JWT."
  (embed-test/with-embedding-enabled-and-new-secret-key
    (embed-test/with-temp-card [card]
      ((test-users/user->client :crowberto) :get 400 (str (card-query-url card {:_embedding_params {:abc "locked"}
                                                                                :params            {:abc 100}})
                                                          "?abc=200")))))

;;; DISABLED params

;; check that if embedding is enabled globally and for the object requests fail if they pass a `:disabled` parameter
(expect
  "You're not allowed to specify a value for :abc."
  (embed-test/with-embedding-enabled-and-new-secret-key
    (embed-test/with-temp-card [card]
      ((test-users/user->client :crowberto) :get 400 (card-query-url card {:_embedding_params {:abc "disabled"}
                                                                           :params            {:abc 100}})))))

;; If a `:disabled` param is passed in the URL the request should fail
(expect
  "You're not allowed to specify a value for :abc."
  (embed-test/with-embedding-enabled-and-new-secret-key
    (embed-test/with-temp-card [card]
      ((test-users/user->client :crowberto) :get 400 (str (card-query-url card {:_embedding_params {:abc "disabled"}})
                                                          "?abc=200")))))

;;; ENABLED params

;; If `:enabled` param is present in both JWT and the URL, the request should fail
(expect
  "You can't specify a value for :abc if it's already set in the JWT."
  (embed-test/with-embedding-enabled-and-new-secret-key
    (embed-test/with-temp-card [card]
      ((test-users/user->client :crowberto) :get 400 (str (card-query-url card {:_embedding_params {:abc "enabled"}
                                                                                :params            {:abc 100}})
                                                          "?abc=200")))))

;; If an `:enabled` param is present in the JWT, that's ok
(expect
  (embed-test/successful-query-results)
  (embed-test/with-embedding-enabled-and-new-secret-key
    (embed-test/with-temp-card [card]
      ((test-users/user->client :crowberto) :get 200 (card-query-url card {:_embedding_params {:abc "enabled"}
                                                                           :params            {:abc "enabled"}})))))

;; If an `:enabled` param is present in URL params but *not* the JWT, that's ok
(expect
  (embed-test/successful-query-results)
  (embed-test/with-embedding-enabled-and-new-secret-key
    (embed-test/with-temp-card [card]
      ((test-users/user->client :crowberto) :get 200 (str (card-query-url card {:_embedding_params {:abc "enabled"}})
                                                          "?abc=200")))))


;;; ------------------------------------ GET /api/preview_embed/dashboard/:token -------------------------------------

(defn- dashboard-url {:style/indent 1} [dashboard & [additional-token-params]]
  (str "preview_embed/dashboard/" (embed-test/dash-token dashboard (merge {:_embedding_params {}}
                                                                          additional-token-params))))

;; it should be possible to call this endpoint successfully...
(expect
  embed-test/successful-dashboard-info
  (embed-test/with-embedding-enabled-and-new-secret-key
    (tt/with-temp Dashboard [dash]
      (embed-test/dissoc-id-and-name
        ((test-users/user->client :crowberto) :get 200 (dashboard-url dash))))))

;; ...but if the user is not an admin this endpoint should fail
(expect
  "You don't have permissions to do that."
  (embed-test/with-embedding-enabled-and-new-secret-key
    (tt/with-temp Dashboard [dash]
      ((test-users/user->client :rasta) :get 403 (dashboard-url dash)))))

;; check that the endpoint doesn't work if embedding isn't enabled
(expect
  "Embedding is not enabled."
  (tu/with-temporary-setting-values [enable-embedding false]
    (embed-test/with-new-secret-key
      (tt/with-temp Dashboard [dash]
        ((test-users/user->client :crowberto) :get 400 (dashboard-url dash))))))

;; check that if embedding is enabled globally requests fail if they are signed with the wrong key
(expect
  "Message seems corrupt or manipulated."
  (embed-test/with-embedding-enabled-and-new-secret-key
    (tt/with-temp Dashboard [dash]
      ((test-users/user->client :crowberto) :get 400 (embed-test/with-new-secret-key (dashboard-url dash))))))

;; Check that only ENABLED params that ARE NOT PRESENT IN THE JWT come back
(expect
  [{:slug "d", :name "d", :type "date"}]
  (embed-test/with-embedding-enabled-and-new-secret-key
    (tt/with-temp Dashboard [dash {:parameters [{:slug "a", :name "a", :type "date"}
                                                {:slug "b", :name "b", :type "date"}
                                                {:slug "c", :name "c", :type "date"}
                                                {:slug "d", :name "d", :type "date"}]}]
      (:parameters ((test-users/user->client :crowberto) :get 200 (dashboard-url dash
                                                                    {:params            {:c 100},
                                                                     :_embedding_params {:a "locked"
                                                                                         :b "disabled"
                                                                                         :c "enabled"
                                                                                         :d "enabled"}}))))))


;;; ------------------ GET /api/preview_embed/dashboard/:token/dashcard/:dashcard-id/card/:card-id -------------------

(defn- dashcard-url {:style/indent 1} [dashcard & [additional-token-params]]
  (str "preview_embed/dashboard/" (embed-test/dash-token (:dashboard_id dashcard) (merge {:_embedding_params {}}
                                                                                         additional-token-params))
       "/dashcard/" (u/get-id dashcard)
       "/card/" (:card_id dashcard)))

;; It should be possible to run a Card successfully if you jump through the right hoops...
(expect
  (embed-test/successful-query-results)
  (embed-test/with-embedding-enabled-and-new-secret-key
    (embed-test/with-temp-dashcard [dashcard]
      ((test-users/user->client :crowberto) :get 200 (dashcard-url dashcard)))))

;; ...but if the user is not an admin this endpoint should fail
(expect
  "You don't have permissions to do that."
  (embed-test/with-embedding-enabled-and-new-secret-key
    (embed-test/with-temp-dashcard [dashcard]
      ((test-users/user->client :rasta) :get 403 (dashcard-url dashcard)))))

;; check that the endpoint doesn't work if embedding isn't enabled
(expect
  "Embedding is not enabled."
  (tu/with-temporary-setting-values [enable-embedding false]
    (embed-test/with-new-secret-key
      (embed-test/with-temp-dashcard [dashcard]
        ((test-users/user->client :crowberto) :get 400 (dashcard-url dashcard))))))

;; check that if embedding is enabled globally requests fail if they are signed with the wrong key
(expect
  "Message seems corrupt or manipulated."
  (embed-test/with-embedding-enabled-and-new-secret-key
    (embed-test/with-temp-dashcard [dashcard]
      ((test-users/user->client :crowberto) :get 400 (embed-test/with-new-secret-key (dashcard-url dashcard))))))

;;; LOCKED params

;; check that if embedding is enabled globally fail if the token is missing a `:locked` parameter
(expect
  "You must specify a value for :abc in the JWT."
  (embed-test/with-embedding-enabled-and-new-secret-key
    (embed-test/with-temp-dashcard [dashcard]
      ((test-users/user->client :crowberto) :get 400 (dashcard-url dashcard
                                                       {:_embedding_params {:abc "locked"}})))))

;; If `:locked` param is supplied, request should succeed
(expect
  (embed-test/successful-query-results)
  (embed-test/with-embedding-enabled-and-new-secret-key
    (embed-test/with-temp-dashcard [dashcard]
      ((test-users/user->client :crowberto) :get 200 (dashcard-url dashcard
                                                       {:_embedding_params {:abc "locked"}, :params {:abc 100}})))))

;; If `:locked` parameter is present in URL params, request should fail
(expect
  "You can only specify a value for :abc in the JWT."
  (embed-test/with-embedding-enabled-and-new-secret-key
    (embed-test/with-temp-dashcard [dashcard]
      ((test-users/user->client :crowberto) :get 400 (str (dashcard-url dashcard
                                                            {:_embedding_params {:abc "locked"}, :params {:abc 100}})
                                                          "?abc=200")))))

;;; DISABLED params

;; check that if embedding is enabled globally and for the object requests fail if they pass a `:disabled` parameter
(expect
  "You're not allowed to specify a value for :abc."
  (embed-test/with-embedding-enabled-and-new-secret-key
    (embed-test/with-temp-dashcard [dashcard]
      ((test-users/user->client :crowberto) :get 400 (dashcard-url dashcard
                                                       {:_embedding_params {:abc "disabled"}, :params {:abc 100}})))))

;; If a `:disabled` param is passed in the URL the request should fail
(expect
  "You're not allowed to specify a value for :abc."
  (embed-test/with-embedding-enabled-and-new-secret-key
    (embed-test/with-temp-dashcard [dashcard]
      ((test-users/user->client :crowberto) :get 400 (str (dashcard-url dashcard {:_embedding_params {:abc "disabled"}})
                                                          "?abc=200")))))

;;; ENABLED params

;; If `:enabled` param is present in both JWT and the URL, the request should fail
(expect
  "You can't specify a value for :abc if it's already set in the JWT."
  (embed-test/with-embedding-enabled-and-new-secret-key
    (embed-test/with-temp-dashcard [dashcard]
      ((test-users/user->client :crowberto) :get 400 (str (dashcard-url dashcard {:_embedding_params {:abc "enabled"}
                                                                                  :params            {:abc 100}})
                                                          "?abc=200")))))

;; If an `:enabled` param is present in the JWT, that's ok
(expect
  (embed-test/successful-query-results)
  (embed-test/with-embedding-enabled-and-new-secret-key
    (embed-test/with-temp-dashcard [dashcard]
      ((test-users/user->client :crowberto) :get 200 (dashcard-url dashcard {:_embedding_params {:abc "enabled"}
                                                                             :params            {:abc 100}})))))

;; If an `:enabled` param is present in URL params but *not* the JWT, that's ok
(expect
  (embed-test/successful-query-results)
  (embed-test/with-embedding-enabled-and-new-secret-key
    (embed-test/with-temp-dashcard [dashcard]
      ((test-users/user->client :crowberto) :get 200 (str (dashcard-url dashcard {:_embedding_params {:abc "enabled"}})
                                                          "?abc=200")))))

;; Check that editable query params work correctly and keys get coverted from strings to keywords, even if they're
;; something that our middleware doesn't normally assume is implicitly convertable to a keyword. See
;; `ring.middleware.keyword-params/keyword-syntax?` (#6783)
(expect
  "completed"
  (embed-test/with-embedding-enabled-and-new-secret-key
    (-> (embed-test/with-temp-dashcard [dashcard {:dash {:enable_embedding true}}]
          ((test-users/user->client :crowberto) :get 200 (str (dashcard-url dashcard
                                                                {:_embedding_params {:num_birds     :locked
                                                                                     :2nd_date_seen :enabled}
                                                                 :params            {:num_birds 2}})
                                                              "?2nd_date_seen=2018-02-14")))
        :status)))

;; Make sure that editable params do not result in "Invalid Parameter" exceptions (#7212)
(expect
  [[50]]
  (embed-test/with-embedding-enabled-and-new-secret-key
    (tt/with-temp Card [card {:dataset_query {:database (data/id)
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
                                                :dashcard {:card_id            (u/get-id card)
                                                           :parameter_mappings [{:card_id      (u/get-id card)
                                                                                 :target       [:variable
                                                                                                [:template-tag :num]]
                                                                                 :parameter_id "537e37b4"}]}}]
        (-> ((test-users/user->client :crowberto) :get (str (dashcard-url dashcard {:_embedding_params {:num "enabled"}})
                                                            "?num=50"))
            :data
            :rows)))))

;; Make sure that ID params correctly get converted to numbers as needed (Postgres-specific)...
(datasets/expect-with-engine :postgres
  [[1]]
  (embed-test/with-embedding-enabled-and-new-secret-key
    (tt/with-temp Card [card {:dataset_query {:database (data/id)
                                              :type     :query
                                              :query    {:source-table (data/id :venues)
                                                         :aggregation  [:count]}}}]
      (embed-test/with-temp-dashcard [dashcard {:dash     {:parameters [{:name "Venue ID"
                                                                         :slug "venue_id"
                                                                         :id   "22486e00"
                                                                         :type "id"}]}
                                                :dashcard {:card_id            (u/get-id card)
                                                           :parameter_mappings [{:parameter_id "22486e00"
                                                                                 :card_id      (u/get-id card)
                                                                                 :target       [:dimension
                                                                                                [:field-id
                                                                                                 (data/id :venues :id)]]}]}}]
        (-> ((test-users/user->client :crowberto) :get (str (dashcard-url dashcard {:_embedding_params {:venue_id "enabled"}})
                                                            "?venue_id=1"))
            :data
            :rows)))))
