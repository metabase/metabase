(ns mage.papercuts.hooks-test
  (:require
   [babashka.fs :as fs]
   [babashka.json :as json]
   [clojure.string :as str]
   [clojure.test :refer [deftest is testing]]
   [mage.papercuts.hooks :as hooks]))

(set! *warn-on-reflection* true)

(deftest selected-agents-test
  (is (= ["claude" "codex"] (hooks/selected-agents nil ["codex" "claude"])))
  (is (= ["claude"] (hooks/selected-agents nil ["claude"])))
  (is (= ["codex"] (hooks/selected-agents "codex" ["claude" "codex"])))
  (is (= ["claude" "codex"] (hooks/selected-agents "both" ["claude" "codex"])))
  (is (thrown? Exception (hooks/selected-agents "both" ["claude"])))
  (is (thrown? Exception (hooks/selected-agents "codex" ["claude"])))
  (is (thrown? Exception (hooks/selected-agents nil []))))

(deftest updated-config-test
  (let [old     {"model" "opus"
                 "hooks" {"SessionEnd" [{"hooks" [{"type" "command", "command" "existing-hook"}]}]}}
        updated (hooks/updated-config old "claude")]
    (is (= "opus" (get updated "model")))
    (is (= "existing-hook" (get-in updated ["hooks" "SessionEnd" 0 "hooks" 0 "command"])))
    (is (= 2 (count (get-in updated ["hooks" "SessionEnd"]))))
    (is (= 1 (count (get-in updated ["hooks" "Stop"]))))
    (is (= updated (hooks/updated-config updated "claude")))))

(deftest install-at-test
  (let [home (fs/create-temp-dir {:prefix "papercut-hooks-test"})]
    (try
      (let [claude (fs/path home ".claude" "settings.json")
            codex  (fs/path home ".codex" "hooks.json")]
        (fs/create-dirs (fs/parent claude))
        (spit (str claude) (json/write-str {"model" "opus"}))
        (hooks/install-at! home ["claude" "codex"])
        (testing "both agents get both events, while unrelated settings survive"
          (is (= "opus" (get (json/read-str (slurp (str claude)) {:key-fn identity}) "model")))
          (doseq [path [claude codex]
                  event ["Stop" "SessionEnd"]]
            (is (= 1 (count (get-in (json/read-str (slurp (str path)) {:key-fn identity}) ["hooks" event]))))))
        (let [first-config (slurp (str claude))]
          (hooks/install-at! home ["claude"])
          (is (= first-config (slurp (str claude))))
          (is (= 1 (count (fs/glob (fs/parent claude) "settings.json.bak.*")))))
        (is (str/includes? (slurp (str codex)) "session_scan_hook.py")))
      (finally
        (fs/delete-tree home)))))

(deftest install-at-symlinked-config-test
  (let [home (fs/create-temp-dir {:prefix "papercut-hooks-test"})]
    (try
      (let [target (fs/path home "dotfiles" "settings.json")
            link   (fs/path home ".claude" "settings.json")]
        (fs/create-dirs (fs/parent target))
        (fs/create-dirs (fs/parent link))
        (spit (str target) (json/write-str {"model" "opus"}))
        (fs/create-sym-link link target)
        (hooks/install-at! home ["claude"])
        (testing "a dotfile-managed config stays a link, and its target gets the hooks"
          (is (fs/sym-link? link))
          (is (= 1 (count (get-in (json/read-str (slurp (str target)) {:key-fn identity}) ["hooks" "Stop"]))))))
      (finally
        (fs/delete-tree home)))))

(deftest install-at-dangling-symlink-test
  (let [home (fs/create-temp-dir {:prefix "papercut-hooks-test"})]
    (try
      (let [target (fs/path home "dotfiles" "claude" "settings.json")
            link   (fs/path home ".claude" "settings.json")]
        (fs/create-dirs (fs/parent link))
        (fs/create-sym-link link (fs/relativize (fs/parent link) target))
        (hooks/install-at! home ["claude"])
        (testing "a link whose target doesn't exist yet gets the target created"
          (is (fs/sym-link? link))
          (is (= 1 (count (get-in (json/read-str (slurp (str target)) {:key-fn identity}) ["hooks" "Stop"]))))))
      (finally
        (fs/delete-tree home)))))

(deftest install-at-symlink-loop-test
  (let [home (fs/create-temp-dir {:prefix "papercut-hooks-test"})]
    (try
      (let [link  (fs/path home ".claude" "settings.json")
            other (fs/path home ".claude" "other.json")]
        (fs/create-dirs (fs/parent link))
        (fs/create-sym-link link other)
        (fs/create-sym-link other link)
        (testing "a symlink loop fails instead of hanging"
          (is (thrown-with-msg? Exception #"Symlink loop" (hooks/install-at! home ["claude"])))))
      (finally
        (fs/delete-tree home)))))

(deftest install-at-config-dir-env-test
  (let [home (fs/create-temp-dir {:prefix "papercut-hooks-test"})]
    (try
      (let [claude-dir (str (fs/path home "custom-claude"))
            codex-dir  (str (fs/path home "custom-codex"))]
        (hooks/install-at! {"CLAUDE_CONFIG_DIR" claude-dir "CODEX_HOME" codex-dir} home ["claude" "codex"])
        (testing "CLAUDE_CONFIG_DIR and CODEX_HOME replace ~/.claude and ~/.codex"
          (is (fs/exists? (fs/path claude-dir "settings.json")))
          (is (fs/exists? (fs/path codex-dir "hooks.json")))
          (is (not (fs/exists? (fs/path home ".claude"))))))
      (finally
        (fs/delete-tree home)))))
