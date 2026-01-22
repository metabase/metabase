Included is a shim api for calling. Populate the rest with things like:

```shell
❯ uv pip install sqlglot --target python-sources --no-compile
Using CPython 3.13.5
Resolved 1 package in 223ms
Installed 1 package in 8ms
 + sqlglot==28.6.0
```

Then you do do things like:

```clojure
❯ clj
Clojure 1.12.3
user=> (doto 'metabase.driver.sql.sqlglot require in-ns)
Reflection warning, metabase/driver/sql/sqlglot.clj:34:3 - call to method eval can't be resolved (target class is unknown).
Reflection warning, metabase/driver/sql/sqlglot.clj:37:20 - call to method eval can't be resolved (target class is unknown).
Reflection warning, metabase/driver/sql/sqlglot.clj:41:5 - call to method execute can't be resolved (target class is unknown).
Reflection warning, metabase/driver/sql/sqlglot.clj:61:13 - reference to field hasIteratorNext on org.graalvm.polyglot.Value can't be resolved.
Reflection warning, metabase/driver/sql/sqlglot.clj:62:23 - reference to field getIteratorNext on org.graalvm.polyglot.Value can't be resolved.
Reflection warning, metabase/driver/sql/sqlglot.clj:64:30 - call to method getArrayElement can't be resolved (target class is unknown).
Reflection warning, metabase/driver/sql/sqlglot.clj:64:19 - reference to field asString can't be resolved.
Reflection warning, metabase/driver/sql/sqlglot.clj:65:36 - call to method getArrayElement can't be resolved (target class is unknown).
metabase.driver.sql.sqlglot
metabase.driver.sql.sqlglot=> (json/parse-string (.asString  (analyze-sql @interpreter "SELECT id FROM users")) true)
{:tables_source ["users"], :tables_all ["users"], :columns ["id"], :projections ["id"], :ast {:type "Select", :args {:kind nil, :hint nil, :distinct nil, :expressions [{:type "Column", :args {:this {:type "Identifier", :args {:this "id", :quoted false}}}}], :limit nil, :operation_modifiers nil, :from_ {:type "From", :args {:this {:type "Table", :args {:this {:type "Identifier", :args {:this "users", :quoted false}}, :db nil, :catalog nil}}}}}}}
metabase.driver.sql.sqlglot=> (clojure.pprint/pp)
{:tables_source ["users"],
 :tables_all ["users"],
 :columns ["id"],
 :projections ["id"],
 :ast
 {:type "Select",
  :args
  {:kind nil,
   :hint nil,
   :distinct nil,
   :expressions
   [{:type "Column",
     :args
     {:this {:type "Identifier", :args {:this "id", :quoted false}}}}],
   :limit nil,
   :operation_modifiers nil,
   :from_
   {:type "From",
    :args
    {:this
     {:type "Table",
      :args
      {:this
       {:type "Identifier", :args {:this "users", :quoted false}},
       :db nil,
       :catalog nil}}}}}}}
nil
```
