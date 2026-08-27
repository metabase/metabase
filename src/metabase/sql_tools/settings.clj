(ns metabase.sql-tools.settings
  "Settings for the sql-tools module.

  ## Swapping Between Macaw and SQLGlot

  The SQL parser backend can be switched using the `MB_SQL_TOOLS_PARSER_BACKEND` env var:

  ```bash
  # Use SQLGlot (default)
  MB_SQL_TOOLS_PARSER_BACKEND=sqlglot

  # Use Macaw (legacy)
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
  #{:macaw :sqlglot})

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
