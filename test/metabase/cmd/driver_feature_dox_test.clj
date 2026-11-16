(ns metabase.cmd.driver-feature-dox-test
  (:require
   [clojure.edn :as edn]
   [clojure.set :as set]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.cmd.driver-feature-dox :as driver-feature-dox]
   [metabase.driver :as driver]
   [metabase.lib.schema.metadata :as lib.schema.metadata]
   [metabase.util.malli.registry :as mr]))

(set! *warn-on-reflection* true)

(defn- config []
  (#'driver-feature-dox/config))

(defn- row-features
  "Every driver feature the page's rows name, with the vector rows flattened."
  [{:keys [sections]}]
  (for [{:keys [feature]} (mapcat :features sections)
        k                 (if (vector? feature) feature [feature])]
    k))

(defn- column
  "The `:drivers` entry labeled `label`."
  [label]
  (some #(when (= label (:label %)) %) (:drivers (config))))

(deftest ^:parallel every-feature-is-classified-test
  (let [{:keys [internal] :as cfg} (config)
        classified (concat (row-features cfg) internal)]
    ;; a new feature can't silently go missing, and a typo can't render a column of ❌: namespaced features skip the
    ;; dispatch check in `driver/database-supports?`, so an unknown one would quietly answer false
    (testing "the curated file classifies every driver feature, and names no other"
      (is (= (set driver/features) (set classified))
          (str "Add each new feature to a section of src/metabase/cmd/resources/driver-features.edn, or to its"
               " :internal set if the page shouldn't show it. Remove each feature that no longer exists.")))
    (testing "no feature is classified twice"
      (is (= [] (for [[k n] (frequencies classified) :when (> n 1)] k))))))

(defn- driver-modules
  "The driver of each module in `modules/drivers/deps.edn`, read as data so that the test doesn't need the driver
  modules on the classpath. A module is named for its driver: `metabase/bigquery-cloud-sdk` is `:bigquery-cloud-sdk`."
  []
  (into #{}
        (map (comp keyword name))
        (keys (:deps (edn/read-string (slurp "modules/drivers/deps.edn"))))))

(deftest ^:parallel every-driver-module-is-classified-test
  (let [{:keys [drivers excluded-drivers]} (config)
        modules (driver-modules)
        columns (set (map :driver drivers))]
    ;; a driver that ships can't silently go missing from the page
    (testing "every driver module is a column, or is excluded"
      (is (= #{} (set/difference modules columns excluded-drivers))
          (str "Add each new driver module to :drivers in src/metabase/cmd/resources/driver-features.edn, or to its"
               " :excluded-drivers set, with the reason, if the page shouldn't show it.")))
    (testing "every excluded driver is a module that isn't a column"
      (is (= #{} (set/difference excluded-drivers modules)))
      (is (= #{} (set/intersection excluded-drivers columns))))))

(deftest ^:parallel every-note-is-for-a-row-test
  (let [cfg (config)]
    (testing "every note is keyed by a feature row on the page"
      (let [row-keys (set (map :feature (mapcat :features (:sections cfg))))]
        (is (= #{} (into #{}
                         (comp (mapcat (comp keys :notes))
                               (remove row-keys))
                         (:drivers cfg))))))))

(deftest ^:parallel fake-database-test
  (testing "the fake databases are valid database metadata, which `mu/defmethod`s like SQL Server's validate"
    (doseq [{:keys [label] :as col} (:drivers (config))
            age                     [:newest :oldest]]
      (testing (str label " " age)
        (is (mr/validate ::lib.schema.metadata/database (#'driver-feature-dox/fake-database col age)))))))

(deftest ^:parallel support-test
  (testing "a feature that every version supports"
    (is (= :yes (#'driver-feature-dox/support (column "PostgreSQL") :left-join))))
  (testing "a feature that no version supports"
    (is (= :no (#'driver-feature-dox/support (column "MySQL") :full-join))))
  (testing "MariaDB uses the MySQL driver, but can answer differently"
    (is (= :yes (#'driver-feature-dox/support (column "MySQL") :regex/lookaheads-and-lookbehinds)))
    (is (= :no (#'driver-feature-dox/support (column "MariaDB") :regex/lookaheads-and-lookbehinds))))
  (testing "a vector row is supported when any of its features is"
    (is (= :yes (#'driver-feature-dox/support (column "PostgreSQL") [:nested-fields :nested-field-columns])))))

;;; abstract, so other tests' lists of available drivers can't see it; an abstract driver can't have a concrete parent
(driver/register! ::versioned, :abstract? true)

;;; a driver whose `:percentile-aggregations` depends on the version, as SQL Server's does
(defmethod driver/database-supports? [::versioned :percentile-aggregations]
  [_driver _feature db]
  (>= (get-in db [:dbms-version :semantic-version 0]) 2))

(deftest ^:parallel section-markdown-test
  (let [columns  [(column "PostgreSQL")
                  (column "MySQL")
                  {:driver ::versioned
                   :label  "Versioned"
                   :notes  {:percentile-aggregations "Versioned 2.0 and later."}}]
        section  {:title    "Aggregations"
                  :features [{:feature :full-join :label "Full outer join" :doc "join.md"}
                             {:feature :percentile-aggregations :label "Percentile"}]}
        markdown (#'driver-feature-dox/section-markdown section columns)
        lines    (str/split-lines markdown)]
    (testing "the section opens with its heading"
      (is (= "## Aggregations" (first lines))))
    (testing "a feature row links to its docs, and marks each database"
      (is (some #(re-find #"^\| \[Full outer join\]\(join\.md\) +\| ✅ +\| ❌ +\| ❌ +\|$" %) lines)))
    (testing "a version-dependent cell points to a numbered note below the table"
      (is (some #(re-find #"^\| Percentile +\| ✅ +\| ❌ +\| ✅ \(1\) +\|$" %) lines))
      (is (= "1. Versioned 2.0 and later." (last lines))))))
