(ns metabase.metabot.tools.memory-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer [deftest is testing]]
   [metabase.metabot.agent.messages :as messages]
   [metabase.metabot.agent.profiles :as profiles]
   [metabase.metabot.db :as metabot.db]
   [metabase.metabot.tools.memory :as tools.memory]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

;; Notes are a shared/global store, so these tests write real rows. Wrapping the mutating body in a
;; rollback-only transaction keeps the table clean and the tests re-runnable in one REPL/JVM.

(deftest write-and-read-note-test
  (mt/with-temp [:model/User {user-id :id} {}]
    (mt/with-current-user user-id
      (t2/with-transaction [_conn nil {:rollback-only true}]
        (testing "write_note saves a note stamped with the current user"
          (let [{:keys [output structured-output data-parts]}
                (tools.memory/write-note-tool {:key "orders-status" :summary "status codes"
                                               :content "1=new 2=paid"})]
            (is (str/includes? output "orders-status"))
            (is (= {:note-key "orders-status"} structured-output))
            (testing "and labels the chat step with the note's summary"
              (is (=? [{:data-type "tool_title" :data {:title "Remembered: status codes"}}] data-parts)))
            (is (=? {:summary "status codes" :content "1=new 2=paid" :creator_id user-id}
                    (t2/select-one :model/MetabotNote :note_key "orders-status")))))
        (testing "writing the same key overwrites rather than duplicating"
          (tools.memory/write-note-tool {:key "orders-status" :summary "status codes v2"
                                         :content "1=new 2=paid 3=shipped"})
          (is (= 1 (t2/count :model/MetabotNote :note_key "orders-status")))
          (is (= "1=new 2=paid 3=shipped"
                 (t2/select-one-fn :content :model/MetabotNote :note_key "orders-status"))))
        (testing "read_note returns full bodies and flags keys with no note"
          (let [{:keys [output structured-output]}
                (tools.memory/read-note-tool {:keys ["orders-status" "does-not-exist"]})]
            (is (str/includes? output "1=new 2=paid 3=shipped"))
            (is (str/includes? output "no note saved"))
            (is (= ["orders-status"] (:found structured-output)))))))))

(deftest write-note-failure-test
  (testing "a failed save is labelled as a failure in the chat, not as \"Saved a note\""
    (mt/with-dynamic-fn-redefs [metabot.db/upsert-note! (fn [& _] (throw (ex-info "boom" {})))]
      (let [{:keys [output data-parts]} (tools.memory/write-note-tool {:key "k" :summary "status codes"
                                                                       :content "c"})]
        (is (str/includes? output "Could not save note: boom"))
        (is (=? [{:data-type "tool_title" :data {:title "Couldn't remember: status codes"}}] data-parts))))))

(deftest delete-note-test
  (mt/with-temp [:model/User {user-id :id} {}]
    (mt/with-current-user user-id
      (t2/with-transaction [_conn nil {:rollback-only true}]
        (tools.memory/write-note-tool {:key "temp-note" :summary "s" :content "c"})
        (testing "delete_note removes an existing note"
          (let [{:keys [output data-parts]} (tools.memory/delete-note-tool {:key "temp-note"})]
            (is (str/includes? output "Deleted"))
            (is (=? [{:data-type "tool_title" :data {:title "Forgot note temp-note"}}] data-parts))
            (is (zero? (t2/count :model/MetabotNote :note_key "temp-note")))))
        (testing "delete_note on a missing key reports nothing to delete"
          (let [{:keys [output data-parts]} (tools.memory/delete-note-tool {:key "temp-note"})]
            (is (str/includes? output "No note"))
            (is (nil? data-parts))))))))

(defn- fake-catalog
  "`n` note-catalog rows, newest first."
  [n]
  (for [i (range n)]
    {:note_key (str "k" i) :summary "s"}))

(deftest system-context-test
  (mt/with-temp [:model/User {user-id :id} {}]
    (mt/with-current-user user-id
      (t2/with-transaction [_conn nil {:rollback-only true}]
        (tools.memory/write-note-tool {:key "arr-definition" :summary "how ARR is computed here"
                                       :content "sum(active plan monthly price) * 12"})
        (testing "the hook returns the catalog as data, not rendered prompt text"
          (let [{:keys [megabot_notes]} (tools.memory/megabot-notes-system-context {})]
            (is (some #{{:key "arr-definition" :summary "how ARR is computed here"}} megabot_notes)))))))
  (testing "an empty store yields nil, so the template's `if` sees no catalog"
    (mt/with-dynamic-fn-redefs [metabot.db/note-catalog (constantly [])]
      (is (= {:megabot_notes nil :megabot_notes_more nil}
             (tools.memory/megabot-notes-system-context {})))))
  (testing "past the cap, the newest notes are listed and the rest are counted"
    (mt/with-dynamic-fn-redefs [metabot.db/note-catalog (constantly (fake-catalog 205))]
      (let [{:keys [megabot_notes megabot_notes_more]} (tools.memory/megabot-notes-system-context {})]
        (is (= 200 (count megabot_notes)))
        (is (= "k0" (:key (first megabot_notes))))
        (is (= 5 megabot_notes_more))))))

(defn- megabot-system-prompt []
  (mt/with-current-user (mt/user->id :crowberto)
    (:content (messages/build-system-message {} (profiles/get-profile :megabot) {}))))

(deftest system-prompt-memory-section-test
  (testing "the memory guidance is rendered once, split into instance facts and personal preferences"
    (mt/with-dynamic-fn-redefs [metabot.db/note-catalog (constantly [])]
      (let [prompt (megabot-system-prompt)]
        (is (= 1 (count (re-seq #"## Memory" prompt))))
        (is (str/includes? prompt "Save instance facts"))
        (is (str/includes? prompt "Don't save personal preferences"))
        (is (not (str/includes? prompt "list_notes")))
        (testing "with no notes saved, the empty state sits under its own heading"
          (is (str/includes? prompt "## Saved notes\nNo notes saved yet."))))))
  (testing "saved notes render as a key — summary list, unescaped"
    (mt/with-dynamic-fn-redefs [metabot.db/note-catalog
                                (constantly [{:note_key "arr" :summary "ARR = MRR * 12 & <net>"}])]
      (let [prompt (megabot-system-prompt)]
        (is (str/includes? prompt "## Saved notes\n- arr — ARR = MRR * 12 & <net>\n"))
        (is (not (str/includes? prompt "No notes saved yet.")))
        (is (not (str/includes? prompt "older notes"))))))
  (testing "notes past the cap are pointed at, not dropped silently"
    (mt/with-dynamic-fn-redefs [metabot.db/note-catalog (constantly (fake-catalog 203))]
      (is (str/includes? (megabot-system-prompt)
                         "- …and 3 older notes: find them with query_app_db on metabot_note.")))))
