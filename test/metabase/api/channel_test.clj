(ns metabase.api.channel-test
  (:require
   [clojure.test :refer :all]
   [metabase.models.cloud-migration :as cloud-migration]
   [metabase.models.cloud-migration-test :as cloud-migration-test]
   [metabase.public-settings.premium-features :as premium-features]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(deftest create-channel-test
  (mt/user-http-request :post 200 "channel"))
