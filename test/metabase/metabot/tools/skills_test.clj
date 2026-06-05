(ns metabase.metabot.tools.skills-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer [deftest is testing]]
   [metabase.metabot.tools.skills :as tools.skills]))

(set! *warn-on-reflection* true)

(deftest ^:parallel load-skill-tool-metadata-test
  (testing "the tool var carries the metadata profiles require"
    (let [m (meta #'tools.skills/load-skill-tool)]
      (is (= "load_skill" (:tool-name m)))
      (is (some? (:schema m))))))

(deftest ^:parallel load-skill-returns-body-test
  (testing "loading a known skill returns its body wrapped in a <skill> tag"
    (let [out (:output (tools.skills/load-skill-tool {:ids ["construct-notebook-query-operators"]}))]
      (is (str/includes? out "<skill id=\"construct-notebook-query-operators\">"))
      (is (str/includes? out "</skill>"))
      (is (str/includes? out "Aggregations")))))

(deftest ^:parallel load-skill-multiple-test
  (testing "multiple ids are concatenated"
    (let [out (:output (tools.skills/load-skill-tool
                        {:ids ["construct-notebook-query-core" "read-resource"]}))]
      (is (str/includes? out "<skill id=\"construct-notebook-query-core\">"))
      (is (str/includes? out "<skill id=\"read-resource\">")))))

(deftest ^:parallel load-skill-unknown-test
  (testing "an unknown id yields an inline message, not an exception"
    (let [out (:output (tools.skills/load-skill-tool {:ids ["does-not-exist"]}))]
      (is (str/includes? out "Unknown skill"))
      (is (str/includes? out "does-not-exist")))))
