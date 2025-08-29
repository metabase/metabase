(ns metabase.query-processor.middleware.resolve-joins
  "Middleware that fetches tables that will need to be joined, referred to by `:field` clauses with `:source-field`
  options, and adds information to the query about what joins should be done and how they should be performed."
  (:refer-clojure :exclude [alias])
  (:require
   [clojure.string :as str]
   [metabase.lib.core :as lib]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.join :as lib.schema.join]
   [metabase.lib.walk :as lib.walk]
   [metabase.util.malli :as mu]))

(mu/defn- resolve-join :- ::lib.schema.join/join
  [join  :- ::lib.schema.join/join]
  (merge
   join
   ;; this key is used just to tell [[metabase.lib.convert]] not to remove the default join alias e.g. `__join` upon
   ;; conversion back to legacy
   (when (str/starts-with? (:alias join) lib/legacy-default-join-alias)
     {:qp/keep-default-join-alias true})))

#_(mu/defn- add-join-fields-to-stage :- [:maybe ::lib.schema/stage]
  [query :- ::lib.schema/query
   path  :- ::lib.walk/path
   stage :- ::lib.schema/stage]
  (when (and (seq (:fields stage))
             (seq (:joins stage)))
    (let [stage-cols (lib.walk/apply-f-for-stage-at-path lib/returned-columns query path)]
      (assoc stage :fields (into []
                                 (comp (map lib/ref)
                                       (map (fn [a-ref]
                                              (cond-> a-ref
                                                ;; Any coercion or temporal bucketing will already have been done in
                                                ;; the subquery for the join itself. Mark the parent ref to make sure
                                                ;; it is not double-coerced, which leads to SQL errors.
                                                (lib/current-join-alias a-ref) (lib/update-options assoc :qp/ignore-coercion true)))))
                                 stage-cols)))))

(mu/defn ^:deprecated resolve-joins :- ::lib.schema/query
  "* Replace `:fields :all` inside joins with a sequence of field refs

  * Add default values for `:strategy`

  * Add join fields to parent stage `:fields` as needed."
  [query :- ::lib.schema/query]
  (lib.walk/walk
   query
   (fn [query path-type path stage-or-join]
     (case path-type
       :lib.walk/join  (resolve-join stage-or-join)
       :lib.walk/stage nil #_(add-join-fields-to-stage query path stage-or-join)))))
