(ns metabase.models.channel-test
  (:require
   [clojure.test :refer :all]
   [metabase.api.channel-test :as api.channel-test]
   [metabase.test :as mt]
   [metabase.util.encryption :as encryption]
   [metabase.util.encryption-test :as encryption-test]
   [toucan2.core :as t2]))

(comment
 ;; to register the :metabase-test channel implementation
 api.channel-test/keepme)

(deftest channel-details-is-encrypted
  (encryption-test/with-secret-key "secret"
   (mt/with-model-cleanup [:model/Channel]
     (let [channel (t2/insert-returning-instance! :model/Channel {:name    "Test channel"
                                                                  :type    "channel/metabase-test"
                                                                  :details {:return-type  "return-value"
                                                                            :return-value true}
                                                                  :active  true})]
       (is (encryption/possibly-encrypted-string? (t2/select-one-fn :details :channel (:id channel))))))))
