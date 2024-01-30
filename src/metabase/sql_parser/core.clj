(ns metabase.sql-parser.core
  (:import
   (net.sf.jsqlparser.expression
    DoubleValue
    NullValue
    LongValue
    StringValue
    Parenthesis
    NotExpression
    BinaryExpression)
   (net.sf.jsqlparser.expression.operators.relational
    Between
    ExistsExpression
    IsBooleanExpression
    InExpression
    IsNullExpression)
   (net.sf.jsqlparser.parser
    CCJSqlParserUtil)
   (net.sf.jsqlparser.schema
    Column
    Table)
   (net.sf.jsqlparser.statement.select
    AllColumns
    AllTableColumns
    Select
    SelectItem
    ParenthesedSelect
    PlainSelect)))

(set! *warn-on-reflection* true)

(defmulti query->tables
  "Given a parsed query, return a sequence of tables that it references."
  class)

(defmethod query->tables PlainSelect
  [^PlainSelect parsed-select]
  (concat
   (query->tables (.getFromItem parsed-select))
   ;; more is needed (join?)
   ))

(defmethod query->tables Table
  [^Table table]
  [(.getFullyQualifiedName table)])

(defmulti query->columns
  "Given a parsed query, return a sequence of columns that it references."
  class)

(defmethod query->columns PlainSelect
  [^PlainSelect parsed-select]
  (concat
   (query->columns (.getSelectItems parsed-select))
   ;; more is needed
   ))

(defn parsed-query
  "Main entry point: takes a string query and returns an object that can be handled by TODO."
  [^String query]
  (CCJSqlParserUtil/parse query))

(defn resolve-columns
  "TODO: Make this use metadata we know about.
  TODO: If nil is a column (from a select *) then no need for the rest of the entries"
  [tables columns]
  (let [cartesian-product (for [table tables
                                column columns]
                            {:table table
                             :column column})]
    (update-vals (group-by :table cartesian-product)
                 #(merge-with concat (map :column %)))))

(resolve-columns ["core_user" "report_card"] ["name" "id" "email"])

(defn lineage
  "Returns a sequence of the columns used in / referenced by the query"
  [query]
  (let [parsed (parsed-query query)
        tables (query->tables parsed)
        columns (query->columns parsed)]
    (resolve-columns tables columns)))


;;;;;;;;;;;;;;;;;;;;;;;;;;;;

(comment
  (def s (parsed-query "select id, name from core_user where id > 10;"))
  s
  (AllTableColumns. ^Table (.getFromItem ^PlainSelect s))
  (.getSelectItems s)

  (.getFromItem (parsed-query "select * from (select id from core_user)"))



  (.getName (.getRightItem (first (.getJoins (query->parse-tree "select u.email, c.name from core_user u join report_card c on u.id = c.creator_id;")))))
  (.getOnExpression (first (.getJoins (query->parse-tree "select u.email, c.name from core_user u join report_card c on u.id = c.creator_id;")))))
;; ^ this one is awkward (returns an Expression); have to set up a visitor to fish out the column names


(defn right-tables? [actual expected]
  (assert (= (query->tables (parsed-query actual)) expected) (format "Expected %s but got %s" expected actual))
  (println "OK"))

(right-tables? "select * from core_user;" ["core_user"])
(right-tables? "select * from (select distinct id from core_user) q;" ["core_user"])


;; there are ambiguous statements:
;; select name from core_user, report_card;
;; best hope is to get all the columns referenced, all the tables referenced, and then take the most pessimistic choice.
;; I.e., that results in {:tables [core_user, report_card] :columns [name]} which results in [{:table core_user :column name}, {:table report_card, :column name}].
;; we could use existing metadata to pare this down semi-reasonably1
