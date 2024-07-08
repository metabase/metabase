(ns metabase.api.channel-test
  (:require
   [clojure.test :refer :all]
   [metabase.channel.http-test :as channel.http-test]
   [metabase.models.cloud-migration :as cloud-migration]
   [metabase.models.cloud-migration-test :as cloud-migration-test]
   [metabase.public-settings.premium-features :as premium-features]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(defn- default-http-channel
  [url]
  {:name "test"
   :type :http
   :details {:url    url
             :method :get
             :auth-method :none}})

(ngoc/with-tc)



(deftest create-then-get-then-update-test
  (channel.http-test/with-server [url [channel.http-test/get-200]]
    (mt/with-model-cleanup [:model/Channel]
      (let [channel (mt/user-http-request :crowberto :post 200 "channel"
                                          (default-http-channel (str url (:url channel.http-test/get-200))))]
        channel))))


(deftest create-channel-test
  (mt/user-http-request :post 200 "channel"))
