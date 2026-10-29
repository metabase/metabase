(ns dev.dbt-import.fixture-test
  "The fixture generator's parts that run without dbt: what it copies, what it keeps of a manifest, how it runs dbt,
  and the password wrapper the marts generator uses too."
  (:require
   [clojure.java.io :as io]
   [clojure.java.shell :as sh]
   [clojure.string :as str]
   [clojure.test :refer [deftest is testing]]
   [dev.dbt-import.fixture :as fixture]
   [metabase.test :as mt])
  (:import
   (java.io File)))

(set! *warn-on-reflection* true)

(deftest ^:parallel dbt-command-test
  (testing "uvx with dbt-core pinned, whenever uvx is there"
    (is (= ["uvx" "--from" (str "dbt-core==" fixture/dbt-version) "--with" "dbt-postgres" "dbt"]
           (#'fixture/dbt-command #{"uvx" "dbt"})
           (#'fixture/dbt-command #{"uvx"}))))
  (testing "a dbt on PATH only when uvx is not"
    (is (= ["dbt"] (#'fixture/dbt-command #{"dbt"}))))
  (is (thrown-with-msg? clojure.lang.ExceptionInfo #"neither uvx nor dbt is on PATH"
                        (#'fixture/dbt-command #{}))))

(deftest ^:parallel dbt-env-test
  (let [profiles-dir (io/file "/scratch/.profiles")]
    (testing "the user's DBT_* variables stay out, everything else goes through, and the profiles dir is the scratch one"
      (is (= {"PATH" "/usr/bin", "HOME" "/home/me", "DBT_PROFILES_DIR" (.getPath profiles-dir)}
             (#'fixture/dbt-env profiles-dir {"PATH"             "/usr/bin"
                                              "HOME"             "/home/me"
                                              "DBT_PROFILES_DIR" "/home/me/.dbt"
                                              "DBT_PROJECT_DIR"  "/home/me/some-other-project"
                                              "DBT_TARGET_PATH"  "elsewhere"}))))))

(deftest check-dbt-version-test
  (is (nil? (#'fixture/check-dbt-version! {"dbt_version" fixture/dbt-version})))
  (is (thrown-with-msg? clojure.lang.ExceptionInfo #"written by dbt 1\.11\.0, not the"
                        (#'fixture/check-dbt-version! {"dbt_version" "1.11.0"})))
  (is (thrown-with-msg? clojure.lang.ExceptionInfo #"written by dbt"
                        (#'fixture/check-dbt-version! {}))))

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
      (throw (ex-info (str "git failed: " err) {:args args})))))

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

(deftest ^:parallel secret-test
  (let [password (fixture/secret "hunter2")]
    (is (= "hunter2" (fixture/reveal password)))
    (testing "prints redacted, however it is printed"
      (is (= "#secret <redacted>" (pr-str password)))
      (is (= "<redacted>" (str password)))
      (is (not (str/includes? (pr-str {:host "localhost", :password password}) "hunter2"))))))

(deftest check-repo-root-test
  (testing "the tests run at the repo root"
    (is (nil? (fixture/check-repo-root!)))))
