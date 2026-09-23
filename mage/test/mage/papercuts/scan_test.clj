(ns mage.papercuts.scan-test
  (:require
   [babashka.fs :as fs]
   [babashka.process :as p]
   [clojure.test :refer [deftest is testing]]
   [mage.papercuts.scan :as scan]
   [mage.papercuts.transcript :as transcript])
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

(deftest state-and-log-files-test
  (testing "each server keeps its own progress and log"
    (let [shared (scan/default-state-file :claude "http://10.193.193.227:8765")
          local  (scan/default-state-file :claude "http://127.0.0.1:8766/")]
      (is (= "scan-state.claude.10.193.193.227-8765.edn" (str (fs/file-name shared))))
      (is (= "scan-state.claude.127.0.0.1-8766.edn" (str (fs/file-name local))))
      (is (= "scan-log.claude.10.193.193.227-8765.jsonl" (str (fs/file-name (#'scan/log-file shared)))))
      (is (= "scan-state.claude.https-metaouch.dev-443.edn"
             (str (fs/file-name (scan/default-state-file :claude "https://metaouch.dev")))))))
  (testing "the scheme and effective port tell servers apart"
    (let [file-name #(str (fs/file-name (scan/default-state-file :claude %)))]
      (is (not= (file-name "http://example.com") (file-name "https://example.com")))
      (is (= (file-name "https://example.com") (file-name "https://example.com:443/")))
      (is (= (file-name "http://example.com") (file-name "http://example.com:80")))))
  (testing "a state file named some other way doesn't have its log written over it"
    (is (= "/tmp/progress.edn.log.jsonl" (#'scan/log-file "/tmp/progress.edn"))))
  (testing "the log goes beside its state file, even when a directory looks like a state file"
    (is (= "/tmp/scan-state.archive/progress.edn.log.jsonl" (#'scan/log-file "/tmp/scan-state.archive/progress.edn")))
    (is (= "/tmp/x/scan-log.claude.h-80.jsonl" (#'scan/log-file "/tmp/x/scan-state.claude.h-80.edn")))))

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

(deftest security-worktree-test
  (is (scan/security-worktree? {:project "-Users-me-workspace-metabase-metabase-sec-1172-a-settings-manager"}))
  (is (scan/security-worktree? {:cwd "/Users/me/workspace/metabase/metabase.sec-1218-slack-bot"}))
  (is (not (scan/security-worktree? {:project "-Users-me-workspace-metabase-metabase-search-sweep"
                                     :cwd     "/Users/me/workspace/metabase/metabase"})))
  (testing "the private repository itself, at the start or after a cd"
    (is (scan/security-worktree? {:cwd "/Users/me/workspace/metabase/metabase-private"}))
    (is (scan/security-worktree? {:project "-Users-me-workspace-metabase-metabase-private"}))
    (is (scan/security-worktree? {:cwd "/Users/me/workspace/metabase/metabase"}
                                 [{:cwd "/Users/me/workspace/metabase/metabase"}
                                  {:cwd "/Users/me/workspace/metabase/metabase-private.fix-x"}])))
  (is (not (scan/security-worktree? {:cwd "/Users/me/workspace/metabase/metabase-privatey"}))))

(deftest mentions-embargo-test
  (let [dir (fs/create-temp-dir {:prefix "papercut-embargo"})]
    (try
      (testing "a marker inside a value that redaction would mask still counts"
        (let [path (fs/path dir "masked.jsonl")]
          (spit (str path) "{\"type\":\"user\",\"message\":{\"content\":\"PRIVATE_NOTE=embargo until the fix ships\"}}\n")
          (is (scan/mentions-embargo? path))))
      (let [path (fs/path dir "clean.jsonl")]
        (spit (str path) "{\"type\":\"user\",\"message\":{\"content\":\"run the tests\"}}\n")
        (is (not (scan/mentions-embargo? path))))
      (testing "context the harness injects into every session doesn't count"
        (doseq [[file line]
                {"claude-memory.jsonl"
                 "{\"type\":\"attachment\",\"attachment\":{\"type\":\"instructions\",\"content\":\"six embargoed PRs on metabase-private\"}}"
                 "claude-reminder.jsonl"
                 "{\"type\":\"user\",\"message\":{\"content\":\"<system-reminder>notes: embargoed PRs</system-reminder>run the tests\"}}"
                 "codex-meta.jsonl"
                 "{\"type\":\"session_meta\",\"payload\":{\"base_instructions\":\"never mention embargoed work\"}}"
                 "codex-plugins.jsonl"
                 "{\"type\":\"response_item\",\"payload\":{\"type\":\"message\",\"role\":\"user\",\"content\":[{\"type\":\"input_text\",\"text\":\"<recommended_plugins>x</recommended_plugins>\\n# AGENTS.md instructions: embargoed PRs\"}]}}"
                 "codex-agents.jsonl"
                 "{\"type\":\"response_item\",\"payload\":{\"type\":\"message\",\"role\":\"user\",\"content\":[{\"type\":\"input_text\",\"text\":\"# AGENTS.md instructions: embargoed PRs live on metabase-private\"}]}}"}]
          (let [path (fs/path dir file)]
            (spit (str path) (str line "\n"))
            (is (not (scan/mentions-embargo? path)) file))))
      (testing "naming the private remote is not work in it; its PRs and branches are"
        (doseq [[file line expected]
                [["remotes.jsonl" "{\"type\":\"user\",\"message\":{\"content\":\"metabase-private\\tgit@github.com:metabase/metabase-private.git (fetch)\"}}" false]
                 ["pr.jsonl" "{\"type\":\"user\",\"message\":{\"content\":\"see https://github.com/metabase/metabase-private/pull/436\"}}" true]
                 ["gh.jsonl" "{\"type\":\"user\",\"message\":{\"content\":\"gh pr edit 436 --repo metabase/metabase-private\"}}" true]
                 ["branch.jsonl" "{\"type\":\"user\",\"message\":{\"content\":\"* sec-fix abc123 [metabase-private/sec-fix: ahead 3] Fix\"}}" true]]]
          (let [path (fs/path dir file)]
            (spit (str path) (str line "\n"))
            (is (= expected (scan/mentions-embargo? path)) file))))
      (testing "a real mention next to a reminder still counts"
        (let [path (fs/path dir "mixed.jsonl")]
          (spit (str path) "{\"type\":\"user\",\"message\":{\"content\":\"<system-reminder>x</system-reminder>this fix is embargoed\"}}\n")
          (is (scan/mentions-embargo? path))))
      (finally
        (fs/delete-tree dir)))))

(deftest repository-name-test
  (is (= "metabase" (scan/repository-name "git@github.com:metabase/metabase.git")))
  (is (= "evals" (scan/repository-name "https://github.com/metabase/evals/")))
  (is (nil? (scan/repository-name nil))))

(deftest codex-session-that-moves-into-a-private-checkout-test
  (let [file (str (fs/create-temp-file {:suffix ".jsonl"}))]
    (spit file (str "{\"type\":\"session_meta\",\"payload\":{\"id\":\"01a0\",\"cwd\":\"/w/metabase\"}}\n"
                    "{\"type\":\"turn_context\",\"payload\":{\"cwd\":\"/w/metabase-private\"}}\n"
                    "{\"type\":\"response_item\",\"payload\":{\"type\":\"message\",\"role\":\"user\","
                    "\"content\":[{\"type\":\"input_text\",\"text\":\"look at this\"}]}}\n"))
    (testing "a session that starts public and moves into metabase-private counts as security work"
      (is (scan/security-worktree? {:cwd "/w/metabase"} (transcript/codex-entries file))))))

(deftest session-repository-test
  (let [root    (fs/create-temp-dir {:prefix "papercut-repository"})
        repo    (str (fs/path root "checkout"))
        scratch (str (fs/path root "pc"))
        git!    #(p/shell {:dir repo :out :string :err :string} "git" %1 %2 %3 %4)]
    (try
      (fs/create-dirs repo)
      (fs/create-dirs scratch)
      (p/shell {:dir repo :out :string :err :string} "git" "init" "-q")
      (git! "remote" "add" "upstream" "git@github.com:metabase/evals.git")
      (testing "the remote of the directory the session used most, not the folder name of its first one"
        (is (= "evals" (#'scan/session-repository {} {:cwd scratch}
                                                  [{:cwd scratch} {:cwd repo} {:cwd repo} {:cwd repo}]))))
      (testing "--repository wins"
        (is (= "metabase" (#'scan/session-repository {:repository "metabase"} {:cwd scratch} []))))
      (finally
        (fs/delete-tree root)))))

(deftest starting-state-test
  (let [dir    (fs/create-temp-dir {:prefix "papercut-state"})
        legacy (str (fs/path dir "scan-state.claude.edn"))
        fresh  (str (fs/path dir "scan-state.claude.h-80.edn"))]
    (try
      (spit legacy (pr-str {:version 1 :sessions {"s1" {:line 40}}}))
      (testing "a default per-server file that doesn't exist yet starts from the old single file"
        (is (= {"s1" {:line 40}} (:sessions (scan/starting-state false fresh legacy)))))
      (testing "an explicit --state-file is taken as given"
        (is (= {} (:sessions (scan/starting-state true fresh legacy)))))
      (spit fresh (pr-str {:version 1 :sessions {"s2" {:line 7}}}))
      (testing "once the per-server file exists, it wins"
        (is (= {"s2" {:line 7}} (:sessions (scan/starting-state false fresh legacy)))))
      (finally
        (fs/delete-tree dir)))))
