(ns metabase-enterprise.gsheets.settings-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase-enterprise.gsheets.settings :as gsettings]
   [metabase.settings.core :as setting]
   [toucan2.core :as t2]))

(defmacro with-sample-db-as-dwh [& body]
  "We need an attached dwh for these tests, so let's have the sample db fill in for us:"
  `(try
     (t2/update! :model/Database :id 1 {:is_attached_dwh true})
     ~@body
     (finally (t2/update! :model/Database :id 1 {:is_attached_dwh false}))))

(deftest migrate-gsheet-value
  (let [test-uuid (str (random-uuid))
        value-updated (atom nil)]
    (with-redefs [setting/set-value-of-type! (fn [_type _setting value] (reset! value-updated value))]
      (testing "current-format values are unchanged"
        (let [current-format {:url            "https://example.com"
                              :created-at     1234567890
                              :created-by-id  1
                              :gdrive/conn-id test-uuid
                              :db-id          2}]
          (is (= current-format
                 (#'gsettings/migrate-gsheet-value current-format)))
          (is (= nil @value-updated)))
        (testing "empty values are unchanged"
          (is (= {}
                 (#'gsettings/migrate-gsheet-value {})))
          (is (= nil @value-updated))))
      (testing "old not-connected values are migrated to current-format"
        (is (= {}
               (#'gsettings/migrate-gsheet-value
                {:status "not-connected"})))
        (is (= {} @value-updated)))

      (testing "old loading values are migrated to current-format"
        (let [expected-value {:url            "https://example.com"
                              :created-at     1234567890
                              :gdrive/conn-id test-uuid
                              :created-by-id  1
                              :db-id          1}]
          (is (= expected-value
                 (#'gsettings/migrate-gsheet-value
                  {:status             "loading"
                   :folder_url         "https://example.com"
                   :folder-upload-time 1234567890
                   :gdrive/conn-id     test-uuid
                   :created-by-id      1
                   :db-id              1})))
          (is (= expected-value @value-updated))))

      (testing "old complete values are migrated to current-format"
        (let [expected-value {:url            "https://example.com"
                              :created-at     1234567890
                              :gdrive/conn-id test-uuid
                              :created-by-id  1
                              :db-id          1}]
          (is (= expected-value
                 (#'gsettings/migrate-gsheet-value
                  {:status             "complete"
                   :folder_url         "https://example.com"
                   :folder-upload-time 1234567890
                   :gdrive/conn-id     test-uuid
                   :created-by-id      1
                   :db-id              1})))
          (is (= expected-value @value-updated))))
      (testing "missing db-id gets added"
        (with-sample-db-as-dwh
          (let [expected-value {:url            "https://example.com"
                                :created-at     1234567890
                                :gdrive/conn-id test-uuid
                                :created-by-id  1
                                :db-id          1}]
            (is (= expected-value
                   (#'gsettings/migrate-gsheet-value
                    {:url            "https://example.com"
                     :created-at     1234567890
                     :gdrive/conn-id test-uuid
                     :created-by-id  1
                     :db-id          1})))))))))
