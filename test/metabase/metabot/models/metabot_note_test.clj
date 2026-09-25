(ns metabase.metabot.models.metabot-note-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.metabot.db :as metabot.db]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(deftest insert-and-round-trip-test
  (testing "a note inserts, round-trips, and is stamped with timestamps"
    (mt/with-temp [:model/User       {user-id :id}  {}
                   :model/MetabotNote {note-id :id} {:note_key   "orders-status"
                                                     :summary    "status codes"
                                                     :content    "1=new, 2=paid, 3=shipped"
                                                     :creator_id user-id}]
      (let [note (t2/select-one :model/MetabotNote :id note-id)]
        (is (=? {:note_key "orders-status" :summary "status codes"
                 :content "1=new, 2=paid, 3=shipped" :creator_id user-id}
                note))
        (is (some? (:created_at note)))
        (is (some? (:updated_at note)))))))

(deftest unique-note-key-test
  (testing "two notes with the same note_key cannot coexist"
    (mt/with-temp [:model/MetabotNote _ {:note_key "dup" :summary "a" :content "a"}]
      ;; Wrap the failing INSERT in its own transaction so the outer with-temp transaction stays viable.
      (is (thrown? Exception
                   (t2/with-transaction [_conn]
                     (t2/insert! :model/MetabotNote {:note_key "dup" :summary "b" :content "b"})))))))

(deftest creator-set-null-on-user-delete-test
  (testing "deleting the author leaves the note but nulls creator_id"
    (mt/with-temp [:model/User        {user-id :id} {}
                   :model/MetabotNote {note-id :id} {:note_key   "keep-me"
                                                     :summary    "s"
                                                     :content    "c"
                                                     :creator_id user-id}]
      (t2/delete! :model/User :id user-id)
      (is (=? {:creator_id nil}
              (t2/select-one :model/MetabotNote :id note-id))))))

(deftest db-fns-test
  (testing "upsert-note! / note-catalog / note-bodies-by-keys / delete-note!"
    (mt/with-temp [:model/User {user-id :id} {}]
      (testing "upsert creates then overwrites the same key"
        (metabot.db/upsert-note! "metric-defs" "how ARR is defined" "sum of monthly plans * 12" user-id)
        (is (= "sum of monthly plans * 12"
               (t2/select-one-fn :content :model/MetabotNote :note_key "metric-defs")))
        (metabot.db/upsert-note! "metric-defs" "how ARR is defined (v2)" "corrected formula" user-id)
        (is (= 1 (t2/count :model/MetabotNote :note_key "metric-defs")))
        (is (= "corrected formula"
               (t2/select-one-fn :content :model/MetabotNote :note_key "metric-defs"))))
      (testing "catalog lists keys + summaries, bodies fetch by key"
        (let [catalog (metabot.db/note-catalog)]
          (is (some (fn [{:keys [note_key summary]}]
                      (and (= "metric-defs" note_key) (= "how ARR is defined (v2)" summary)))
                    catalog)))
        (is (= [{:note_key "metric-defs" :content "corrected formula"}]
               (metabot.db/note-bodies-by-keys ["metric-defs"])))
        (is (nil? (metabot.db/note-bodies-by-keys []))))
      (testing "delete removes the note"
        (is (pos? (metabot.db/delete-note! "metric-defs")))
        (is (zero? (t2/count :model/MetabotNote :note_key "metric-defs")))))))
