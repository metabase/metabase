(ns metabase-enterprise.transforms-python.library-completions-test
  "Tests for library completions functionality."
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.transforms-python.models.python-library :as python-library]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(deftest ^:parallel library-completions-permissions-test
  (testing "GET /api/ee/transforms-python/library-completions/:path requires superuser permissions"
    (mt/with-premium-features #{:transforms-python}
      (is (= "You don't have permissions to do that."
             (mt/user-http-request :rasta :get 403 "ee/transforms-python/library-completions/common"))))))

(deftest library-completions-empty-library-test
  (testing "GET /api/ee/transforms-python/library-completions/:path returns empty array when no library exists"
    (mt/with-premium-features #{:transforms-python}
      (t2/delete! :model/PythonLibrary)
      (is (= [] (mt/user-http-request :crowberto :get 200 "ee/transforms-python/library-completions/common"))))))

(deftest ^:parallel library-completions-invalid-path-test
  (testing "GET /api/ee/transforms-python/library-completions/:path rejects invalid paths"
    (mt/with-premium-features #{:transforms-python}
      (is (= "Invalid library path. Only 'common' is currently supported."
             (:message (mt/user-http-request :crowberto :get 400 "ee/transforms-python/library-completions/invalid-path")))))))

(deftest library-completions-malformed-python-test
  (testing "GET /api/ee/transforms-python/library-completions/:path handles malformed Python gracefully"
    (mt/with-premium-features #{:transforms-python}
      (t2/delete! :model/PythonLibrary)
      (python-library/update-python-library-source! "common"
                                                    "def broken_function(
                                                return 'incomplete'
                                            def valid_function():
                                                return 'works'
                                            ")
      (let [response (mt/user-http-request :crowberto :get 200 "ee/transforms-python/library-completions/common")]
        (is (= 1 (count response)) "Should find only the valid function")
        (is (= "valid_function" (:name (first response))))))))

(deftest library-completions-function-parsing-test
  (testing "GET /api/ee/transforms-python/library-completions/:path returns function completions for existing library"
    (mt/with-premium-features #{:transforms-python}
      (t2/delete! :model/PythonLibrary)
      (python-library/update-python-library-source!
       "common"
       "def simple_function():
   \"\"\"A simple function with no arguments.\"\"\"
   return 42

def function_with_args(x, y: int, z: str = 'default'):
   \"\"\"A function with typed and default arguments.\"\"\"
   return x + y

def function_with_varargs(*args, **kwargs):
   \"\"\"A function with varargs and kwargs.\"\"\"
   return len(args)

def complex_function(a: int, b: str, *args, c: float = 1.0, **kwargs) -> dict:
   \"\"\"A complex function with mixed argument types.\"\"\"
   return {'result': a + len(b)}
")
      (let [response (mt/user-http-request :crowberto :get 200 "ee/transforms-python/library-completions/common")]
        (is (= 4 (count response)) "Should find 4 functions")

        (let [simple-fn (first (filter #(= (:name %) "simple_function") response))]
          (is (= "simple_function" (:name simple-fn)))
          (is (= "A simple function with no arguments." (:docstring simple-fn)))
          (is (= [] (:arguments simple-fn))))

        (let [typed-fn (first (filter #(= (:name %) "function_with_args") response))]
          (is (= "function_with_args" (:name typed-fn)))
          (is (= "A function with typed and default arguments." (:docstring typed-fn)))
          (is (= 3 (count (:arguments typed-fn))))
          (let [args (:arguments typed-fn)]
            (is (= {:name "x"} (nth args 0)))
            (is (= {:name "y" :type "int"} (nth args 1)))
            (is (= {:name "z" :type "str = 'default'"} (nth args 2)))))

        (let [varargs-fn (first (filter #(= (:name %) "function_with_varargs") response))]
          (is (= "function_with_varargs" (:name varargs-fn)))
          (is (= "A function with varargs and kwargs." (:docstring varargs-fn)))
          (is (= 2 (count (:arguments varargs-fn))))
          (let [args (:arguments varargs-fn)]
            (is (= {:name "args" :varargs? true} (nth args 0)))
            (is (= {:name "kwargs" :kwargs? true} (nth args 1)))))

        (let [complex-fn (first (filter #(= (:name %) "complex_function") response))]
          (is (= "complex_function" (:name complex-fn)))
          (is (= "A complex function with mixed argument types." (:docstring complex-fn)))
          (is (= 5 (count (:arguments complex-fn))))
          (let [args (:arguments complex-fn)]
            (is (= {:name "a" :type "int"} (nth args 0)))
            (is (= {:name "b" :type "str"} (nth args 1)))
            (is (= {:name "args" :varargs? true} (nth args 2)))
            (is (= {:name "c" :type "float = 1.0"} (nth args 3)))
            (is (= {:name "kwargs" :kwargs? true} (nth args 4)))))))))

