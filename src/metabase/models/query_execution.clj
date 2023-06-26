(ns metabase.models.query-execution
  "QueryExecution is a log of very time a query is executed, and other information such as the User who executed it, run
  time, context it was executed in, etc."
  (:require
   [metabase.mbql.schema :as mbql.s]
   [metabase.models.interface :as mi]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [methodical.core :as methodical]
   [schema.core :as s]
   [toucan2.core :as t2]))

(def QueryExecution
  "Used to be the toucan1 model name defined using [[toucan.models/defmodel]], not it's a reference to the toucan2 model name.
  We'll keep this till we replace all these symbols in our codebase."
  :model/QueryExecution)

(methodical/defmethod t2/table-name :model/QueryExecution [_model] :query_execution)

(derive :model/QueryExecution :metabase/model)

(t2/deftransforms :model/QueryExecution
  {:json_query mi/transform-json
   :status     mi/transform-keyword
   :context    mi/transform-keyword})

(def ^:private ^{:arglists '([context])} validate-context
  (s/validator mbql.s/Context))

(t2/define-before-insert :model/QueryExecution
  [{context :context, :as query-execution}]
  (u/prog1 query-execution
    (validate-context context)))

(t2/define-after-select :model/QueryExecution
  [{:keys [result_rows] :as query-execution}]
  ;; sadly we have 2 ways to reference the row count :(
  (assoc query-execution :row_count (or result_rows 0)))

(t2/define-before-update :model/QueryExecution
 [_query-execution]
 (throw (Exception. (tru "You cannot update a QueryExecution!"))))
