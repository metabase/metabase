(ns metabase-enterprise.table-remapping.core
  "API namespace for the `table-remapping` module.

   Table remapping lets a caller run a query with certain table references redirected to
   other tables, without touching the query itself. Wrap the QP call in
   [[with-table-remapping]]:

     (table-remapping/with-table-remapping [{:from-schema \"public\" :from-table \"orders\"
                                             :to-schema   \"ws_123\" :to-table   \"orders_copy\"}]
       (qp/process-query query))

   The remappings are applied by QP middleware (see
   [[metabase-enterprise.table-remapping.middleware]]): MBQL queries get their table
   metadata overridden before compilation, and compiled/native SQL is rewritten via SQL
   parsing as the authoritative final step. Remapping fails closed — if the SQL cannot be
   parsed, the query throws instead of running un-remapped."
  (:require
   [metabase-enterprise.table-remapping.middleware :as table-remapping.middleware]
   [metabase.util.malli :as mu]))

(mu/defn do-with-table-remapping
  "Impl for [[with-table-remapping]]."
  [remappings :- ::table-remapping.middleware/remappings
   thunk      :- fn?]
  (binding [table-remapping.middleware/*remappings* remappings]
    (thunk)))

(defmacro with-table-remapping
  "Run `body` with QP table remapping enabled. `remappings` is a sequence of maps, each with
   `:from-schema`, `:from-table`, `:to-schema`, and `:to-table` (schemas may be nil/absent
   for schema-less tables). Every query executed within `body` (on this thread) has
   references to each from-side table redirected to the corresponding to-side table."
  {:style/indent 1}
  [remappings & body]
  `(do-with-table-remapping ~remappings (fn [] ~@body)))
