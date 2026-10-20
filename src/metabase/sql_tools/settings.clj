(ns metabase.sql-tools.settings
  "Settings for the sql-tools module.

  ## Choosing the SQL parser backend

  The SQL parser backend can be switched using the `MB_SQL_TOOLS_PARSER_BACKEND` env var:

  ```bash
  # SQLGlot on GraalPy (default)
  MB_SQL_TOOLS_PARSER_BACKEND=sqlglot

  # SQLGlot, Java port (opt-in)
  MB_SQL_TOOLS_PARSER_BACKEND=sqlglot-java

  # GraalPy answers; the Java port runs on the same SQL in the background and the results are compared
  MB_SQL_TOOLS_PARSER_BACKEND=sqlglot-shadow

  # The Java port answers; GraalPy runs in the background and the results are compared
  MB_SQL_TOOLS_PARSER_BACKEND=sqlglot-java-shadow

  # Macaw (legacy)
  MB_SQL_TOOLS_PARSER_BACKEND=macaw
  ```

  This is useful for:
  - Running tests with a specific backend:
    `MB_SQL_TOOLS_PARSER_BACKEND=macaw bin/mage run-tests :some/test-ns`
  - Debugging parsing differences between backends
  - Falling back to Macaw if SQLGlot has issues

  **Note**: This is an internal flag only, not exposed in public docs.
  Once SQLGlot is stable, this env var will be removed and Macaw deprecated."
  (:require
   [metabase.settings.core :as setting :refer [defsetting]]
   [metabase.util.i18n :refer [deferred-tru tru]]))

(def ^:private available-parser-backends
  #{:macaw :sqlglot :sqlglot-java :sqlglot-shadow :sqlglot-java-shadow})

#_{:clj-kondo/ignore [:metabase/discourage-dynamic-vars]}
(def ^:dynamic *parser-backend-override*
  "Dynamic var for overriding the parser backend in tests.
   When bound, [[current-parser-backend]] returns this instead of the setting."
  nil)

(defsetting sql-tools-parser-backend
  (deferred-tru "Parser backend of `sql-tools` module.")
  :visibility :internal
  :export? false
  :type :keyword
  :default :sqlglot
  :setter (fn [new-value]
            (or (available-parser-backends (keyword new-value))
                (throw (ex-info (tru "Invalid sql-tools parser backend.")
                                {:value (keyword new-value)
                                 :available available-parser-backends})))
            (setting/set-value-of-type! :keyword :sql-tools-parser-backend new-value)))

(defn current-parser-backend
  "Get the current parser backend. Checks [[*parser-backend-override*]] first,
   then falls back to the [[sql-tools-parser-backend]] setting."
  []
  (or *parser-backend-override*
      (sql-tools-parser-backend)))

(defsetting sql-tools-parser-shadow-sample-rate
  (deferred-tru "Share of calls, from 0.0 to 1.0, that a shadow parser backend also runs on its second parser.")
  :visibility :internal
  :export? false
  :type :double
  :default 1.0)
