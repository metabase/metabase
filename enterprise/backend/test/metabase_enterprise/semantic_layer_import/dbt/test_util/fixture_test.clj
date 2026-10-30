(ns metabase-enterprise.semantic-layer-import.dbt.test-util.fixture-test
  "The fixture generator's parts that run without dbt: what it copies, what it keeps of a manifest, how it runs dbt,
  how the scratch copy is set up and torn down, and how the password stays off the screen."
  (:require
   [clojure.java.io :as io]
   [clojure.java.shell :as sh]
   [clojure.string :as str]
   [clojure.test :refer [deftest is testing]]
   [metabase-enterprise.semantic-layer-import.dbt.test-util.fixture :as fixture]
   [metabase.test :as mt]
   [metabase.util :as u]
   [metabase.util.secret :as u.secret]
   [metabase.util.yaml :as yaml])
  (:import
   (java.io File)))

(set! *warn-on-reflection* true)

(deftest ^:parallel dbt-command-test
  (testing "uvx with dbt-core and dbt-postgres pinned, whenever uvx is there"
    (is (= ["uvx"
            "--from" (str "dbt-core==" fixture/dbt-version)
            "--with" (str "dbt-postgres==" fixture/dbt-postgres-version)
            "dbt"]
           (#'fixture/dbt-command #{"uvx" "dbt"})
           (#'fixture/dbt-command #{"uvx"}))))
  (testing "a dbt on PATH only when uvx is not"
    (is (= ["dbt"] (#'fixture/dbt-command #{"dbt"}))))
  (is (thrown-with-msg? clojure.lang.ExceptionInfo #"neither uvx nor dbt is on PATH"
                        (#'fixture/dbt-command #{}))))

(deftest ^:parallel dbt-env-test
  (let [profiles-dir (io/file "/scratch/.profiles")]
    (testing "only what dbt and uvx need goes through, and the profiles dir is the scratch one"
      (is (= {"PATH"             "/usr/bin"
              "HOME"             "/home/me"
              "USER"             "me"
              "LANG"             "C.UTF-8"
              "LC_ALL"           "C"
              "TMPDIR"           "/tmp"
              "UV_CACHE_DIR"     "/home/me/.cache/uv"
              "XDG_CACHE_HOME"   "/home/me/.cache"
              "https_proxy"      "http://proxy:3128"
              "NO_PROXY"         "localhost"
              "DBT_PROFILES_DIR" (.getPath profiles-dir)}
             (#'fixture/dbt-env profiles-dir {"PATH"                  "/usr/bin"
                                              "HOME"                  "/home/me"
                                              "USER"                  "me"
                                              "LANG"                  "C.UTF-8"
                                              "LC_ALL"                "C"
                                              "TMPDIR"                "/tmp"
                                              "UV_CACHE_DIR"          "/home/me/.cache/uv"
                                              "XDG_CACHE_HOME"        "/home/me/.cache"
                                              "https_proxy"           "http://proxy:3128"
                                              "NO_PROXY"              "localhost"
                                              ;; the user's dbt settings, which would send dbt elsewhere
                                              "DBT_PROFILES_DIR"      "/home/me/.dbt"
                                              "DBT_PROJECT_DIR"       "/home/me/some-other-project"
                                              "DBT_TARGET_PATH"       "elsewhere"
                                              ;; secrets a project's env_var() could copy into the manifest
                                              "AWS_SECRET_ACCESS_KEY" "s3cret"
                                              "MB_POSTGRESQL_TEST_PASSWORD" "hunter2"
                                              "GITHUB_TOKEN"          "ghp_x"
                                              ;; a prefix match is not a match
                                              "PATHOLOGICAL"          "no"
                                              "XHOME"                 "no"}))))))

(deftest ^:parallel on-path-test
  (mt/with-temp-dir [bin-path nil]
    (mt/with-temp-dir [other-path nil]
      (let [executable (io/file bin-path "dbt")
            plain      (io/file bin-path "readme")
            path       (str other-path File/pathSeparator bin-path)]
        (spit executable "#!/bin/sh\n")
        (.setExecutable executable true)
        (spit plain "")
        (testing "an executable file in a PATH directory"
          (is (true? (#'fixture/on-path? "dbt" path))))
        (testing "not a file that is not executable, a directory, or a file elsewhere"
          (is (false? (#'fixture/on-path? "readme" path)))
          (is (false? (#'fixture/on-path? "dbt" (str other-path))))
          (is (false? (#'fixture/on-path? (.getName (io/file bin-path)) (.getParent (io/file bin-path))))))
        (testing "an empty or missing PATH"
          (is (false? (#'fixture/on-path? "dbt" "")))
          (is (false? (#'fixture/on-path? "dbt" nil))))))))

(deftest ^:parallel profiles-yaml-test
  (let [connection {:host "db.example.com", :port 15432, :user "dbt", :dbname "dbt_bi"}]
    (testing "one Postgres profile under the project's profile name, with the password as dbt should read it"
      (is (= {:my_project {:target  "dev"
                           :outputs {:dev {:type     "postgres"
                                           :host     "db.example.com"
                                           :port     15432
                                           :user     "dbt"
                                           :password "p: ss #word"
                                           :dbname   "dbt_bi"
                                           :schema   "public"
                                           :threads  4}}}}
             (-> (#'fixture/profiles-yaml "my_project" (assoc connection :password (u.secret/secret "p: ss #word")))
                 yaml/parse-string))))
    (testing "no password: an empty one, as a parse that never connects is happy with"
      (is (= "" (get-in (yaml/parse-string (#'fixture/profiles-yaml "p" (assoc connection :password nil)))
                        [:p :outputs :dev :password]))))))

(deftest check-dbt-version-test
  (is (nil? (#'fixture/check-dbt-version {"dbt_version" fixture/dbt-version})))
  (is (thrown-with-msg? clojure.lang.ExceptionInfo #"written by dbt 1\.11\.0, not the"
                        (#'fixture/check-dbt-version {"dbt_version" "1.11.0"})))
  (is (thrown-with-msg? clojure.lang.ExceptionInfo #"written by dbt"
                        (#'fixture/check-dbt-version {}))))

(deftest ^:parallel trim-manifest-test
  (let [node     (fn [resource-type package]
                   {"unique_id"     (str resource-type "." package ".n")
                    "resource_type" resource-type
                    "package_name"  package
                    "name"          "n"
                    "database"      "db"
                    "schema"        "public"
                    "alias"         "n"
                    "description"   nil
                    "columns"       {"id" {"name" "id", "description" nil, "data_type" "integer", "tags" []}}
                    "raw_code"      "select 1"})
        manifest {"metadata"        {"dbt_schema_version" "v12"
                                     "dbt_version"        fixture/dbt-version
                                     "project_name"       "p"
                                     "adapter_type"       "postgres"
                                     "generated_at"       "2026-10-29T00:00:00Z"
                                     "invocation_id"      "abc"}
                  "nodes"           {"model.p.own"         (node "model" "p")
                                     "seed.p.lookup"       (node "seed" "p")
                                     "test.p.not_null_own" (node "test" "p")
                                     "model.pkg.used"      (node "model" "pkg")
                                     "model.pkg.unused"    (node "model" "pkg")}
                  "semantic_models" {"semantic_model.p.a" {"depends_on" {"nodes" ["seed.p.lookup" "model.pkg.used"]}}}
                  "metrics"         {"metric.p.m" {"name" "m"}}
                  "sources"         {}}
        trimmed  (#'fixture/trim-manifest manifest)]
    (is (= #{"metadata" "nodes" "semantic_models" "metrics"} (set (keys trimmed))))
    (testing "metadata reduced to the keys the converter reads"
      (is (= {"dbt_schema_version" "v12"
              "dbt_version"        fixture/dbt-version
              "project_name"       "p"
              "adapter_type"       "postgres"
              "generated_at"       "2026-10-29T00:00:00Z"}
             (get trimmed "metadata"))))
    (testing "the project's own models, and whatever a semantic model depends on: a seed, a package's model"
      (is (= #{"model.p.own" "seed.p.lookup" "model.pkg.used"}
             (set (keys (get trimmed "nodes"))))))
    (testing "a node reduced to its identity, relation and columns"
      (is (= {"unique_id"     "seed.p.n"
              "resource_type" "seed"
              "name"          "n"
              "database"      "db"
              "schema"        "public"
              "alias"         "n"
              "description"   nil
              "columns"       {"id" {"name" "id", "description" nil, "data_type" "integer"}}}
             (get-in trimmed ["nodes" "seed.p.lookup"]))))))

(defn- git!
  [^File dir & args]
  (let [{:keys [exit err]} (apply sh/sh "git" "-C" (.getPath dir) args)]
    (when-not (zero? exit)
      (throw (ex-info (format "git %s failed: %s" (str/join " " args) err) {:args args, :exit exit})))))

(defn- write!
  [^File dir relative content]
  (let [f (io/file dir relative)]
    (io/make-parents f)
    (spit f content)))

(defn- relative-files
  "Every file under `dir`, as a path relative to it."
  [^File dir]
  (into #{}
        (comp (filter #(.isFile ^File %))
              (map #(str (.relativize (.toPath dir) (.toPath ^File %)))))
        (file-seq dir)))

(deftest copy-project-git-checkout-test
  (mt/with-temp-dir [project-path nil]
    (mt/with-temp-dir [scratch-path nil]
      (let [project (io/file project-path)]
        (git! project "init" "-q")
        (write! project ".gitignore" "logs/\ndbt_packages/\nignored.txt\n")
        (write! project "dbt_project.yml" "name: p\nprofile: p\n")
        (write! project "models/kept.sql" "select 1")
        (write! project "models/deleted.sql" "select 2")
        (git! project "add" "-A")
        (.delete (io/file project "models/deleted.sql"))
        (write! project "models/untracked.sql" "select 3")
        (write! project "ignored.txt" "no")
        (write! project "logs/dbt.log" "no")
        (write! project "target/manifest.json" "{}")
        (write! project "dbt_packages/dbt_utils/macros/x.sql" "yes")
        (write! project "package-lock.yml" "packages: []")
        (fixture/copy-project project (io/file scratch-path))
        (testing (str "tracked and untracked files and the installed packages; not what is ignored, what was deleted"
                      " from the working tree, or what dbt itself writes")
          (is (= #{".gitignore"
                   "dbt_project.yml"
                   "models/kept.sql"
                   "models/untracked.sql"
                   "dbt_packages/dbt_utils/macros/x.sql"
                   "package-lock.yml"}
                 (relative-files (io/file scratch-path)))))))))

(deftest copy-project-plain-directory-test
  (mt/with-temp-dir [project-path nil]
    (mt/with-temp-dir [scratch-path nil]
      (let [project (io/file project-path)]
        (write! project "dbt_project.yml" "name: p\n")
        (write! project "models/a.sql" "select 1")
        (write! project "target/manifest.json" "{}")
        (write! project "logs/dbt.log" "")
        (fixture/copy-project project (io/file scratch-path))
        (is (= #{"dbt_project.yml" "models/a.sql"}
               (relative-files (io/file scratch-path))))))))

(def ^:private connection
  "A connection with a password that must never show up in a test's output."
  {:host "localhost", :port 5432, :user "nobody", :password (u.secret/secret "hunter2"), :dbname "db"})

(deftest ^:parallel connection-prints-redacted-test
  (testing "a connection map prints without its password, however it is printed"
    (is (not (str/includes? (pr-str connection) "hunter2")))
    (is (not (str/includes? (str connection) "hunter2")))
    (is (not (str/includes? (u/pprint-to-str connection) "hunter2"))))
  (testing "a schema check that fails on the map reports it, redacted"
    (let [e (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Invalid input"
                                  (fixture/with-scratch-project (io/file "nowhere") (dissoc connection :host) {}
                                    (fn [_ _]))))]
      (is (not (str/includes? (ex-message e) "hunter2")))
      (is (not (str/includes? (pr-str (ex-data e)) "hunter2"))))))

(deftest with-scratch-project-test
  (mt/with-temp-dir [project-path nil]
    (let [project  (io/file project-path)
          scratch* (atom nil)]
      (write! project "dbt_project.yml" "name: p\nprofile: my_profile\n")
      (write! project "models/a.sql" "select 1")
      (testing "f gets a copy of the project and a profiles dir with the connection's profile; its result comes back"
        (is (= :done
               (fixture/with-scratch-project project connection {}
                 (fn [^File scratch ^File profiles-dir]
                   (reset! scratch* scratch)
                   (is (= #{"dbt_project.yml" "models/a.sql" ".profiles/profiles.yml"} (relative-files scratch)))
                   (is (= "my_profile"
                          (-> (yaml/parse-string (slurp (io/file profiles-dir "profiles.yml"))) keys first name)))
                   (is (= "hunter2"
                          (-> (yaml/parse-string (slurp (io/file profiles-dir "profiles.yml")))
                              (get-in [:my_profile :outputs :dev :password]))))
                   :done)))))
      (testing "the scratch directory is gone afterwards"
        (is (not (.exists ^File @scratch*)))))))

(deftest ^:parallel with-scratch-project-not-a-project-test
  (mt/with-temp-dir [project-path nil]
    (is (thrown-with-msg? clojure.lang.ExceptionInfo #"is not a dbt project; pass :project"
                          (fixture/with-scratch-project (io/file project-path) connection {} (fn [_ _]))))))

(deftest with-scratch-project-cleanup-does-not-mask-test
  (testing "when f throws and the scratch directory cannot be deleted, f's exception is the one that comes out"
    (mt/with-temp-dir [project-path nil]
      (let [project (io/file project-path)
            locked* (atom nil)]
        (write! project "dbt_project.yml" "name: p\nprofile: p\n")
        (try
          (mt/with-log-messages-for-level [messages [metabase-enterprise.semantic-layer-import.dbt.test-util.fixture
                                                     :warn]]
            (is (thrown-with-msg? clojure.lang.ExceptionInfo #"^boom$"
                                  (fixture/with-scratch-project project connection {}
                                    (fn [^File scratch _]
                                      (let [locked (io/file scratch "locked")]
                                        (write! locked "x" "x")
                                        (.setReadable locked false)
                                        (.setExecutable locked false)
                                        (reset! locked* locked))
                                      (throw (ex-info "boom" {}))))))
            ;; root can delete anything, so there is nothing to log then
            (when-not (.canRead ^File @locked*)
              (is (=? [{:level :warn, :message #"Could not delete the scratch directory .*"}]
                      (messages)))))
          (finally
            (when-let [^File locked @locked*]
              (.setReadable locked true)
              (.setExecutable locked true)
              (org.apache.commons.io.FileUtils/deleteDirectory (.getParentFile locked)))))))))

(deftest with-scratch-project-packages-test
  (mt/with-temp-dir [project-path nil]
    (let [project (io/file project-path)]
      (write! project "dbt_project.yml" "name: p\nprofile: p\n")
      (write! project "packages.yml" "packages:\n  - package: dbt-labs/dbt_utils\n    version: 1.3.0\n")
      (testing "packages declared but not installed: refused unless asked to run dbt deps"
        (is (thrown-with-msg? clojure.lang.ExceptionInfo #"declares packages but has no dbt_packages"
                              (fixture/with-scratch-project project connection {} (fn [_ _] :ran))))
        (is (thrown-with-msg? clojure.lang.ExceptionInfo #"declares packages but has no dbt_packages"
                              (fixture/with-scratch-project project connection {:deps? false} (fn [_ _] :ran)))))
      (testing "installed packages come along, so dbt deps is not needed"
        (write! project "dbt_packages/dbt_utils/dbt_project.yml" "name: dbt_utils\n")
        (is (= :ran (fixture/with-scratch-project project connection {} (fn [_ _] :ran))))))))

(deftest fixture-overrides-test
  (testing "the checked-in fixture projects declare no packages, so no regeneration needs dbt deps"
    (is (not (.exists (io/file (get-in fixture/fixtures [:parcel-delivery :project]) "packages.yml"))))
    (is (not (.exists (io/file (get-in fixture/fixtures [:parcel-delivery :project]) "dependencies.yml")))))
  (testing "a typo in the overrides is refused before anything runs"
    (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Invalid input"
                          (fixture/regenerate! :parcel-delivery {:dep? true})))))

(deftest check-repo-root-test
  (testing "the tests run at the repo root"
    (is (nil? (fixture/check-repo-root)))))
