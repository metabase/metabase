(ns metabase.cmd.driver-feature-dox-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.cmd.driver-feature-dox :as driver-feature-dox]
   [metabase.lib.schema.metadata :as lib.schema.metadata]
   [metabase.util.malli.registry :as mr]))

(set! *warn-on-reflection* true)

(def ^:private postgres {:driver :postgres :label "PostgreSQL"})

(def ^:private mariadb {:driver :mysql :label "MariaDB" :dbms-version {:flavor "MariaDB"}})

(def ^:private mysql {:driver :mysql :label "MySQL" :dbms-version {:flavor "MySQL"}})

(defn- cell [column feature]
  (#'driver-feature-dox/cell column feature))

(deftest ^:parallel config-problems-test
  (let [problems #(#'driver-feature-dox/config-problems %)]
    (testing "the curated file has no mistakes"
      (is (empty? (problems (#'driver-feature-dox/curated-config)))))
    (testing "a feature that doesn't exist, and a driver that isn't official"
      (is (= ["Not a driver feature: :no-such-feature" "Not an official driver: :no-such-driver"]
             (problems {:drivers  {:no-such-driver {:exclude "a reason"}}
                        :sections [{:features [{:feature [:left-join :no-such-feature]}]}]}))))))

(deftest ^:parallel fake-database-test
  (testing "the fake databases are valid database metadata, which `mu/defmethod`s like SQL Server's validate"
    (doseq [[driver cfg] (:drivers (#'driver-feature-dox/curated-config))
            :when        (not (:exclude cfg))
            column       (:columns cfg [{}])
            edition      (:editions cfg [{}])
            :let         [database (#'driver-feature-dox/fake-database (merge cfg column {:driver driver}) edition [1 0])]]
      (testing (pr-str driver (:dbms-version database))
        (is (mr/validate ::lib.schema.metadata/database database)))))
  (testing "ClickHouse keeps its version as a map"
    (is (= {:cloud true :semantic-version {:major 24 :minor 4}}
           (:dbms-version (#'driver-feature-dox/fake-database {:driver :clickhouse :version-shape :map}
                                                              {:dbms-version {:cloud true}}
                                                              [24 4]))))))

(deftest ^:parallel cell-test
  (testing "every version supports the feature, or none does"
    (is (= {:support :yes} (cell postgres :left-join)))
    (is (= {:support :no} (cell mysql :full-join))))
  (testing "MariaDB uses the MySQL driver, but can answer differently"
    (is (= {:support :yes} (cell mysql :regex/lookaheads-and-lookbehinds)))
    (is (= {:support :no} (cell mariadb :regex/lookaheads-and-lookbehinds))))
  (testing "a vector row is supported when any of its features is"
    (is (= {:support :yes} (cell postgres [:nested-fields :nested-field-columns]))))
  (testing "the note gives the version where support starts, from the driver's own check"
    (is (= {:support :depends :note "MySQL 8.0 and later."} (cell mysql :stage-ctes))))
  (testing "the note gives a version by its name, when it has one"
    (is (= {:support :depends :note "MySQL Eight and later."}
           (cell (assoc mysql :version-names {[8 0] "Eight"}) :stage-ctes))))
  (testing "an oldest version above that check makes the note unnecessary"
    (is (= {:support :yes} (cell (assoc mysql :oldest-version [8 0]) :stage-ctes))))
  (testing "the note names the editions that support the feature"
    (is (= {:support :depends :note "MySQL."}
           (cell {:driver :mysql :label "MySQL or MariaDB" :editions [{:label "MariaDB" :dbms-version {:flavor "MariaDB"}}
                                                                      {:label "MySQL" :dbms-version {:flavor "MySQL"}}]}
                 :regex/lookaheads-and-lookbehinds)))))

(deftest ^:parallel section-markdown-test
  (let [note     "Versioned 2.0 and later."
        rows     [{:row   {:feature :inner-join :label "Inner join" :doc "join.md"}
                   :cells [{:support :yes} {:support :yes} {:support :yes}]}
                  {:row   {:feature :full-join :label "Full outer join" :doc "join.md"}
                   :cells [{:support :yes} {:support :no} {:support :no}]}
                  {:row   {:feature :percentile-aggregations :label "Percentile"}
                   :cells [{:support :yes} {:support :no} {:support :depends :note note}]}
                  {:row   {:feature :distinct-where :label "DistinctIf"}
                   :cells [{:support :no} {:support :no} {:support :depends :note note}]}]
        markdown (#'driver-feature-dox/section-markdown "Aggregations" ["PostgreSQL" "MySQL" "Versioned"] rows)
        lines    (str/split-lines markdown)]
    (testing "the section opens with its heading"
      (is (= "## Aggregations" (first lines))))
    (testing "a feature that every database supports is in the list above the table, not in the table"
      (is (some #{"- [Inner join](join.md)"} lines))
      (is (not-any? #(str/starts-with? % "| [Inner join]") lines)))
    (testing "a feature row links to its docs, and marks each database"
      (is (some #(re-find #"^\| \[Full outer join\]\(join\.md\) +\| ✅ +\| ❌ +\| ❌ +\|$" %) lines)))
    (testing "a version-dependent cell points to a numbered note below the table"
      (is (some #(re-find #"^\| Percentile +\| ✅ +\| ❌ +\| ✅ \(1\) +\|$" %) lines))
      (is (= "1. Versioned 2.0 and later." (last lines))))
    (testing "cells that share a note share its number, and the note prints once"
      (is (some #(re-find #"^\| DistinctIf +\| ❌ +\| ❌ +\| ✅ \(1\) +\|$" %) lines))
      (is (= 1 (count (filter #(re-find #"^\d+\. " %) lines))))))
  (testing "a section where every database supports every feature has no table"
    (is (= "## SQL\n\nMetabase supports these features on every database on this page:\n\n- Variables"
           (#'driver-feature-dox/section-markdown "SQL" ["PostgreSQL" "MySQL"]
                                                  [{:row   {:feature :native-parameters :label "Variables"}
                                                    :cells [{:support :yes} {:support :yes}]}])))))
