(ns metabase.sql-tools.test-util
  "Utilities for testing sql-tools with multiple parser backends.

   Use [[test-parser-backends]] to run tests against both :macaw and :sqlglot:

     (deftest my-test
       (test-parser-backends
         (is (= expected (sql-tools/validate-query ...)))))

   Set MB_SQL_TOOLS_PARSER_BACKEND to run just one backend:

     MB_SQL_TOOLS_PARSER_BACKEND=macaw bin/mage run-tests ..."
  (:require
   [clojure.test :as t]
   [colorize.core :as colorize]
   [environ.core :as env]
   [metabase.sql-tools.settings :as sql-tools.settings]))

(def ^:private all-backends [:macaw :sqlglot])

(defn parser-backends-to-test
  "Returns [[all-backends]], or just the one specified by MB_SQL_TOOLS_PARSER_BACKEND."
  []
  (if-let [explicit (env/env :mb-sql-tools-parser-backend)]
    [(keyword explicit)]
    all-backends))

(defmacro test-parser-backends
  "Run body against both parser backends (or just one if env var is set)."
  {:style/indent 0}
  [& body]
  `(doseq [backend# (parser-backends-to-test)]
     (t/testing (colorize/magenta (name backend#))
       (binding [sql-tools.settings/*parser-backend-override* backend#]
         ~@body))))
