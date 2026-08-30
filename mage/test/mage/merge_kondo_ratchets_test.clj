(ns mage.merge-kondo-ratchets-test
  "`bin/merge-kondo-ratchets` against real merge conflicts in temporary repositories."
  {:clj-kondo/config (quote {:lint-as {mage.merge-kondo-ratchets-test/with-conflict clojure.core/let}})}
  (:require
   [babashka.fs :as fs]
   [babashka.process :as p]
   [clojure.string :as str]
   [clojure.test :refer [deftest is testing]]
   [mage.util :as u]))

;; Referenced by core_test.clj to ensure namespace is loaded
(def keep-me :loaded)

(def ^:private script
  (str u/project-root-directory "/bin/merge-kondo-ratchets"))

(def ^:private ratchets-file
  ".clj-kondo/ratchets.edn")

;; Keep the user's git configuration (hooks, merge drivers) out of the temporary repositories.
(def ^:private git-env
  {"GIT_CONFIG_GLOBAL"   "/dev/null"
   "GIT_CONFIG_NOSYSTEM" "1"
   "GIT_AUTHOR_NAME"     "merge test"
   "GIT_AUTHOR_EMAIL"    "merge-test@example.com"
   "GIT_COMMITTER_NAME"  "merge test"
   "GIT_COMMITTER_EMAIL" "merge-test@example.com"})

(defn- run
  "Run `args` in `dir` and return `{:exit _, :out _, :err _}` without throwing."
  [dir & args]
  (-> (apply p/shell {:dir (str dir), :out :string, :err :string, :continue true, :extra-env git-env} args)
      (select-keys [:exit :out :err])))

(defn- git [dir & args]
  (let [{:keys [exit err] :as result} (apply run dir "git" args)]
    (when-not (zero? exit)
      (throw (ex-info (str "git " (str/join " " args) " failed: " err) result)))
    (str/trim-newline (:out result))))

(defn- write-files!
  "Write `path->content` under `dir`; a nil content deletes the path."
  [dir path->content]
  (doseq [[path content] path->content
          :let           [f (fs/path dir path)]]
    (if (nil? content)
      (fs/delete-if-exists f)
      (do (fs/create-dirs (fs/parent f))
          (spit (str f) content)))))

(defn- commit-all! [dir message]
  (git dir "add" "-A")
  (git dir "commit" "-q" "--allow-empty" "-m" message))

(defn- conflicted-repo!
  "A repository whose `main` branch is mid-merge of `theirs`, from a root commit holding `base`, with each
  side's files committed on top. Returns the repository directory."
  [dir {:keys [base ours theirs]}]
  (git dir "init" "-q" "-b" "main")
  (write-files! dir (merge {"app.txt" "base\n"} base))
  (commit-all! dir "base")
  (git dir "checkout" "-q" "-b" "theirs")
  (write-files! dir (merge {"app.txt" "theirs\n"} theirs))
  (commit-all! dir "theirs")
  (git dir "checkout" "-q" "main")
  (write-files! dir (merge {"app.txt" "ours\n"} ours))
  (commit-all! dir "ours")
  (let [{:keys [exit]} (run dir "git" "merge" "-q" "theirs")]
    (assert (= 1 exit) "the merge must conflict"))
  dir)

