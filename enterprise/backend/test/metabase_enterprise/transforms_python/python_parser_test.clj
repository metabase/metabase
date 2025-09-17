(ns metabase-enterprise.transforms-python.python-parser-test
  "Tests for Python function parsing functionality."
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.transforms-python.python-parser :as python-parser]))

(set! *warn-on-reflection* true)

(deftest ^:parallel extract-functions-simple-test
  (testing "Function parsing with regex - parses simple function"
    (let [source    "def hello():\n    return 'world'"
          functions (python-parser/extract-functions-from-source source)]
      (is (= 1 (count functions)))
      (is (= "hello" (:name (first functions))))
      (is (= [] (:arguments (first functions)))))))

(deftest ^:parallel extract-functions-docstring-test
  (testing "Function parsing with regex - parses function with docstring"
    (let [source    "def greet():\n    \"\"\"Say hello\"\"\"    \n    return 'hello'"
          functions (python-parser/extract-functions-from-source source)]
      (is (= 1 (count functions)))
      (is (= "greet" (:name (first functions))))
      (is (= "Say hello" (:docstring (first functions)))))))

(deftest ^:parallel extract-functions-arguments-test
  (testing "Function parsing with regex - parses function with arguments"
    (let [source    "def add(x, y: int):\n    return x + y"
          functions (python-parser/extract-functions-from-source source)]
      (is (= 1 (count functions)))
      (let [func (first functions)
            args (:arguments func)]
        (is (= "add" (:name func)))
        (is (= 2 (count args)))
        (is (= {:name "x"} (nth args 0)))
        (is (= {:name "y" :type "int"} (nth args 1)))))))

(deftest ^:parallel extract-functions-varargs-test
  (testing "Function parsing with regex - parses function with varargs and kwargs"
    (let [source    "def flexible(*args, **kwargs):\n    pass"
          functions (python-parser/extract-functions-from-source source)]
      (is (= 1 (count functions)))
      (let [func (first functions)
            args (:arguments func)]
        (is (= "flexible" (:name func)))
        (is (= 2 (count args)))
        (is (= {:name "args" :varargs? true} (nth args 0)))
        (is (= {:name "kwargs" :kwargs? true} (nth args 1)))))))

(deftest ^:parallel extract-functions-malformed-test
  (testing "Function parsing with regex - ignores malformed functions"
    (let [source    "def broken(\n    incomplete\ndef good():\n    return 42"
          functions (python-parser/extract-functions-from-source source)]
      (is (= 1 (count functions)))
      (is (= "good" (:name (first functions)))))))

(deftest ^:parallel extract-functions-empty-test
  (testing "Function parsing with regex - handles empty source"
    (let [functions (python-parser/extract-functions-from-source "")]
      (is (= [] functions)))
    (let [functions (python-parser/extract-functions-from-source nil)]
      (is (= [] functions)))))

(deftest ^:parallel extract-functions-nested-test
  (testing "Function parsing with regex - ignores nested functions and classes"
    (let [source    "def outer_function():
    \"\"\"Top level function\"\"\"
    def nested_function():
        \"\"\"This should be ignored\"\"\"
        return 'nested'
    return 'outer'

class MyClass:
    \"\"\"This class should be ignored\"\"\"
    def method(self):
        \"\"\"This method should be ignored\"\"\"
        return 'method'

def another_top_level():
    \"\"\"Another top level function\"\"\"
    class NestedClass:
        def nested_method(self):
            return 'nested method'
    return 'top level'
"
          functions (python-parser/extract-functions-from-source source)]
      (is (= 2 (count functions)) "Should only find top-level functions")
      (let [func-names (set (map :name functions))]
        (is (contains? func-names "outer_function"))
        (is (contains? func-names "another_top_level"))
        (is (not (contains? func-names "nested_function")))
        (is (not (contains? func-names "method")))
        (is (not (contains? func-names "nested_method")))))))

(deftest ^:parallel extract-functions-complex-types-test
  (testing "Function parsing with regex - handles functions with complex type annotations"
    (let [source    "def complex_types(items: List[Dict[str, int]], callback: Callable[[str], bool] = None) -> Optional[Tuple[str, int]]:
    \"\"\"Function with complex type annotations\"\"\"
    return None
"
          functions (python-parser/extract-functions-from-source source)]
      (is (= 1 (count functions)))
      (let [func (first functions)
            args (:arguments func)]
        (is (= "complex_types" (:name func)))
        (is (= "Function with complex type annotations" (:docstring func)))
        (is (= 2 (count args)))
        (is (= {:name "items" :type "List[Dict[str, int]]"} (nth args 0)))
        (is (= {:name "callback" :type "Callable[[str], bool] = None"} (nth args 1)))))))