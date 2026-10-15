# Java SQLGlot backend

The existing `sql-tools-parser-backend` setting selects `sqlglot` (GraalPy, default),
`sqlglot-java` (Java port), or `macaw`. SQL-tools keeps its existing multimethod
interface. Both SQLGlot implementations share Metabase's driver mapping, metadata
resolution and result normalization, and implement the ten-method `SqlParser` protocol.

The Java port is `com.metabase/sqlglot-core` in `deps.edn`, from the
`metabase-maven-downloads` repository. `metabase.sql-parsing.sqlglot-java` ports
`resources/python-sources/sql_tools.py` to Clojure on top of it, one namespace per
section of the Python file under `src/metabase/sql_parsing/sqlglot_java/`.

```sh
MB_SQL_TOOLS_PARSER_BACKEND=sqlglot-java clojure -M:dev:run
```

Use `MB_SQL_TOOLS_PARSER_BACKEND=sqlglot` for Graal. In a running REPL, use the
existing override without changing the stored setting:

```clojure
(require '[metabase.sql-tools.settings :as settings]
         '[metabase.sql-tools.core :as sql-tools])
(binding [settings/*parser-backend-override* :sqlglot-java]
  (sql-tools/simple-query? "SELECT id FROM orders"))
(binding [settings/*parser-backend-override* :sqlglot]
  (sql-tools/simple-query? "SELECT id FROM orders"))
```

For direct protocol comparisons:

```clojure
(require '[metabase.sql-parsing.parser :as parser]
         '[metabase.sql-parsing.protocol :as protocol])
(protocol/referenced-tables (parser/parser :sqlglot-java) "postgres" "SELECT * FROM orders")
(protocol/referenced-tables (parser/parser :graalvm) "postgres" "SELECT * FROM orders")
```

Integration checks:

```clojure
(require 'metabase.sql-parsing.sqlglot-java-test)
(clojure.test/run-tests 'metabase.sql-parsing.sqlglot-java-test)
```

The port's AST stays inside `metabase.sql-parsing.sqlglot-java.*`. Every protocol
method returns strings, vectors and maps, and every failure is a `call-failed-ex`
named for the error Python would raise (`ParseError`, `OptimizeError`, ...).
`metabase.sql-parsing.sqlglot-java-test` fails if any other source file imports the
port, or if a result holds an AST node: code that read the AST outside the shim would
tie Metabase to the port's shape.

Where the port differs from upstream sqlglot, the fix belongs in the port, not here.
The shim works around two such gaps, each marked in its docstring: the port's
`validateQualifyColumns` omits the failing column's position, and its tokenizer types
a bare word `IDENTIFIER` (in sqlglot, a quoted identifier).

This is an opt-in backend; changing the default is a separate step.
