(ns metabase.settings.db-test
  (:require
   [clojure.test :refer :all]
   [metabase.settings.db :as settings.db]
   [metabase.settings.models.setting-test]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(defn- do-with-test-setting-row! [v f]
  (mt/with-temporary-setting-values [test-setting-1 nil]
    (settings.db/insert-setting! "test-setting-1" v)
    (f)))

(deftest setting-key-is-bound-as-a-value-test
  (testing "GHY-4589: the setting key is compared as a value, whether given as a string or a keyword"
    (do-with-test-setting-row!
     "v1"
     (fn []
       (is (= "v1" (settings.db/setting-value "test-setting-1")))
       (is (= "v1" (settings.db/setting-value :test-setting-1)))
       (is (= 1 (settings.db/update-setting-value! :test-setting-1 "v2")))
       (is (= "v2" (settings.db/setting-value "test-setting-1")))
       (is (= 1 (settings.db/update-raw-setting-row! :test-setting-1 "v3" nil)))
       (is (= 1 (settings.db/delete-setting! :test-setting-1)))
       (is (not (t2/exists? :setting :key "test-setting-1"))))))
  (testing "the insert functions store a keyword key by its name"
    (mt/with-temporary-setting-values [test-setting-1 nil]
      (is (= "v1" (:value (settings.db/insert-setting! :test-setting-1 "v1"))))
      (is (= 1 (settings.db/delete-setting! "test-setting-1")))
      (is (= 1 (settings.db/insert-raw-setting-row! :test-setting-1 "v2" nil)))
      (is (= "v2" (t2/select-one-fn :value :setting :key "test-setting-1")))))
  (testing "a key that looks like SQL matches nothing rather than being compiled"
    (do-with-test-setting-row!
     "v1"
     (fn []
       (is (nil? (settings.db/setting-value "x' OR '1'='1")))
       (is (= 0 (settings.db/update-setting-value! "x' OR '1'='1" "v2")))
       (is (= 0 (settings.db/update-raw-setting-row! "x' OR '1'='1" "v3" nil)))
       (is (= 0 (settings.db/delete-setting! "x' OR '1'='1")))
       (is (= "v1" (settings.db/setting-value "test-setting-1")))))))
