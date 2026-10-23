(ns mage.docs-preview-test
  (:require
   [babashka.fs :as fs]
   [clojure.string :as str]
   [clojure.test :refer [deftest is testing]]
   [mage.docs-preview :as docs-preview])
  (:import
   (java.net InetAddress ServerSocket)))

(set! *warn-on-reflection* true)

(defn- canonical [path]
  (str (fs/canonicalize path)))

(defn- error-output
  "What `thunk` prints when it stops with an error."
  [thunk]
  (with-out-str (is (thrown? clojure.lang.ExceptionInfo (thunk)))))

(deftest site-dir-test
  (fs/with-temp-dir [tmp {}]
    (let [root   (canonical tmp)
          option (str root "/from-option")
          env    (str root "/from-env")]
      (doseq [dir [option env]]
        (fs/create-dirs (fs/path dir "apps" "docs")))
      (testing "the --site option wins over the env var"
        (is (= option (docs-preview/site-dir root option {docs-preview/site-env-var env}))))
      (testing "the env var is used when there is no option"
        (is (= env (docs-preview/site-dir root nil {docs-preview/site-env-var env}))))
      (testing "a relative path starts at root"
        (is (= option (docs-preview/site-dir root "from-option" {}))))
      (testing "a dir without apps/docs is an error that names the option and the env var"
        (is (re-find #"(?s)No metabase-dot-com checkout.*--site DIR.*METABASE_DOT_COM_DIR"
                     (error-output #(docs-preview/site-dir root (str root "/nope") {}))))))))

(deftest site-dir-default-test
  (testing "the default is ~/metabase-dot-com"
    (let [expected (canonical (fs/expand-home "~/metabase-dot-com"))]
      (if (fs/directory? (fs/path expected "apps" "docs"))
        (is (= expected (docs-preview/site-dir "/" nil {})))
        (is (str/includes? (error-output #(docs-preview/site-dir "/" nil {})) expected))))))

(deftest repo-dir-test
  (fs/with-temp-dir [tmp {}]
    (let [root     (canonical tmp)
          worktree (str root "/.claude/worktrees/my-feature")]
      (fs/create-dirs (fs/path root "docs"))
      (fs/create-dirs (fs/path worktree "docs"))
      (testing "the default is root"
        (is (= root (docs-preview/repo-dir root nil))))
      (testing "a relative path starts at root"
        (is (= worktree (docs-preview/repo-dir root ".claude/worktrees/my-feature"))))
      (testing "an absolute path is used as it is"
        (is (= worktree (docs-preview/repo-dir root worktree))))
      (testing "a dir without docs/ is an error"
        (is (re-find #"No docs/ folder" (error-output #(docs-preview/repo-dir root ".claude"))))))))

(deftest listening-host-test
  ;; Port 0 gives a free port.
  (doseq [[bind-address expected] [["127.0.0.1" "127.0.0.1"]
                                   ["::1" "[::1]"]]]
    (testing (str "a server on " bind-address " gives " expected ", which goes in a URL")
      (with-open [server (ServerSocket. 0 1 (InetAddress/getByName bind-address))]
        (is (= expected (docs-preview/listening-host (.getLocalPort server)))))))
  (testing "no server gives nil"
    (let [port (with-open [server (ServerSocket. 0)] (.getLocalPort server))]
      (is (nil? (docs-preview/listening-host port))))))
