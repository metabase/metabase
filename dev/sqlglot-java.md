# Java SQLGlot backend

`MB_SQL_TOOLS_PARSER_BACKEND=sqlglot-java` runs the sqlglot parsing on the Java port
(`com.metabase/sqlglot-core`) instead of GraalPy; the values are listed in
`metabase.sql-tools.settings`. The setting value and parser key `:sqlglot` mean GraalPy,
`:sqlglot-java` the Java port. `metabase.sql-parsing.sqlglot-java` ports
`resources/python-sources/sql_tools.py` to Clojure, one namespace per section of the Python
file under `src/metabase/sql_parsing/sqlglot_java/`.

To compare the backends in a REPL, ask for each parser explicitly:

```clojure
(require '[metabase.sql-parsing.core :as sql-parsing])
(sql-parsing/referenced-tables (sql-parsing/parser :sqlglot-java) "postgres" "SELECT * FROM orders")
(sql-parsing/referenced-tables (sql-parsing/parser :sqlglot) "postgres" "SELECT * FROM orders")
```

or go through sql-tools with the test-only override, which leaves the stored setting alone:

```clojure
(require '[metabase.sql-tools.settings :as settings]
         '[metabase.sql-tools.core :as sql-tools])
(binding [settings/*parser-backend-override* :sqlglot-java]
  (sql-tools/simple-query? "SELECT id FROM orders"))
```

Where the port differs from upstream sqlglot, the fix belongs in the port, not here.
