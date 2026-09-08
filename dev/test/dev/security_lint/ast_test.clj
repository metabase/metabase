(ns dev.security-lint.ast-test
  (:require
   [clojure.test :refer :all]
   [dev.security-lint.ast :as ast]
   [rewrite-clj.parser :as p]))

(defn- node [s] (p/parse-string s))

(deftest head-sym-test
  (testing "returns the head symbol of a call form"
    (is (= 'shell/sh (ast/head-sym (node "(shell/sh \"ls\")"))))
    (is (= 'str (ast/head-sym (node "(str a b)")))))
  (testing "nil for non-calls"
    (is (nil? (ast/head-sym (node "[1 2 3]"))))
    (is (nil? (ast/head-sym (node "\"a string\""))))))

(deftest args-test
  (testing "returns argument nodes, excluding head and whitespace"
    (is (= ["\"bash\"" "\"-c\"" "x"]
           (map ast/->str (ast/args (node "(shell/sh \"bash\" \"-c\" x)")))))
    (is (= [] (ast/args (node "(foo)")))))
  (testing "handles newlines and comments between args"
    (is (= ["1" "2"] (map ast/->str (ast/args (node "(f 1\n  ;; comment\n  2)")))))))

(deftest literal-test
  (testing "string literals"
    (is (true? (ast/literal-string? (node "\"hello\""))))
    (is (false? (ast/literal-string? (node "x"))))
    (is (false? (ast/literal-string? (node "(str \"a\")")))))
  (testing "literal? covers strings, numbers, keywords, booleans, nil"
    (is (every? #(ast/literal? (node %)) ["\"s\"" "42" ":kw" "true" "nil"]))
    (is (not (ast/literal? (node "x"))))
    (is (not (ast/literal? (node "(f)"))))))

(deftest dynamic-string-test
  (testing "a (str ...) with a non-literal part is dynamic"
    (is (true? (ast/dynamic-string? (node "(str \"ls \" user-input)")))))
  (testing "a (str ...) of only literals is not dynamic"
    (is (false? (ast/dynamic-string? (node "(str \"a\" \"b\")")))))
  (testing "format with non-literal args is dynamic"
    (is (true? (ast/dynamic-string? (node "(format \"select %s\" tbl)")))))
  (testing "plain literals and plain symbols are not dynamic strings"
    (is (false? (ast/dynamic-string? (node "\"static\""))))
    (is (false? (ast/dynamic-string? (node "x")))))
  (testing "nested interpolation is detected"
    (is (true? (ast/dynamic-string? (node "(str \"a\" (format \"%s\" x))"))))))

(deftest map-helpers-test
  (testing "map-entries pairs keys with values, skipping whitespace"
    (is (= [[":a" "1"] [":b" "2"]]
           (map (fn [[k v]] [(ast/->str k) (ast/->str v)])
                (ast/map-entries (node "{:a 1\n :b 2}"))))))
  (testing "map-get finds a value by keyword key"
    (is (= "true" (ast/->str (ast/map-get (node "{:insecure? true :x 1}") :insecure?))))
    (is (nil? (ast/map-get (node "{:x 1}") :insecure?)))
    (is (nil? (ast/map-get (node "[:not :a :map]") :x))))
  (testing "map-node? distinguishes maps"
    (is (true? (ast/map-node? (node "{:a 1}"))))
    (is (false? (ast/map-node? (node "[:a 1]"))))))

(deftest kwargs-test
  (testing "collects trailing keyword options from a macro form"
    (let [kw (ast/kwargs (ast/args (node "(defsetting my-thing \"doc\" :visibility :public :encryption :no)")))]
      (is (= #{:visibility :encryption} (set (keys kw))))
      (is (= ":public" (ast/->str (:visibility kw))))
      (is (= ":no" (ast/->str (:encryption kw))))))
  (testing "ignores positional arguments before the options"
    (is (= {} (ast/kwargs (ast/args (node "(defsetting my-thing \"doc\")"))))))
  (testing "a dangling keyword with no value is dropped rather than exploding"
    (is (= [:a] (keys (ast/kwargs (ast/args (node "(f :a 1 :b)"))))))))

(deftest truthy-literal-test
  (is (true? (ast/truthy-literal? (node "true"))))
  (is (false? (ast/truthy-literal? (node "false"))))
  (is (false? (ast/truthy-literal? (node "x")))))

(deftest predicates-tolerate-nil-test
  (testing "every node predicate answers false for nil instead of throwing"
    (doseq [f [ast/call? ast/map-node? ast/vector-node? ast/keyword-node? ast/symbol-node?
               ast/literal? ast/literal-string? ast/truthy-literal? ast/dynamic-string?]]
      (is (not (f nil))))
    (is (nil? (ast/string-value nil)))
    (is (nil? (ast/head-sym nil)))
    (is (= [] (ast/args nil)))
    (is (nil? (ast/unmeta nil)))))

(deftest dead-code-test
  (testing "a #_ form is not an argument"
    (is (= ["b"] (map ast/->str (ast/args (node "(f #_a b)"))))))
  (testing "find-nodes does not look inside #_, comment, or quoted forms"
    (let [calls (map ast/->str (ast/find-nodes ast/call? (node "(do #_(dead) (comment (dead)) '(dead) (live))")))]
      (is (= ["(do #_(dead) (comment (dead)) '(dead) (live))" "(live)"] calls)))))

(deftest normalized-text-test
  (testing "formatting does not change the text"
    (is (= (ast/normalized-text (node "(f a\n   b ; c\n  [1,2] {:k v})"))
           (ast/normalized-text (node "(f a b [1 2] {:k v})")))))
  (testing "dead code does not either"
    (is (= (ast/normalized-text (node "(f #_x a)")) (ast/normalized-text (node "(f a)")))))
  (testing "a different form is different text"
    (is (not= (ast/normalized-text (node "(f a b)")) (ast/normalized-text (node "(f a c)")))))
  (testing "strings keep their spacing, and metadata and reader forms survive"
    (is (= "(f \"a  b\")" (ast/normalized-text (node "(f  \"a  b\"  )"))))
    (is (= "(f ^:x #'g @h #(inc %))" (ast/normalized-text (node "(f ^:x  #'g  @h  #(inc %))"))))))

(deftest fn-literal-is-a-call-test
  (testing "#(f %) is a call to f as far as a rule is concerned"
    (is (true? (ast/call? (node "#(f % 1)"))))
    (is (= 'f (ast/head-sym (node "#(f % 1)"))))
    (is (= ["%" "1"] (map ast/->str (ast/args (node "#(f % 1)")))))))
