(ns test-check
  (:require
   [babashka.fs :as fs]
   [babashka.process :as process]
   [clojure.string :as str]
   [clojure.test :refer [deftest is run-tests testing]]))

(def launcher (str (fs/path (fs/parent (fs/absolutize *file*)) "check")))

(deftest full-and-changed-checks
  (fs/with-temp-dir [root {}]
    (letfn [(path [name] (fs/path root name))
            (put [name contents]
              (fs/create-dirs (fs/parent (path name)))
              (spit (fs/file (path name)) contents))
            (git [& args]
              (str/trim (:out (apply process/shell {:dir root :out :string} "git" args))))
            (snapshot []
              (git "add" "-A")
              (git "commit" "-qm" "Fixture")
              (git "rev-parse" "HEAD"))
            (check [expected & args]
              (let [{:keys [exit out]} (apply process/shell {:dir root :out :string :err :out :continue true}
                                              "bash" launcher args)]
                (is (= expected exit) out)
                out))]
      (git "init" "-q")
      (doseq [[k v] [["user.email" "ci@example.com"] ["user.name" "CI"] ["commit.gpgsign" "false"]]]
        (git "config" k v))
      (put ".cljfmt.edn" "{:paths [\"src\" \".clj-kondo/test\"]}\n")
      (put "src/unchanged.clj" "( def x 1 )\n")
      (put "src/deleted.clj" "(def x 1)\n")
      (put "outside/moved.clj" "( def x 1 )\n")
      (let [base (snapshot)]
        (put "outside/new.clj" "( def x 1 )\n")
        (fs/delete (path "src/deleted.clj"))
        (let [clean (snapshot)]
          (testing "empty diffs, deleted files and changes outside scope"
            (doseq [sha [clean base]]
              (is (str/includes? (check 0 "--pr" sha) "No changed files"))))
          (testing "full scan and unavailable diff base"
            (is (str/includes? (check 1) "src/unchanged.clj"))
            (is (str/includes? (check 1 "--pr" "missing-base") "src/unchanged.clj")))
          (fs/move (path "outside/moved.clj") (path "src/with space.clj"))
          (let [moved (snapshot)]
            (is (str/includes? (check 1 "--pr" clean) "src/with space.clj"))
            (is (str/includes? (check 1 "--pr") "src/unchanged.clj"))
            (put "src/with space.clj" "(def x 1)\n")
            (put ".clj-kondo/test/new.bb" "(def x\n")
            (let [other (snapshot)]
              (is (str/includes? (check 2 "--pr" moved) ".clj-kondo/test/new.bb"))
              (testing "merge checkout uses its first parent unless given a stacked PR base"
                (git "checkout" "-qb" "base-branch" clean)
                (put "src/on-base.clj" "( def x 1 )\n")
                (snapshot)
                (git "merge" "--no-ff" "-qm" "PR merge" moved)
                (let [output (check 1 "--pr")]
                  (is (str/includes? output "src/with space.clj"))
                  (is (not (str/includes? output "src/on-base.clj"))))
                (is (str/includes? (check 1 "--pr" clean) "src/on-base.clj")))
              (git "checkout" "-q" other)
              (testing "formatter config and nested attributes trigger full scans"
                (fs/delete (path ".clj-kondo/test/new.bb"))
                (put ".cljfmt.edn" "{:paths [\"src\"]}\n")
                (let [configured (snapshot)]
                  (is (str/includes? (check 1 "--pr" other) "src/unchanged.clj"))
                  (put "src/.gitattributes" "*.clj text\n")
                  (snapshot)
                  (is (str/includes? (check 1 "--pr" configured) "src/unchanged.clj"))))
              (testing "tracked symlinks include changes outside the configured paths"
                (put "outside/linked.clj" "(def x 1)\n")
                (fs/create-sym-link (path "src/link") "../outside")
                (let [linked (snapshot)]
                  (put "outside/linked.clj" "( def x 1 )\n")
                  (snapshot)
                  (is (str/includes? (check 1 "--pr" linked) "src/link/linked.clj")))))))))))

(let [{:keys [fail error]} (run-tests 'test-check)]
  (System/exit (if (zero? (+ fail error)) 0 1)))
