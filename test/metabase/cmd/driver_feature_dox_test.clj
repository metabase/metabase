(ns metabase.cmd.driver-feature-dox-test
  (:require
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
    (testing "every driver feature is on the page or marked internal, so a new one can't silently go missing"
      (is (= #{} (into (sorted-set) (remove (set classified)) driver/features))
          (str "Add these features to a section of src/metabase/cmd/resources/driver-features.edn, or to its"
               " :internal set if the page shouldn't show them.")))
    (testing "no feature is classified twice"
      (is (= [] (for [[k n] (frequencies classified) :when (> n 1)] k))))))

(deftest ^:parallel every-curated-feature-exists-test
  (let [{:keys [internal] :as cfg} (config)]
    (testing "the curated file names only real features, so a typo can't render a column of ❌"
      ;; namespaced features skip the dispatch check in `driver/database-supports?`, so an unknown one would quietly
      ;; answer false
      (is (= #{} (into (sorted-set) (remove driver/features) (concat (row-features cfg) internal)))))
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
  (testing "MariaDB is the MySQL driver with another flavor, and answers like MariaDB"
    (is (= :yes (#'driver-feature-dox/support (column "MySQL") :regex/lookaheads-and-lookbehinds)))
    (is (= :no (#'driver-feature-dox/support (column "MariaDB") :regex/lookaheads-and-lookbehinds))))
  (testing "a vector row is supported when any of its features is"
    (is (= :yes (#'driver-feature-dox/support (column "PostgreSQL") [:nested-fields :nested-field-columns])))))

(driver/register! ::versioned, :parent :postgres)

;;; a PostgreSQL whose `:percentile-aggregations` depends on the version, as SQL Server's does
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
      (is (some #(re-find #"^\| \[Full outer join\]\(join\.md\) +\| ✅ +\| ❌ +\| ✅ +\|$" %) lines)))
    (testing "a version-dependent cell points to a numbered note below the table"
      (is (some #(re-find #"^\| Percentile +\| ✅ +\| ❌ +\| ✅ \(1\) +\|$" %) lines))
      (is (= "1. Versioned 2.0 and later." (last lines))))))
