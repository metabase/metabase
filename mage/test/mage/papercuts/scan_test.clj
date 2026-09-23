(ns mage.papercuts.scan-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [mage.papercuts.scan :as scan])
  (:import
   (java.time Instant)))

(set! *warn-on-reflection* true)

(deftest parse-since-test
  (let [now (Instant/parse "2026-09-23T12:00:00Z")]
    (is (nil? (scan/parse-since nil now)))
    (is (= "2026-09-01T00:00:00Z" (scan/parse-since "2026-09-01" now)))
    (is (= "2026-09-16T12:00:00Z" (scan/parse-since "7d" now)))
    (is (= "2026-09-23T00:00:00Z" (scan/parse-since "12h" now)))
    (is (= "2026-09-01T10:30:00Z" (scan/parse-since "2026-09-01T10:30:00" now)))
    (is (= "2026-09-01T08:30:00Z" (scan/parse-since "2026-09-01T10:30:00+02:00" now)))
    (is (thrown? Exception (scan/parse-since "last tuesday" now)))))

(defn- entry [line ts]
  {:line line :ts ts :tag "USER" :text (str "message " line)})

(deftest split-new-test
  (let [entries [(entry 1 "2026-09-01T00:00:00Z") (entry 2 "2026-09-02T00:00:00Z") (entry 3 "2026-09-03T00:00:00Z")]]
    (testing "first scan: everything is new"
      (is (= [[] entries] (scan/split-new entries nil nil))))
    (testing "later scans start after the last scanned line"
      (is (= [(subvec entries 0 2) (subvec entries 2)] (scan/split-new entries 2 nil))))
    (testing "--since also treats older entries as scanned"
      (is (= [(subvec entries 0 1) (subvec entries 1)] (scan/split-new entries nil "2026-09-02T00:00:00Z"))))))

(deftest chunks-test
  (let [earlier [(entry 1 "t1")]
        fresh   (mapv #(entry % "t") (range 2 8))
        result  (scan/chunks earlier fresh 30)]
    (testing "every new entry lands in exactly one chunk, in order"
      (is (= (map :line fresh) (mapcat #(map :line (:entries %)) result))))
    (testing "chunks record their line range"
      (is (= [2 3 4 5 6 7] (map :first-new-line result)))
      (is (= (map :first-new-line result) (map :last-line result))))
    (testing "each chunk carries the stretch before it as context"
      (is (= "L1 [USER] message 1" (:earlier (first result))))
      (is (re-find #"L2 \[USER\] message 2$" (:earlier (second result)))))))

(def ^:private papercut
  {:slug "console-hides-warnings" :label "positive" :existing_papercut 0
   :kind "misleading-signal" :area ["test_config/log4j2-test.xml"] :title "Console hides warnings"
   :trap "Trap." :mechanism "Mechanism." :fix "Fix."
   :anchors [{:line 12 :role "tool-output" :proves "grep returned 0"}
             {:line 14 :role "agent" :proves "wrong conclusion"}]})

(deftest reportable-test
  (let [chunk {:first-new-line 10 :last-line 20}]
    (is (= [papercut] (scan/reportable [papercut] chunk [])))
    (testing "negatives and ambiguous cases are not submitted"
      (is (empty? (scan/reportable [(assoc papercut :label "negative")] chunk []))))
    (testing "a papercut needs an anchor in the new stretch"
      (is (empty? (scan/reportable [(assoc papercut :anchors [{:line 9}])] chunk []))))
    (testing "anchors outside the new stretch are dropped, so the report is keyed on a new line"
      (is (= [{:line 12}] (:anchors (first (scan/reportable [(assoc papercut :anchors [{:line 5} {:line 12} {:line 99}])]
                                                            chunk []))))))
    (testing "a slug the session already reported is skipped"
      (is (empty? (scan/reportable [papercut] chunk [{:slug "console-hides-warnings"}]))))))

(deftest report-test
  (let [session {:source :claude :id "31b066ea" :path "/t/31b066ea.jsonl"}
        entries [{:line 12 :ts "2026-08-25T10:00:00Z"} {:line 14 :ts "2026-08-25T10:01:00Z"}]
        opts    {:reporter "chris.claude" :repository "metabase" :machine "laptop"}
        report  (scan/report opts session papercut "papercut:console-hides-warnings"
                             {:branch "fix-rollback" :commit_sha "70a3d8cb4a7" :commit_source "reflog"}
                             entries {:misleading_signal 0.9})]
    (is (= {:repository  "metabase"
            :reporter    "chris.claude"
            :machine     "laptop"
            :report_id   "claude:31b066ea:12"
            :fingerprint "papercut:console-hides-warnings"
            :category    "agent-trap"
            :path        "test_config/log4j2-test.xml"
            :area        "test_config/log4j2-test.xml"
            :agent       "claude"
            :session     "31b066ea"
            :observed_at "2026-08-25T10:00:00Z"
            :source_type "transcript-scan"
            :source_ref  "/t/31b066ea.jsonl#L12"
            :branch      "fix-rollback"
            :commit_sha  "70a3d8cb4a7"
            :commit_source "reflog"}
           (dissoc report :title :description :details)))
    (is (= "Trap.\n\nMechanism.\n\nSuggested fix: Fix.\n\nTranscript: /t/31b066ea.jsonl#L12" (:description report)))
    (is (= {:lines [12 14] :slug "console-hides-warnings" :kind "misleading-signal" :screen {:misleading_signal 0.9}}
           (select-keys (:details report) [:lines :slug :kind :screen])))))
