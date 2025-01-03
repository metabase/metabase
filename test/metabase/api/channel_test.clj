(ns metabase.api.channel-test
  (:require
   [clojure.test :refer :all]
   [metabase.channel.core :as channel]
   [metabase.channel.impl.http-test :as channel.http-test]
   [metabase.notification.test-util :as notification.tu]
   [metabase.public-settings.premium-features :as premium-features]
   [metabase.test :as mt]
   [metabase.util :as u]
   [toucan2.core :as t2]))

(comment
  channel/keep-me)

(set! *warn-on-reflection* true)

(def default-test-channel notification.tu/default-can-connect-channel)

(deftest CRU-channel-test
  (mt/with-model-cleanup [:model/Channel]
    (let [channel (testing "can create a channel"
                    (mt/user-http-request :crowberto :post 200 "channel"
                                          default-test-channel))]
      (testing "can get the channel"
        (is (=? default-test-channel
                (mt/user-http-request :crowberto :get 200 (str "channel/" (:id channel))))))

      (testing "can update channel name"
        (mt/user-http-request :crowberto :put 200 (str "channel/" (:id channel))
                              {:name "New Name"})
        (is (= "New Name" (t2/select-one-fn :name :model/Channel (:id channel)))))

      (testing "can update channel details even if it fails to connect"
        (mt/user-http-request :crowberto :put 200 (str "channel/" (:id channel))
                              {:details {:return-type  "return-value"
                                         :return-value false}})
        (is (= {:return-type "return-value"
                :return-value false}
               (t2/select-one-fn :details :model/Channel (:id channel)))))

      (testing "can update channel description"
        (mt/user-http-request :crowberto :put 200 (str "channel/" (:id channel))
                              {:description "New description"})
        (is (= "New description" (t2/select-one-fn :description :model/Channel (:id channel)))))

      (testing "can disable a channel"
        (mt/user-http-request :crowberto :put 200 (str "channel/" (:id channel))
                              {:active false})
        (is (= false (t2/select-one-fn :active :model/Channel (:id channel))))))))

(deftest create-channel-with-existing-name-error-test
  (mt/with-temp [:model/Channel _chn default-test-channel]
    (is (= {:errors {:name "Channel with that name already exists"}}
           (mt/user-http-request :crowberto :post 409 "channel" default-test-channel)))))

(deftest can-create-channel-with-invalid-details-test
  ;; maybe we only want this for webhook because we don't know exactly what the connection check will do
  ;; a connection check can return 400 but maybe it's ok and we rely on the fact that users know what they're doing
  (mt/with-model-cleanup [:model/Channel]
    (is (some?
         (mt/user-http-request :crowberto :post 200 "channel"
                               (assoc default-test-channel :details {:return-type  "return-value"
                                                                     :return-value false}))))))

