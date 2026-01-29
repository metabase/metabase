(ns metabase.lib.test-util.notebook-helpers
  "Test helpers meant to mimic the helpers the FE e2e tests use in
  `/home/cam/metabase/e2e/support/helpers/e2e-notebook-helpers.ts` so we can easily copy those tests."
  (:require
   #?@(:clj  ([mb.hawk.assert-exprs.approximately-equal :refer [=?-diff]])
       :cljs ([metabase.test-runner.assert-exprs.approximately-equal :refer [=?-diff]]))
   [medley.core :as m]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.metadata :as lib.schema.metadata]
   [metabase.util.malli :as mu]))

(defn match-display-info [query spec item]
  (let [spec (if (string? spec)
               {:display-name spec}
               spec)]
    (nil? (=?-diff spec (lib/display-info query item)))))

(defn find-table-with-spec [query table-spec]
  (let [tables     (lib.metadata/tables query)]
    (or (m/find-first #(match-display-info query table-spec %) tables)
        (throw (ex-info "Failed to find table" {:table-spec table-spec, :found (map #(lib/display-info query %) tables)})))))

(mu/defn find-col-with-spec :- ::lib.schema.metadata/column
  [query   :- ::lib.schema/query
   columns :- [:sequential {:min 1} ::lib.schema.metadata/column]
   group-spec
   column-spec]
  (let [groups      (or (not-empty (lib/group-columns columns))
                        (throw (ex-info "lib/group-columns unexpectedly returned no groups"
                                        {:columns columns})))
        group       (or (m/find-first #(match-display-info query group-spec %) groups)
                        (throw (ex-info "Failed to find column group"
                                        {:group-spec group-spec, :found (map #(lib/display-info query %) groups)})))]
    (or (m/find-first #(match-display-info query column-spec %) (lib/columns-group-columns group))
        (throw (ex-info "Failed to find column in group"
                        {:group       (lib/display-info query group)
                         :column-spec column-spec
                         :found       (map #(lib/display-info query %) (lib/columns-group-columns group))})))))

(mu/defn find-unique-col-with-spec :- ::lib.schema.metadata/column
  "Like [[find-col-with-spec]], but asserts that exactly one column matches the spec.
  Use this when the display name might be ambiguous and you want to catch that."
  [query   :- ::lib.schema/query
   columns :- [:sequential {:min 1} ::lib.schema.metadata/column]
   group-spec
   column-spec]
  (let [groups      (or (not-empty (lib/group-columns columns))
                        (throw (ex-info "lib/group-columns unexpectedly returned no groups"
                                        {:columns columns})))
        group       (or (m/find-first #(match-display-info query group-spec %) groups)
                        (throw (ex-info "Failed to find column group"
                                        {:group-spec group-spec, :found (map #(lib/display-info query %) groups)})))
        matches     (filter #(match-display-info query column-spec %) (lib/columns-group-columns group))]
    (case (count matches)
      0 (throw (ex-info "Failed to find column in group"
                        {:group       (lib/display-info query group)
                         :column-spec column-spec
                         :found       (map #(lib/display-info query %) (lib/columns-group-columns group))}))
      1 (first matches)
      (throw (ex-info "Found multiple columns matching spec (expected exactly one)"
                      {:group       (lib/display-info query group)
                       :column-spec column-spec
                       :matches     (map #(lib/display-info query %) matches)})))))

(defn add-join
  ([query rhs-table lhs-col rhs-col]
   (add-join query rhs-table lhs-col rhs-col nil))

  ([query
    rhs-table-spec
    lhs-col-spec
    rhs-col-spec
    {:keys [lhs-col-fn rhs-col-fn]
     :or   {lhs-col-fn identity
            rhs-col-fn identity}}]
   (let [rhs-table   (find-table-with-spec query rhs-table-spec)
         lhs-column  (lhs-col-fn (find-col-with-spec
                                  query
                                  (lib/join-condition-lhs-columns query rhs-table nil nil)
                                  {:is-main-group true}
                                  lhs-col-spec))
         rhs-column  (rhs-col-fn (find-col-with-spec
                                  query
                                  (lib/join-condition-rhs-columns query rhs-table (lib/ref lhs-column) nil)
                                  rhs-table-spec
                                  rhs-col-spec))
         join-clause (lib/join-clause rhs-table [(lib/= lhs-column rhs-column)])]
     (lib/join query join-clause))))

(defn add-breakout
  ([query column-spec]
   (add-breakout query {} column-spec))

  ([query group-spec column-spec]
   (add-breakout query group-spec column-spec {}))

  ([query group-spec column-spec {:keys [col-fn], :or {col-fn identity}}]
   (let [col (col-fn (find-col-with-spec query (lib/breakoutable-columns query) group-spec column-spec))]
     (lib/breakout query col))))

(defn add-order-by
  ([query column-spec]
   (add-order-by query {} column-spec))

  ([query group-spec column-spec]
   (add-order-by query group-spec column-spec {}))

  ([query group-spec column-spec {:keys [col-fn direction], :or {col-fn identity, direction :asc}}]
   (let [col (col-fn (find-col-with-spec query (lib/orderable-columns query) group-spec column-spec))]
     (lib/order-by query -1 col direction))))
