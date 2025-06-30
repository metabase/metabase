(ns metabase.query-processor.middleware.remove-inactive-field-refs
  "This middleware exists to let queries run even if some database columns have been removed in the data warehouse.

  Queries that don't depend on removed columns (other than showing them) should run and show the available data.
  Queries that use removed fields otherwise, e.g., for filtering or summary will continue to fail.

  We only try to fix queries if we know a column has been removed. We recognize this during the next sync: deleted
  columns are marked active = false."
  (:require
   [metabase.lib.field.resolution :as lib.field.resolution]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.walk :as lib.walk]
   [metabase.util :as u]
   [metabase.util.malli :as mu]))

(mu/defn remove-inactive-field-refs :- ::lib.schema/query
  "Remove any references to fields that are not active.
  This might result in a broken query, but the original query would break at run time too because of the
  references to columns that do not exist in the database.
  This middleware can fix queries that contain references that are not used other than being returned.

  This function should be called after the point where the implicit :fields clauses are added to the query.
  We determine which direct database field references are referencing active fields and remove the others.
  Then we recursively remove references to the removed columns."
  [query :- ::lib.schema/query]
  (let [original-query query]
    (lib.walk/walk-stages
     query
     (fn [_query stage-path stage]
       (letfn [(resolve-field-ref [field-ref]
                 (when (= (first field-ref) :field)
                   ;; resolve metadata in the ORIGINAL query so removing fields upstream doesn't mess up our metadata
                   ;; resolution
                   (lib.walk/apply-f-for-stage-at-path lib.field.resolution/resolve-field-ref original-query stage-path field-ref)))
               (inactive-field-ref? [field-ref]
                 (when-let [col (resolve-field-ref field-ref)]
                   (false? (:active col))))
               (update-fields [fields]
                 (not-empty (into [] (remove inactive-field-ref?) fields)))]
         (if (empty? (:fields stage))
           stage
           (u/assoc-dissoc stage :fields (update-fields (:fields stage)))))))))