(defmacro ^:private with-conflict
  "Bind `sym` to a [[conflicted-repo!]] built from `stages`, deleting it afterwards."
  [[sym stages] & body]
  `(let [dir# (fs/create-temp-dir {:prefix "merge-kondo-ratchets-"})]
     (try
       (let [~sym (conflicted-repo! dir# ~stages)]
         ~@body)
       (finally
         (fs/delete-tree dir#)))))

(defn- status
  "`git status --porcelain` lines, so a test can see what is staged and what is still unmerged."
  [dir]
  (set (str/split-lines (git dir "status" "--porcelain"))))

(defn- ratchets-text [dir]
  (slurp (str (fs/path dir ratchets-file))))

(defn- ratchets-policies
  "The merged file's policy map, without the comment header."
  [dir]
  (->> (str/split-lines (ratchets-text dir))
       (remove #(str/starts-with? % ";;"))
       (str/join "\n")
       read-string))

(defn- ratchets
  "Ratchets file text for the given policies."
  [ignore-counts config-counts comment-exempt]
  (str "{:ignore-counts " (pr-str ignore-counts)
       "\n :config-counts " (pr-str config-counts)
       "\n :comment-exempt " (pr-str comment-exempt) "}\n"))

(def ^:private base-ratchets
  (ratchets {:a 5, :b :unlimited, :ours-drop 2} {:c 2} #{:b}))

(deftest resolves-concurrent-changes-test
  (with-conflict [dir {:base   {ratchets-file base-ratchets}
                       :ours   {ratchets-file (ratchets {:a 5, :b 3} {:c 1} #{})}
                       :theirs {ratchets-file (ratchets {:a 4, :b :unlimited, :ours-drop 1} {:c 2} #{:b})}}]
    (let [{:keys [exit out]} (run dir script)]
      (is (= 0 exit))
      (is (str/includes? out "staged merged .clj-kondo/ratchets.edn")))
    (testing "the finite budget beats :unlimited, one-sided changes win, and a concurrent removal stays gone"
      (is (= {:ignore-counts  {:a 4, :b 3}
              :config-counts  {:c 1}
              :comment-exempt #{}}
             (ratchets-policies dir))))
    (testing "only the ratchets file is staged; the other conflict is left alone"
      (is (= #{"M  .clj-kondo/ratchets.edn" "UU app.txt"}
             (status dir))))))

(deftest runs-from-a-subdirectory-test
  (with-conflict [dir {:base   {ratchets-file base-ratchets}
                       :ours   {ratchets-file "{:ignore-counts {:a 3}}\n", "sub/dir/file.txt" "x\n"}
                       :theirs {ratchets-file "{:ignore-counts {:a 4}}\n"}}]
    (is (= 0 (:exit (run (fs/path dir "sub/dir") script))))
    (is (= {:a 3} (:ignore-counts (ratchets-policies dir))))
    (is (contains? (status dir) "M  .clj-kondo/ratchets.edn"))))

(deftest both-sides-added-test
  (with-conflict [dir {:ours   {ratchets-file "{:ignore-counts {:a 3, :shared :unlimited}}\n"}
                       :theirs {ratchets-file "{:ignore-counts {:b 4, :shared 2}}\n"}}]
    (is (= 0 (:exit (run dir script))))
    (is (= {:ignore-counts  {:a 3, :b 4, :shared 2}
            :config-counts  {}
            :comment-exempt #{}}
           (ratchets-policies dir)))
    (is (= #{"M  .clj-kondo/ratchets.edn" "UU app.txt"}
           (status dir)))))

(deftest keeps-a-disabled-target-verbatim-test
  (let [disabled ";; release branch\n{:disabled true}\n"]
    (with-conflict [dir {:base   {ratchets-file base-ratchets}
                         :ours   {ratchets-file disabled}
                         :theirs {ratchets-file "{:ignore-counts {:a 4}}\n"}}]
      (is (= 0 (:exit (run dir script))))
      (is (= disabled (ratchets-text dir)))
      (is (= #{"UU app.txt"} (status dir))
          "resolved, and identical to the target branch so nothing shows as changed"))))

(defn- output
  "Everything a run of the script prints; mage reports task exceptions on stdout."
  [dir]
  (let [{:keys [out err]} (run dir script)]
    (str out err)))

(defn- leaves-unresolved?
  "Whether the script exits nonzero and leaves the ratchets file exactly as the conflict left it."
  [dir]
  (let [before         (status dir)
        {:keys [exit]} (run dir script)]
    (and (pos? exit)
         (= before (status dir)))))

(deftest delete-versus-modify-is-left-for-a-human-test
  (testing "deleted on the target branch"
    (with-conflict [dir {:base   {ratchets-file base-ratchets}
                         :ours   {ratchets-file nil}
                         :theirs {ratchets-file "{:ignore-counts {:a 4}}\n"}}]
      (is (leaves-unresolved? dir))
      (is (str/includes? (output dir) "deleted on one side and changed on the other"))
      (is (contains? (status dir) "DU .clj-kondo/ratchets.edn"))))
  (testing "deleted on the incoming branch"
    (with-conflict [dir {:base   {ratchets-file base-ratchets}
                         :ours   {ratchets-file "{:ignore-counts {:a 4}}\n"}
                         :theirs {ratchets-file nil}}]
      (is (leaves-unresolved? dir))
      (is (contains? (status dir) "UD .clj-kondo/ratchets.edn")))))

(deftest malformed-stage-is-left-unresolved-test
  (testing "an invalid policy"
    (with-conflict [dir {:base   {ratchets-file base-ratchets}
                         :ours   {ratchets-file "{:ignore-counts {:a 3}}\n"}
                         :theirs {ratchets-file "{:ignore-counts {:a :sometimes}}\n"}}]
      (is (leaves-unresolved? dir))
      (is (str/includes? (output dir) ":a has invalid policy :sometimes"))))
  (testing "a policy field of the wrong shape is not read as an empty set of policies"
    (doseq [[stage message] [["{:ignore-counts {:a 3}, :config-counts []}\n"  ":config-counts must be a map"]
                             ["{:ignore-counts {:a 3}, :comment-exempt []}\n" ":comment-exempt must be a set"]]]
      (with-conflict [dir {:base   {ratchets-file base-ratchets}
                           :ours   {ratchets-file stage}
                           :theirs {ratchets-file "{:ignore-counts {:a 4}}\n"}}]
        (is (leaves-unresolved? dir) stage)
        (is (str/includes? (output dir) message)))))
  (testing "an unknown field, even when the target is disabled"
    (with-conflict [dir {:base   {ratchets-file base-ratchets}
                         :ours   {ratchets-file "{:disabled true}\n"}
                         :theirs {ratchets-file "{:budgets {:a 3}}\n"}}]
      (is (leaves-unresolved? dir))
      (is (str/includes? (output dir) "unsupported ratchet fields: #{:budgets}")))))

(deftest refuses-an-unconflicted-file-test
  (with-conflict [dir {:base {ratchets-file base-ratchets}}]
    (let [{:keys [exit err]} (run dir script)]
      (is (= 1 exit))
      (is (str/includes? err "is not conflicted")))))
