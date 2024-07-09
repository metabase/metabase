(ns metabase.api.channel-test
  (:require
   [clojure.test :refer :all]
   [metabase.channel.core :as channel]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(defmethod channel/can-connect? :channel/metabase-test
  [_channel-type {:keys [return-type return-value] :as _details}]
  (case return-type
    "throw"
    (throw (ex-info "Test error" return-value))

    "return-value"
    return-value))

(def default-test-channel
  {:name    "Test channel"
   :type    "metabase-test"
   :details {:return-type  "return-value"
             :return-value true}
   :active  true})

(deftest CRU-channel-test
  (mt/with-model-cleanup [:model/Channel]
    (let [channel (testing "can create a channel"
                    (mt/user-http-request :crowberto :post 200 "channel" default-test-channel))]
      (testing "can get the channel"
        (is (=? {:name    "Test channel"
                 :type    "metabase-test"
                 :details {:return-type  "return-value"
                           :return-value true}
                 :active  true}
                (mt/user-http-request :crowberto :get 200 (str "channel/" (:id channel))))))

      (testing "can update channel name"
        (mt/user-http-request :crowberto :put 200 (str "channel/" (:id channel))
                              {:name "New Name"})
        (is (= "New Name" (t2/select-one-fn :name :model/Channel (:id channel)))))

      (testing "can't update channel details if fail to connect"
        (mt/user-http-request :crowberto :put 400 (str "channel/" (:id channel))
                              {:details {:return-type  "return-value"
                                         :return-value false}})
        (is (= {:return-type "return-value"
                :return-value true}
               (t2/select-one-fn :details :model/Channel (:id channel)))))

      (testing "can update channel details if connection is successful"
        (mt/user-http-request :crowberto :put 200 (str "channel/" (:id channel))
                              {:details {:return-type  "return-value"
                                         :return-value true
                                         :new-data     true}})
        (is (= {:return-type "return-value"
                :return-value true
                :new-data     true}
               (t2/select-one-fn :details :model/Channel (:id channel)))))

      (testing "can disable a channel"
        (mt/user-http-request :crowberto :put 200 (str "channel/" (:id channel))
                              {:active false})
        (is (= false (t2/select-one-fn :active :model/Channel (:id channel))))))))

(deftest list-channels-test
  (mt/with-temp [:model/Channel chn-1 default-test-channel
                 :model/Channel chn-2 (assoc default-test-channel :active false)]
    (testing "return active channels only"
      (is (= [(update chn-1 :type name)]
             (mt/user-http-request :crowberto :get 200 "channel"))))

    (testing "return all if include_inactive is true"
      (is (= (map #(update % :type name) [chn-1 chn-2])
             (mt/user-http-request :crowberto :get 200 "channel" {:include_inactive true}))))))
