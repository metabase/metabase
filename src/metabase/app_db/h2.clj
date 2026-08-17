(ns metabase.app-db.h2
  "Single home for the H2-specific values and adapters referenced from otherwise-H2-free app-db code.")

(def statement-was-canceled-error-code
  "Value of `org.h2.api.ErrorCode/STATEMENT_WAS_CANCELED`, inlined so callers can recognize an H2
  query cancelation without the H2 library on the classpath."
  57014)

(def jdbc-sql-syntax-error-exception-classname
  "Class name of H2's syntax-error exception, matched by name so callers need not import the class."
  "org.h2.jdbc.JdbcSQLSyntaxErrorException")
