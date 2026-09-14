(ns hooks.metabase.prose-interpolation-test
  (:require
   [clj-kondo.hooks-api :as hooks]
   [clj-kondo.impl.utils]
   [clojure.test :refer :all]
   [hooks.metabase.prose-interpolation :as prose-interpolation]))

(defn- findings
  "Run `hook-fn` over `form` with the linter at `level`; return the findings' messages."
  ([hook-fn form]
   (findings hook-fn form :warning))
  ([hook-fn form level]
   (let [config {:linters {:metabase/unquoted-prose-interpolation {:level level}}}]
     (binding [clj-kondo.impl.utils/*ctx* {:config     config
                                           :ignores    (atom nil)
                                           :findings   (atom [])
                                           :namespaces (atom {})}]
       (let [input  {:node   (hooks/parse-string (pr-str form))
                     :ns     'metabase.mcp.v2.tools.browse
                     :config config}
             output (hook-fn input)]
         (is (identical? (:node input) (:node output))
             "the hook must return the node unchanged so Kondo's normal analysis still runs")
         (mapv :message @(:findings clj-kondo.impl.utils/*ctx*)))))))

(deftest ^:parallel format-test
  (testing "GHY-4544: a %s argument that isn't quoted is flagged"
    (is (=? [#"`table-name`.*pr-str.*"]
            (findings prose-interpolation/lint-format '(format "%s: %d of %d fields" table-name n total)))))
  (testing "quoted, literal, and non-%s arguments are fine"
    (is (empty? (findings prose-interpolation/lint-format '(format "Schema %s not found in database %d" (pr-str schema) db-id))))
    (is (empty? (findings prose-interpolation/lint-format '(format "%s and %s" "literal" :keyword))))
    (is (empty? (findings prose-interpolation/lint-format '(format "Returned %d of %,d (%.1f%%)%n" a b c)))))
  (testing "each unquoted %s argument is its own finding"
    (is (=? [#"`a`.*" #"`b`.*"]
            (findings prose-interpolation/lint-format '(format "%s then %s" a b)))))
  (testing "explicit argument indexes are followed"
    (is (=? [#"`b`.*"]
            (findings prose-interpolation/lint-format '(format "%2$s before %1$s" (pr-str a) b)))))
  (testing "a list joined over pr-str'd items counts as quoted"
    (is (empty? (findings prose-interpolation/lint-format '(format "Available: %s." (str/join ", " (map pr-str cols))))))
    (is (empty? (findings prose-interpolation/lint-format '(format "Available: %s." (->> cols (map pr-str) (str/join ", ")))))))
  (testing "a list joined over raw items is flagged"
    (is (=? [#".*pr-str.*"]
            (findings prose-interpolation/lint-format '(format "Available: %s." (str/join ", " (map :name cols)))))))
  (testing "a format string that isn't a literal can't be checked, so it is flagged"
    (is (=? [#".*literal.*"]
            (findings prose-interpolation/lint-format '(format template x))))))

(deftest ^:parallel str-test
  (testing "GHY-4544: an unquoted value concatenated onto prose is flagged"
    (is (=? [#"`\(:error result\)`.*pr-str.*"]
            (findings prose-interpolation/lint-str '(str "Query failed: " (:error result))))))
  (testing "quoted values are fine"
    (is (empty? (findings prose-interpolation/lint-str '(str "Query failed: " (pr-str (:error result)))))))
  (testing "concatenation without a prose literal isn't prose"
    (is (empty? (findings prose-interpolation/lint-str '(str "\n" message))))
    (is (empty? (findings prose-interpolation/lint-str '(str "card__" card-id))))
    (is (empty? (findings prose-interpolation/lint-str '(str a b))))))

(deftest ^:parallel i18n-test
  (testing "GHY-4544: an unquoted placeholder argument is flagged"
    (is (=? [#".*pr-str.*"]
            (findings prose-interpolation/lint-i18n
                      '(tru "No column named {0}. Available column names: {1}."
                            (pr-str (nth bad 2))
                            (str/join ", " (map :name cols)))))))
  (testing "quoted placeholder arguments are fine"
    (is (empty? (findings prose-interpolation/lint-i18n '(tru "Table {0} not found" (pr-str table-name))))))
  (testing "a format string split across str literals is still checked"
    (is (=? [#"`x`.*"]
            (findings prose-interpolation/lint-i18n '(deferred-tru (str "Value " "{0}") x))))))

(deftest ^:parallel disabled-outside-scope-test
  (testing "nothing is reported when the linter is off for the namespace"
    (is (empty? (findings prose-interpolation/lint-format '(format "%s" x) :off)))
    (is (empty? (findings prose-interpolation/lint-str '(str "Query failed: " x) :off)))
    (is (empty? (findings prose-interpolation/lint-i18n '(tru "Value {0}" x) :off)))))
