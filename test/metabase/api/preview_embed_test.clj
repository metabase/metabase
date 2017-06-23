(ns metabase.api.preview-embed-test
  (:require [expectations :refer :all]
            [metabase.api.embed-test :as embed-test]
            [metabase.models.dashboard :refer [Dashboard]]
            [metabase.test.data.users :as test-users]
            [metabase.test.util :as tu]
            [metabase.util :as u]
            [toucan.util.test :as tt]))

;;; ------------------------------------------------------------ GET /api/preview_embed/card/:token ------------------------------------------------------------

(defn- card-url [card & [additional-token-params]] (str "preview_embed/card/" (embed-test/card-token card (merge {:_embedding_params {}} additional-token-params))))

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
    (embed-test/with-temp-card [card {:dataset_query {:native {:template_tags {:a {:type "date", :name "a", :display_name "a"}
                                                                               :b {:type "date", :name "b", :display_name "b"}
                                                                               :c {:type "date", :name "c", :display_name "c"}
                                                                               :d {:type "date", :name "d", :display_name "d"}}}}}]
      (:parameters ((test-users/user->client :crowberto) :get 200 (card-url card {:_embedding_params {:a "locked", :b "disabled", :c "enabled", :d "enabled"}
                                                                                  :params            {:c 100}}))))))


;;; ------------------------------------------------------------ GET /api/preview_embed/card/:token/query ------------------------------------------------------------

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
      ((test-users/user->client :crowberto) :get 200 (card-query-url card {:_embedding_params {:abc "locked"}, :params {:abc 100}})))))

;; if `:locked` parameter is present in URL params, request should fail
(expect
  "You can only specify a value for :abc in the JWT."
  (embed-test/with-embedding-enabled-and-new-secret-key
    (embed-test/with-temp-card [card]
      ((test-users/user->client :crowberto) :get 400 (str (card-query-url card {:_embedding_params {:abc "locked"}, :params {:abc 100}}) "?abc=200")))))

;;; DISABLED params

;; check that if embedding is enabled globally and for the object requests fail if they pass a `:disabled` parameter
(expect
  "You're not allowed to specify a value for :abc."
  (embed-test/with-embedding-enabled-and-new-secret-key
    (embed-test/with-temp-card [card]
      ((test-users/user->client :crowberto) :get 400 (card-query-url card {:_embedding_params {:abc "disabled"}, :params {:abc 100}})))))

;; If a `:disabled` param is passed in the URL the request should fail
(expect
  "You're not allowed to specify a value for :abc."
  (embed-test/with-embedding-enabled-and-new-secret-key
    (embed-test/with-temp-card [card]
      ((test-users/user->client :crowberto) :get 400 (str (card-query-url card {:_embedding_params {:abc "disabled"}}) "?abc=200")))))

;;; ENABLED params

;; If `:enabled` param is present in both JWT and the URL, the request should fail
(expect
  "You can't specify a value for :abc if it's already set in the JWT."
  (embed-test/with-embedding-enabled-and-new-secret-key
    (embed-test/with-temp-card [card]
      ((test-users/user->client :crowberto) :get 400 (str (card-query-url card {:_embedding_params {:abc "enabled"}, :params {:abc 100}}) "?abc=200")))))

;; If an `:enabled` param is present in the JWT, that's ok
(expect
  (embed-test/successful-query-results)
  (embed-test/with-embedding-enabled-and-new-secret-key
    (embed-test/with-temp-card [card]
      ((test-users/user->client :crowberto) :get 200 (card-query-url card {:_embedding_params {:abc "enabled"}, :params {:abc "enabled"}})))))

;; If an `:enabled` param is present in URL params but *not* the JWT, that's ok
(expect
  (embed-test/successful-query-results)
  (embed-test/with-embedding-enabled-and-new-secret-key
    (embed-test/with-temp-card [card]
      ((test-users/user->client :crowberto) :get 200 (str (card-query-url card {:_embedding_params {:abc "enabled"}}) "?abc=200")))))


;;; ------------------------------------------------------------ GET /api/preview_embed/dashboard/:token ------------------------------------------------------------

(defn- dashboard-url [dashboard & [additional-token-params]] (str "preview_embed/dashboard/" (embed-test/dash-token dashboard (merge {:_embedding_params {}} additional-token-params))))

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
      (:parameters ((test-users/user->client :crowberto) :get 200 (dashboard-url dash {:params            {:c 100},
                                                                                       :_embedding_params {:a "locked", :b "disabled", :c "enabled", :d "enabled"}}))))))


;;; ------------------------------------------------------------ GET /api/preview_embed/dashboard/:token/dashcard/:dashcard-id/card/:card-id ------------------------------------------------------------

(defn- dashcard-url {:style/indent 1} [dashcard & [additional-token-params]]
  (str "preview_embed/dashboard/" (embed-test/dash-token (:dashboard_id dashcard) (merge {:_embedding_params {}} additional-token-params))
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
      ((test-users/user->client :crowberto) :get 400 (str (dashcard-url dashcard {:_embedding_params {:abc "disabled"}}) "?abc=200")))))

;;; ENABLED params

;; If `:enabled` param is present in both JWT and the URL, the request should fail
(expect
  "You can't specify a value for :abc if it's already set in the JWT."
  (embed-test/with-embedding-enabled-and-new-secret-key
    (embed-test/with-temp-dashcard [dashcard]
      ((test-users/user->client :crowberto) :get 400 (str (dashcard-url dashcard {:_embedding_params {:abc "enabled"}, :params {:abc 100}}) "?abc=200")))))

;; If an `:enabled` param is present in the JWT, that's ok
(expect
  (embed-test/successful-query-results)
  (embed-test/with-embedding-enabled-and-new-secret-key
    (embed-test/with-temp-dashcard [dashcard]
      ((test-users/user->client :crowberto) :get 200 (dashcard-url dashcard {:_embedding_params {:abc "enabled"}, :params {:abc 100}})))))

;; If an `:enabled` param is present in URL params but *not* the JWT, that's ok
(expect
  (embed-test/successful-query-results)
  (embed-test/with-embedding-enabled-and-new-secret-key
    (embed-test/with-temp-dashcard [dashcard]
      ((test-users/user->client :crowberto) :get 200 (str (dashcard-url dashcard {:_embedding_params {:abc "enabled"}}) "?abc=200")))))
