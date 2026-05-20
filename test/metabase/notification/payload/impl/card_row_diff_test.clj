(ns metabase.notification.payload.impl.card-row-diff-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.channel.core :as channel]
   [metabase.channel.impl.slack-row-diff]
   [metabase.notification.models :as models.notification]
   [metabase.notification.payload.core :as notification.payload]
   [metabase.notification.payload.impl.card-row-diff]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db))

;; ---------------------------------------------------------------------------
;; pure unit tests — no DB needed
;; ---------------------------------------------------------------------------

(deftest diff-rows-test
  (testing "diff-rows returns only genuinely new rows"
    (let [diff    #'metabase.notification.payload.impl.card-row-diff/diff-rows
          row-a   [1 "a"]
          row-b   [2 "b"]
          row-c   [3 "c"]]
      (testing "nil previous = empty diff (first run, never send)"
        (is (= [] (diff [row-a row-b] nil))))
      (testing "same rows = empty diff"
        (is (= [] (diff [row-a row-b] [row-a row-b]))))
      (testing "new rows identified correctly"
        (is (= [row-c] (seq (diff [row-a row-b row-c] [row-a row-b])))))
      (testing "row removed from set does not appear as new"
        (is (= [] (diff [row-a] [row-a row-b])))))))

(deftest notification-types-includes-card-row-diff-test
  (testing ":notification/card-row-diff is registered in notification-types"
    (is (contains? models.notification/notification-types :notification/card-row-diff))))

;; ---------------------------------------------------------------------------
;; Slack rendering — no DB, no Slack API
;; ---------------------------------------------------------------------------

(def ^:private test-card     {:id 42 :name "Sales by Region" :archived false})
(def ^:private test-columns  [{:name "region" :display_name "Region"}
                              {:name "total"  :display_name "Total"}])
(def ^:private test-new-rows [["East" 1000] ["West" 2000]])
(def ^:private test-recipient {:type    :notification-recipient/raw-value
                               :details {:channel_id "C0TEST" :value "#test"}})

(defn- make-npl [send-mode]
  {:payload_type :notification/card-row-diff
   :payload      {:card         test-card
                  :card_part    nil
                  :columns      test-columns
                  :new_rows     test-new-rows
                  :send_mode    send-mode
                  :is_first_run false}
   :context      {}})

(deftest slack-render-per-row-test
  (testing "render-notification :per-row produces one message per new row"
    (let [messages (channel/render-notification :channel/slack
                                                (make-npl :per-row)
                                                {:recipients [test-recipient]})]
      (is (= 2 (count messages)) "one message per row")
      (is (every? #(= "C0TEST" (:channel %)) messages) "correct channel")
      (is (every? #(seq (:blocks %)) messages) "each message has blocks")
      (testing "header block says 1 new row"
        (doseq [msg messages]
          (let [hdr (first (:blocks msg))]
            (is (= "header" (:type hdr)))
            (is (str/includes? (get-in hdr [:text :text]) "1 new row"))))))))

(deftest slack-render-digest-test
  (testing "render-notification :digest produces one message for all new rows"
    (let [messages (channel/render-notification :channel/slack
                                                (make-npl :digest)
                                                {:recipients [test-recipient]})]
      (is (= 1 (count messages)) "one digest message")
      (is (= "C0TEST" (:channel (first messages))))
      (testing "header block says 2 new rows"
        (let [hdr (first (:blocks (first messages)))]
          (is (= "header" (:type hdr)))
          (is (str/includes? (get-in hdr [:text :text]) "2 new rows")))))))

(deftest slack-render-no-recipients-test
  (testing "no recipients → no messages"
    (is (empty? (channel/render-notification :channel/slack
                                             (make-npl :per-row)
                                             {:recipients []})))))

(deftest skip-reason-first-run-test
  (testing "skip-reason returns :first-run-snapshot-only when is_first_run"
    (let [npl (assoc-in (make-npl :per-row) [:payload :is_first_run] true)]
      (is (= :first-run-snapshot-only (notification.payload/skip-reason npl))))))

(deftest skip-reason-no-new-rows-test
  (testing "skip-reason returns :no-new-rows when new_rows is empty"
    (let [npl (assoc-in (make-npl :per-row) [:payload :new_rows] [])]
      (is (= :no-new-rows (notification.payload/skip-reason npl))))))

(deftest skip-reason-archived-test
  (testing "skip-reason returns :archived when card is archived"
    (let [npl (assoc-in (make-npl :per-row) [:payload :card :archived] true)]
      (is (= :archived (notification.payload/skip-reason npl))))))

(deftest skip-reason-nil-when-should-send-test
  (testing "skip-reason returns nil when there are new rows and card is not archived"
    (is (nil? (notification.payload/skip-reason (make-npl :per-row))))))

;; ---------------------------------------------------------------------------
;; DB-level tests — require migrations to have run
;; ---------------------------------------------------------------------------

(deftest new-tables-exist-test
  (testing "Liquibase migrations created both new tables"
    (is (number? (t2/count :model/NotificationCardRowDiff))
        "notification_card_row_diff table must exist")
    (is (number? (t2/count :model/NotificationRowDiffSnapshot))
        "notification_row_diff_snapshot table must exist")))

(deftest notification-card-row-diff-send-mode-default-test
  (testing "send_mode defaults to :per-row on insert"
    (mt/with-temp [:model/Card {card-id :id} {}]
      (let [id (t2/insert-returning-pk! :model/NotificationCardRowDiff {:card_id card-id})]
        (try
          (is (= :per-row (:send_mode (t2/select-one :model/NotificationCardRowDiff id))))
          (finally (t2/delete! :model/NotificationCardRowDiff id)))))))

(deftest snapshot-upsert-test
  (testing "save-snapshot! inserts on first call and updates on second"
    (let [save!     #'metabase.notification.payload.impl.card-row-diff/save-snapshot!
          load-snap #'metabase.notification.payload.impl.card-row-diff/load-snapshot]
      (mt/with-temp [:model/Card      {card-id :id} {}
                     :model/Notification {notif-id :id} {:payload_type :notification/card-row-diff
                                                         :creator_id   (mt/user->id :rasta)
                                                         :active       true}]
        ;; insert
        (save! notif-id card-id [[1 "a"] [2 "b"]])
        (is (= [[1 "a"] [2 "b"]] (load-snap notif-id)) "snapshot persisted after insert")
        ;; update
        (save! notif-id card-id [[3 "c"]])
        (is (= [[3 "c"]] (load-snap notif-id)) "snapshot updated on second save")))))
