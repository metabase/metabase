(ns metabase-enterprise.transform-optimizer.prelude-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer [deftest is testing]]
   [metabase-enterprise.transform-optimizer.prelude :as prelude]))

(set! *warn-on-reflection* true)

(deftest prelude-resource-loads-test
  (let [text (prelude/prelude)]
    (testing "prelude resource is present on the classpath"
      (is (string? text))
      (is (pos? (count text))))))

(deftest prelude-anchors-test
  ;; Lightweight content checks: if these strings disappear from the prelude,
  ;; the LLM is being asked to do something different than what the scoring
  ;; rubric / validator expect. Update both the prelude and these anchors
  ;; together.
  (let [text (str/lower-case (prelude/prelude))]
    (testing "output schema anchors"
      (is (str/includes? text "summary"))
      (is (str/includes? text "proposals"))
      (is (str/includes? text "ddl_statements"))
      (is (str/includes? text "depends_on")))

    (testing "all proposal kinds are described"
      ;; One change per proposal — `rewrite+index` is intentionally gone.
      (doseq [kind ["rewrite" "index" "precompute"]]
        (is (str/includes? text kind)
            (str "missing kind: " kind))))
    (testing "rewrite+index is explicitly NOT a valid kind"
      (is (not (str/includes? text "\"rewrite+index\""))))

    (testing "severity rubric is in the prompt"
      (is (str/includes? text "severity"))
      (is (str/includes? text "high"))
      (is (str/includes? text "medium"))
      (is (str/includes? text "low")))

    (testing "DDL constraints are present"
      (is (str/includes? text "create index"))
      (is (str/includes? text "if not exists"))
      (is (str/includes? text "concurrently")))

    (testing "equivalence pitfalls section is present (lessons from prior verifier diffs)"
      (is (str/includes? text "equivalence pitfalls"))
      (testing "NULL-safety footgun is documented"
        (is (str/includes? text "not in"))
        (is (str/includes? text "not null")
            "the NOT-IN-on-nullable rewrite precondition must be explicit"))
      (testing "multi-aggregate rollup footgun is documented"
        (is (or (str/includes? text "array_agg")
                (str/includes? text "full outer join"))))
      (testing "type-compatibility note is present"
        (is (or (str/includes? text "::bigint")
                (str/includes? text "type compat"))))
      (testing "scale-dependent LATERAL caveat is documented"
        (is (str/includes? text "lateral"))))))

(deftest prelude-cached-test
  (testing "successive calls return the same string instance (delayed cache)"
    (is (identical? (prelude/prelude) (prelude/prelude)))))
