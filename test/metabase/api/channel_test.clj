(ns metabase.api.channel-test
  (:require
   [clojure.test :refer :all]
   [metabase.channel.core :as channel]
   [metabase.public-settings.premium-features :as premium-features]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defmethod channel/can-connect? :channel/metabase-test
  [_channel-type {:keys [return-type return-value] :as _details}]
  (case return-type
    "throw"
    (throw (ex-info "Test error" return-value))

    "return-value"
    return-value))

(def default-test-channel
  {:name        "Test channel"
   :description "Test channel description"
   :type        "channel/metabase-test"
   :details     {:return-type  "return-value"
                 :return-value true}
   :active      true})

(deftest CRU-channel-test
  (mt/with-model-cleanup [:model/Channel]
    (let [channel (testing "can create a channel"
                    (mt/user-http-request :crowberto :post 200 "channel" default-test-channel))]
      (testing "can get the channel"
        (is (=? {:name        "Test channel"
                 :description "Test channel description"
                 :type        "channel/metabase-test"
                 :details     {:return-type  "return-value"
                               :return-value true}
                 :active      true}
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
  (let [channel-details default-test-channel]
    (mt/with-temp [:model/Channel _chn channel-details]
      (is (= {:errors {:name "Channel with that name already exists"}}
             (mt/user-http-request :crowberto :post 409 "channel" default-test-channel))))))

(deftest can-create-channel-with-invalid-details-test
  ;; maybe we only want this for webhook because we don't know exactly what the connection check will do
  ;; a connection check can return 400 but maybe it's ok and we rely on the fact that users know what they're doing
  (mt/with-model-cleanup [:model/Channel]
    (is (some?
         (mt/user-http-request :crowberto :post 200 "channel"
                               (assoc default-test-channel :details {:return-type  "return-value"
                                                                     :return-value false}))))))

(def ns-keyword->str #(str (.-sym %)))

(deftest list-channels-test
  (mt/with-temp [:model/Channel chn-1 default-test-channel
                 :model/Channel chn-2 (assoc default-test-channel
                                             :active false
                                             :name "Channel 2")]
    (testing "return active channels only"
      (is (= [(update chn-1 :type ns-keyword->str)]
             (mt/user-http-request :crowberto :get 200 "channel"))))

    (testing "return all if include_inactive is true"
      (is (= (map #(update % :type ns-keyword->str) [chn-1 (assoc chn-2 :name "Channel 2")])
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
    (is (= "Unable to connect channel"
           (mt/user-http-request :crowberto :post 400 "channel/test"
                                 (assoc default-test-channel :details {:return-type  "return-value"
                                                                       :return-value false})))))
  (testing "returns field-specific error message if the channel returns one"
    (is (= {:errors {:email "Invalid email"}}
           (mt/user-http-request :crowberto :post 400 "channel/test"
                                 (assoc default-test-channel :details {:return-type  "return-value"
                                                                       :return-value {:errors {:email "Invalid email"}}})))))

  (testing "returns field-specific error message if the channel throws one"
    (is (= {:errors {:email "Invalid email"}}
           (mt/user-http-request :crowberto :post 400 "channel/test"
                                 (assoc default-test-channel :details {:return-type  "throw"
                                                                       :return-value {:errors {:email "Invalid email"}}}))))))

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
                                 :type        "channel/metabase-test"
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
