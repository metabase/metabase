(ns metabase.python-runner.api-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.python-runner.api :as python-runner.api]
   [metabase.test :as mt]))

(set! *warn-on-reflection* true)

(deftest execute-python-code-test
  (testing "execute-python-code function"
    (testing "executes Python code and returns output from temp file"
      (let [result (#'python-runner.api/execute-python-code "import os; open(os.environ['OUTPUT_FILE'], 'w').write('Hello from Python!')")]
        (is (= {:output "Hello from Python!"
                :stdout ""
                :stderr ""}
               result))))

    (testing "captures stdout from print statements"
      (let [result (#'python-runner.api/execute-python-code "print('Hello stdout!')")]
        (is (= {:output ""
                :stdout "Hello stdout!\n"
                :stderr ""}
               result))))

    (testing "captures stderr from error output"
      (let [result (#'python-runner.api/execute-python-code "import sys; print('Error message', file=sys.stderr)")]
        (is (= {:output ""
                :stdout ""
                :stderr "Error message\n"}
               result))))

    (testing "handles syntax errors gracefully"
      (let [result (#'python-runner.api/execute-python-code "invalid python syntax $$")]
        (is (= {:exit-code 1
                :error     "Execution failed: "
                :stdout    ""
                :stderr    "  File \"/sandbox/script.py\", line 1\n    invalid python syntax $$\n            ^^^^^^\nSyntaxError: invalid syntax\n"}
               result))))

    (testing "can write to output file and print to stdout simultaneously"
      (let [result (#'python-runner.api/execute-python-code "import os; print('Stdout message'); open(os.environ['OUTPUT_FILE'], 'w').write('File output')")]
        (is (= {:output "File output"
                :stdout "Stdout message\n"
                :stderr ""}
               result))))))
