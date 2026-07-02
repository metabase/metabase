(ns metabase.channel.email.result-attachment-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.channel.email.result-attachment :as email.result-attachment]
   [metabase.permissions.core :as perms]
   [metabase.test :as mt]
   [metabase.util :as u])
  (:import
   (java.io ByteArrayOutputStream IOException)))

(set! *warn-on-reflection* true)

(defmacro ^:private with-create-temp-failure! [& body]
  `(with-redefs [email.result-attachment/create-temp-file! (fn [~'_]
                                                             (throw (IOException. "Failed to write file")))]
     ~@body))

;; Test that IOException bubbles up
(deftest throws-exception
  (is (thrown-with-msg?
       IOException
       (re-pattern (format "Unable to create temp file in `%s`" (System/getProperty "java.io.tmpdir")))
       (with-create-temp-failure!
         (#'email.result-attachment/create-temp-file-or-throw! "txt")))))

(deftest csv-attachment-includes-utf8-bom-test
  (testing "CSV email attachments start with a UTF-8 BOM so they open correctly in Excel (#75875)"
    (let [results {:database_id (mt/id)
                   :row_count   1
                   :data        {:cols         [{:name "n" :base_type :type/Integer}]
                                 :rows         [[1]]
                                 :viz-settings {}}}
          stream! (fn [opts]
                    (let [os (ByteArrayOutputStream.)]
                      (#'email.result-attachment/stream-api-results-to-export-format!
                       os (merge {:export-format :csv} opts) results)
                      (String. (.toByteArray os) "UTF-8")))]
      (testing "included by default"
        (is (str/starts-with? (stream! {}) u/utf8-bom)))
      (testing "included when explicitly requested"
        (is (str/starts-with? (stream! {:csv-include-bom? true}) u/utf8-bom)))
      (testing "omitted when explicitly disabled"
        (is (not (str/starts-with? (stream! {:csv-include-bom? false}) u/utf8-bom)))))))

(deftest result-attachment-uses-passed-creator-id-for-perm-check-test
  (testing "result-attachment checks the passed creator-id's download perms, not the card author's"
    ;; Regression test for GH #71696 (Linear GDGT-2143):
    ;; PR #66827 added a send-time download-perms gate but used (:creator_id card) — the card author —
    ;; instead of the subscription creator. When the card author later loses download perms, every
    ;; existing subscription for that card silently drops attachments, even when the subscription
    ;; creator has full perms.
    (let [card-author-id           1
          subscription-creator-id  2
          card                     {:id            99
                                    :name          "test-card"
                                    :include_csv   true
                                    :creator_id    card-author-id
                                    :dataset_query {:database 1}}
          part                     {:card   card
                                    :result {:row_count 5
                                             :data      {:rows [[1] [2] [3] [4] [5]]}}}]
      (mt/with-dynamic-fn-redefs [perms/download-perms-level (fn [_query user-id]
                                                               (case (long user-id)
                                                                 1 :no
                                                                 2 :one-million-rows
                                                                 :one-million-rows))
                                  ;; Sentinel: if execution reaches the streaming path, the perm check passed.
                                  ;; We avoid exercising real CSV streaming machinery in a unit test.
                                  email.result-attachment/create-temp-file! (fn [_]
                                                                              (throw (ex-info "PERM-CHECK-PASSED" {})))]
        (testing "passes perm check when subscription creator has download perms (even if card author does not)"
          (is (thrown-with-msg?
               clojure.lang.ExceptionInfo
               #"PERM-CHECK-PASSED"
               (email.result-attachment/result-attachment part subscription-creator-id))
              "expected to reach the streaming code path because subscription creator has perms"))
        (testing "drops attachment when the passed creator-id has :no download perms"
          (is (nil? (email.result-attachment/result-attachment part card-author-id))
              "expected nil because the passed creator-id has :no download perms"))))))
