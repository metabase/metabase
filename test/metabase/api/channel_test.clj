(ns metabase.api.channel-test
  (:require
   [clojure.test :refer :all]
   [metabase.channel.core :as channel]
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
  {:name    "Test channel"
   :type    "channel/metabase-test"
   :details {:return-type  "return-value"
             :return-value true}
   :active  true})

(deftest CRU-channel-test
  (mt/with-model-cleanup [:model/Channel]
    (let [channel (testing "can create a channel"
                    (mt/user-http-request :crowberto :post 200 "channel" default-test-channel))]
      (testing "can get the channel"
        (is (=? {:name    "Test channel"
                 :type    "channel/metabase-test"
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

(def ns-keyword->str #(str (.-sym %)))

(deftest list-channels-test
  (mt/with-temp [:model/Channel chn-1 default-test-channel
                 :model/Channel chn-2 (assoc default-test-channel :active false)]
    (testing "return active channels only"
      (is (= [(update chn-1 :type ns-keyword->str)]
             (mt/user-http-request :crowberto :get 200 "channel"))))

    (testing "return all if include_inactive is true"
      (is (= (map #(update % :type ns-keyword->str) [chn-1 chn-2])
             (mt/user-http-request :crowberto :get 200 "channel" {:include_inactive true}))))))

(deftest create-channel-error-handling-test
  (testing "returns text error message if the channel return falsy value"
    (is (= "Unable to connect channel"
           (mt/user-http-request :crowberto :post 400 "channel"
                                 (assoc default-test-channel :details {:return-type  "return-value"
                                                                       :return-value false})))))
  (testing "returns field-specific error message if the channel returns one"
    (is (= {:errors {:email "Invalid email"}}
           (mt/user-http-request :crowberto :post 400 "channel"
                                 (assoc default-test-channel :details {:return-type  "return-value"
                                                                       :return-value {:errors {:email "Invalid email"}}})))))

  (testing "returns field-specific error message if the channel throws one"
    (is (= {:errors {:email "Invalid email"}}
           (mt/user-http-request :crowberto :post 400 "channel"
                                 (assoc default-test-channel :details {:return-type  "throw"
                                                                       :return-value {:errors {:email "Invalid email"}}}))))))

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
