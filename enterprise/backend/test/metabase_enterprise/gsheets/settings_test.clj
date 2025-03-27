(ns metabase-enterprise.gsheets.settings-test
  (:require
   [clojure.test :refer [deftest is testing]]))

(deftest migrate-gsheet-value
  (let [test-uuid (str (random-uuid))]
    (testing "current-format values are unchanged"
      (let [current-format {:url            "https://example.com"
                            :created-at     1234567890
                            :created-by-id  1
                            :gdrive/conn-id test-uuid}]
        (is (= current-format
               (#'metabase-enterprise.gsheets.settings/migrate-gsheet-value current-format)))
        (is (= {}
               (#'metabase-enterprise.gsheets.settings/migrate-gsheet-value {})))))
    (testing "old format values are migrated to current-format")
    (is (= {}
           (#'metabase-enterprise.gsheets.settings/migrate-gsheet-value
            {:status "not-connected"})))
    (is (= {:url                "https://example.com"
            :created-at 1234567890
            :gdrive/conn-id     test-uuid
            :created-by-id      1}
           (#'metabase-enterprise.gsheets.settings/migrate-gsheet-value
            {:status             "connected"
             :folder_url         "https://example.com"
             :folder-upload-time 1234567890
             :gdrive/conn-id     test-uuid
             :created-by-id      1})))))
