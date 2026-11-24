(ns metabase.channel.email.result-attachment-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.channel.email.result-attachment :as email.result-attachment]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.permissions.core :as perms]
   [metabase.permissions.test-util :as perms.test-util]
   [metabase.test :as mt]
   [metabase.util :as u]
   [toucan2.core :as t2])
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
                   :data        {:cols         [{:name "n" :display_name "n" :base_type :type/Integer}]
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
      (mt/with-dynamic-fn-redefs [perms/download-perms-levels (fn [queries user-id]
                                                                (mapv (constantly (case (long user-id)
                                                                                    1 :no
                                                                                    2 :one-million-rows
                                                                                    :one-million-rows))
                                                                      queries))
                                  ;; Sentinel: if execution reaches the streaming path, the perm check passed.
                                  ;; We avoid exercising real CSV streaming machinery in a unit test.
                                  email.result-attachment/create-temp-file! (fn [_]
                                                                              (throw (ex-info "PERM-CHECK-PASSED" {})))]
        (testing "passes perm check when subscription creator has download perms (even if card author does not)"
          (is (thrown-with-msg?
               clojure.lang.ExceptionInfo
               #"PERM-CHECK-PASSED"
               (email.result-attachment/result-attachment
                part (first (email.result-attachment/download-levels [part] subscription-creator-id))))
              "expected to reach the streaming code path because subscription creator has perms"))
        (testing "drops attachment when the passed creator-id has :no download perms"
          (is (nil? (email.result-attachment/result-attachment
                     part (first (email.result-attachment/download-levels [part] card-author-id))))
              "expected nil because the passed creator-id has :no download perms"))))))

(deftest download-levels-statement-count-test
  (testing "download levels of a send take as many statements for many attachments as for few, as a non-admin"
    (mt/with-premium-features #{:advanced-permissions}
      (let [mp      (mt/metadata-provider)
            query   (lib/query mp (lib.metadata/table mp (mt/id :venues)))
            part    {:card {:include_csv true :dataset_query query} :result {:row_count 1}}
            levels  (fn [n] (t2/with-call-count [call-count]
                              (email.result-attachment/download-levels (repeat n part) (mt/user->id :rasta))
                              (call-count)))]
        (levels 1)
        (is (= (levels 2) (levels 6)))))))

(deftest download-levels-mixed-access-test
  (mt/when-ee-evailable
   (testing "each part of a send gets the download level its own query has, and only parts that want an attachment ask"
     (mt/with-premium-features #{:advanced-permissions}
       (perms.test-util/with-restored-data-perms!
         (perms/set-table-permission! (perms/all-users-group) (mt/id :venues) :perms/download-results :one-million-rows)
         (perms/set-table-permission! (perms/all-users-group) (mt/id :checkins) :perms/download-results :no)
         (let [mp       (mt/metadata-provider)
               part     (fn [table attachment?]
                          {:card   {:include_csv attachment? :dataset_query (lib/query mp (lib.metadata/table mp (mt/id table)))}
                           :result {:row_count 1}})
               parts    [(part :venues true) (part :checkins true) (part :checkins false) (part :venues true)]
               user-id  (mt/user->id :rasta)]
           (is (= (mapv #(when (get-in % [:card :include_csv])
                           (perms/download-perms-level (get-in % [:card :dataset_query]) user-id))
                        parts)
                  (email.result-attachment/download-levels parts user-id)))
           (is (= [:one-million-rows :no nil :one-million-rows]
                  (email.result-attachment/download-levels parts user-id)))))))))