(deftest list-channels-test
  (mt/with-temp [:model/Channel chn-1 default-test-channel
                 :model/Channel chn-2 (assoc default-test-channel
                                             :active false
                                             :name "Channel 2")]
    (testing "return active channels only"
      (is (= [(update chn-1 :type u/qualified-name)]
             (mt/user-http-request :crowberto :get 200 "channel"))))

    (testing "return all if include_inactive is true"
      (is (= (map #(update % :type u/qualified-name) [chn-1 (assoc chn-2 :name "Channel 2")])
             (mt/user-http-request :crowberto :get 200 "channel" {:include_inactive true}))))))

(deftest ensure-channel-is-namespaced-test
  (testing "POST /api/channel return 400 if channel type is not namespaced"
    (is (=? {:errors {:type "Must be a namespaced channel. E.g: channel/http"}}
            (mt/user-http-request :crowberto :post 400 "channel"
                                  (assoc default-test-channel :type "metabase-test"))))

    (is (=? {:errors {:type "Must be a namespaced channel. E.g: channel/http"}}
            (mt/user-http-request :crowberto :post 400 "channel"
                                  (assoc default-test-channel :type "metabase/metabase-test")))))
  (testing "PUT /api/channel return 400 if channel type is not namespaced"
    (mt/with-temp [:model/Channel chn-1 default-test-channel]
      (is (=? {:errors {:type "nullable Must be a namespaced channel. E.g: channel/http"}}
              (mt/user-http-request :crowberto :put 400 (str "channel/" (:id chn-1))
                                    (assoc chn-1 :type "metabase-test"))))

      (is (=? {:errors {:type "nullable Must be a namespaced channel. E.g: channel/http"}}
              (mt/user-http-request :crowberto :put 400 (str "channel/" (:id chn-1))
                                    (assoc chn-1 :type "metabase/metabase-test")))))))

(deftest test-channel-connection-test
  (testing "return 200 if channel connects successfully"
    (is (= {:ok true}
           (mt/user-http-request :crowberto :post 200 "channel/test"
                                 (assoc default-test-channel :details {:return-type  "return-value"
                                                                       :return-value true})))))

  (testing "returns text error message if the channel return falsy value"
    (is (= {:message "Unable to connect channel"
            :data    {:connection-result false}}
           (mt/user-http-request :crowberto :post 400 "channel/test"
                                 (assoc default-test-channel :details {:return-type  "return-value"
                                                                       :return-value false})))))

  (testing "return the exception message and data if the channel throws an exception"
    (is (= {:message "Test error"
            :data    {:errors {:email "Invalid email"}}}
           (mt/user-http-request :crowberto :post 400 "channel/test"
                                 (assoc default-test-channel :details {:return-type  "throw"
                                                                       :return-value {:errors {:email "Invalid email"}}}))))))

(deftest test-channel-http-test
  (channel.http-test/with-server [url [channel.http-test/post-200 channel.http-test/post-400]]
    (testing "status-code=200 endpoint"
      (is (= {:ok true}
             (mt/user-http-request :crowberto :post 200 "channel/test"
                                   {:type    "channel/http"
                                    :details {:url          (str url (:path channel.http-test/post-200))
                                              :auth-method  "none"
                                              :auth-info    {}}}))))
    (testing "status-code=400 endpoint"
      (is (= {:message "Failed to connect to channel"
              :data    {:request-status 400
                        :request-body "Bad request"}}
             (mt/user-http-request :crowberto :post 400 "channel/test"
                                   {:type    "channel/http"
                                    :details {:url          (str url (:path channel.http-test/post-400))
                                              :auth-method  "none"
                                              :auth-info    {}}}))))
    (testing "status-code=404 endpoint"
      (is (= {:message "Failed to connect to channel"
              :data    {:request-status 404
                        :request-body "Not found."}}
             (mt/user-http-request :crowberto :post 400 "channel/test"
                                   {:type    "channel/http"
                                    :details {:url          (str url "/unknown42")
                                              :auth-method  "none"
                                              :auth-info    {}}}))))))

(deftest channel-audit-log-test
  (testing "audit log for channel apis"
    (mt/with-premium-features #{:audit-app}
      (mt/with-model-cleanup [:model/Channel]
        (with-redefs [premium-features/enable-cache-granular-controls? (constantly true)]
          (let [id (:id (mt/user-http-request :crowberto :post 200 "channel" default-test-channel))]
            (testing "POST /api/channel"
              (is (= {:details  {:description "Test channel description"
                                 :id          id
                                 :name        "Test channel"
                                 :type        notification.tu/test-channel-type
                                 :active      true}
                      :model    "Channel"
                      :model_id id
                      :topic    :channel-create
                      :user_id  (mt/user->id :crowberto)}
                     (mt/latest-audit-log-entry :channel-create))))

            (testing "PUT /api/channel/:id"
              (mt/user-http-request :crowberto :put 200 (str "channel/" id) (assoc default-test-channel :name "Updated Name"))
              (is (= {:details  {:new {:name "Updated Name"} :previous {:name "Test channel"}}
                      :model    "Channel"
                      :model_id id
                      :topic    :channel-update
                      :user_id  (mt/user->id :crowberto)}
                     (mt/latest-audit-log-entry :channel-update))))))))))
