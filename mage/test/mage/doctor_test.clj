(ns mage.doctor-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [mage.doctor :as doctor]))

(deftest diagnose-returns-expected-structure
  (testing "diagnose returns a map with all expected keys"
    (let [result (doctor/diagnose)]
      (is (map? result))
      (is (contains? result :mise))
      (is (contains? result :version-managers))
      (is (contains? result :tools))
      (is (contains? result :project))))

  (testing "mise info has expected keys"
    (let [mise (:mise (doctor/diagnose))]
      (is (contains? mise :installed?))))

  (testing "version-managers is a map"
    (let [result (doctor/diagnose)]
      (is (map? (:version-managers result)))))

  (testing "tools contains expected tool keys"
    (let [tools (:tools (doctor/diagnose))]
      (is (contains? tools :git))
      (is (contains? tools :node))
      (is (contains? tools :bun))
      (is (contains? tools :java))
      (is (contains? tools :clojure))
      (is (contains? tools :babashka))
      (is (contains? tools :docker))))

  (testing "each tool has :installed? key"
    (let [tools (:tools (doctor/diagnose))]
      (doseq [[tool-name tool-info] tools]
        (is (contains? tool-info :installed?)
            (str "Tool " tool-name " missing :installed? key")))))

  (testing "project state has expected keys"
    (let [project (:project (doctor/diagnose))]
      (is (contains? project :node-modules))
      (is (contains? project :nrepl-port))
      (is (contains? project :git-hooks))
      (is (contains? project :bun-lock))
      (is (contains? project :deps-edn)))))

(deftest get-git-status-returns-expected-structure
  (testing "git status has expected keys"
    (let [status (doctor/get-git-status)]
      (is (contains? status :branch))
      (is (contains? status :ahead))
      (is (contains? status :behind))
      (is (contains? status :clean?))
      (is (contains? status :uncommitted-count))))

  (testing "git status values have correct types"
    (let [status (doctor/get-git-status)]
      (is (or (string? (:branch status)) (nil? (:branch status))))
      (is (integer? (:ahead status)))
      (is (integer? (:behind status)))
      (is (boolean? (:clean? status)))
      (is (integer? (:uncommitted-count status))))))

(deftest version-parsing-tests
  (testing "parse-version extracts version parts"
    (is (= [21 0 1] (doctor/parse-version "21.0.1")))
    (is (= [22 13 1] (doctor/parse-version "22.13.1")))
    (is (= [1 22 0] (doctor/parse-version "1.22.0")))
    (is (= [22 13 1] (doctor/parse-version "v22.13.1"))))

  (testing "parse-version handles nil"
    (is (nil? (doctor/parse-version nil))))

  (testing "version>= comparisons"
    (is (true? (doctor/version>= "22.0.0" "22")))
    (is (true? (doctor/version>= "22.1.0" "22")))
    (is (true? (doctor/version>= "23.0.0" "22")))
    (is (false? (doctor/version>= "21.9.0" "22")))
    (is (true? (doctor/version>= "21.0.9" "21")))
    (is (true? (doctor/version>= "21.0.9" "21.0.1")))))

(deftest project-state-checks
  (testing "node-modules has :exists? key"
    (let [nm (get-in (doctor/diagnose) [:project :node-modules])]
      (is (contains? nm :exists?))
      (is (boolean? (:exists? nm)))))

  (testing "nrepl-port has :exists? key"
    (let [nrepl (get-in (doctor/diagnose) [:project :nrepl-port])]
      (is (contains? nrepl :exists?))
      (is (boolean? (:exists? nrepl)))))

  (testing "git-hooks has expected keys"
    (let [hooks (get-in (doctor/diagnose) [:project :git-hooks])]
      (is (contains? hooks :configured?))
      (is (contains? hooks :path))))

  (testing "bun-lock has expected keys"
    (let [yl (get-in (doctor/diagnose) [:project :bun-lock])]
      (is (contains? yl :exists?))))

  (testing "deps-edn has expected keys"
    (let [de (get-in (doctor/diagnose) [:project :deps-edn])]
      (is (contains? de :exists?)))))

(deftest installed-tools-have-versions
  (testing "installed tools have version strings"
    (let [tools (:tools (doctor/diagnose))]
      (doseq [[tool-name tool-info] tools
              :when (:installed? tool-info)]
        (is (string? (:version tool-info))
            (str "Installed tool " tool-name " should have version string"))))))

(deftest mise-info-structure
  (testing "mise info has expected keys"
    (let [mise (:mise (doctor/diagnose))]
      (is (contains? mise :installed?))
      (when (:installed? mise)
        (is (contains? mise :activated?))
        (is (boolean? (:activated? mise)))
        (is (contains? mise :toolset)))))

  (testing "mise info does not contain update-available? (that field was misinterpreted)"
    (let [mise (:mise (doctor/diagnose))]
      (is (not (contains? mise :update-available?))))))
