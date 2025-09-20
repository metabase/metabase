(ns metabase.query-processor.compile
  (:refer-clojure :exclude [compile])
  (:require
   [clojure.set :as set]
   [metabase.driver :as driver]
   [metabase.lib.core :as lib]
   [metabase.lib.schema :as lib.schema]
   [metabase.query-processor.debug :as qp.debug]
   [metabase.query-processor.error-type :as qp.error-type]
   [metabase.query-processor.preprocess :as qp.preprocess]
   [metabase.query-processor.schema :as qp.schema]
   [metabase.query-processor.setup :as qp.setup]
   [metabase.util :as u]
   [metabase.util.i18n :as i18n]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]))

(mr/def ::compiled
  "Compiled query and parameters (SQL or whatever native query language)."
  [:map
   [:query :any]
   [:params {:optional true} [:maybe [:sequential :any]]]])

(mr/def ::compiled-with-inlined-parameters
  "Query with inlined parameters (:params must be empty)"
  [:map
   [:query :any]
   [:params {:optional true} [:maybe [:sequential {:max 0} :any]]]])

(mr/def ::query-with-compiled-query
  "A legacy query that also has a compiled native query attached (unless it was already a native-only query in the first
  place)."
  [:merge
   [:ref ::lib.schema/query]
   [:map
    [:qp/compiled        ::compiled]
    ;; If the query was already native, then don't include this because we're not about to go splice the parameters
    ;; into the existing query. Otherwise we should include this.
    [:qp/compiled-inline {:optional true} ::compiled-with-inlined-parameters]]])

(defn- native-only?
  "Whether the query is native-only and thus does not need further compiling; true if the only stage is native. Native
  stages can only be the first stage, so if the last stage is native it means we have only one stage and this query is
  native-only."
  [query]
  (lib/native-stage? query -1))

(mu/defn- compile* :- ::compiled
  [query :- ::lib.schema/query]
  (assert (not (:qp/compiled query)) "This query has already been compiled!")
  (if (native-only? query)
    (set/rename-keys (lib/query-stage query -1) {:native :query})
    (driver/mbql->native driver/*driver* (lib/->legacy-MBQL query))))

(mu/defn compile-preprocessed :- ::compiled
  "Compile an already-preprocessed query, if needed. Returns just the resulting 'inner' native query.
  `:native` key in a legacy query."
  [preprocessed-query :- ::lib.schema/query]
  (qp.setup/with-qp-setup [preprocessed-query preprocessed-query]
    (try
      (u/prog1 (compile* preprocessed-query)
        (qp.debug/debug> (list `compile-preprocessed <>)))
      (catch Throwable e
        (throw (ex-info (i18n/tru "Error compiling query: {0}" (ex-message e))
                        {:query preprocessed-query, :type qp.error-type/driver}
                        e))))))

(mu/defn compile :- ::compiled
  "Preprocess and compile a query, if needed. Returns just the resulting 'inner' native query."
  [query :- ::qp.schema/any-query]
  (qp.setup/with-qp-setup [query query]
    (compile-preprocessed (qp.preprocess/preprocess query))))

(mu/defn attach-compiled-query :- ::query-with-compiled-query
  "If this is an MBQL query, compile it and attach it to the query under the `:qp/compiled` key. Previously, we attached
  this under `:native`, but that causes the MBQL schema to blow up. We can't just change this to a regular native
  query outright and remove the MBQL `:query`, because that would break perms checks."
  [preprocessed :- ::lib.schema/query]
  (let [preprocessed (dissoc preprocessed :qp/compiled :qp/compiled-inline)]
    (-> preprocessed
        (assoc :qp/compiled (compile-preprocessed preprocessed))
        ;; if this query is pure-MBQL then we can reliably (re)compile it with inline parameters. If it has any native
        ;; stage then it might already have parameters, and we're not about to try to splice them back in.
        (cond-> (not (lib/any-native-stage? preprocessed))
          (assoc :qp/compiled-inline (binding [driver/*compile-with-inline-parameters* true]
                                       (compile-preprocessed preprocessed)))))))

(mu/defn compile-with-inline-parameters :- ::compiled-with-inlined-parameters
  "Return the native form for a `query`, with any prepared statement (or equivalent) parameters spliced into the query
  itself as literals. This is used to power features such as 'Convert this Question to SQL'.

  (Currently, this function is mostly used by tests and a few API endpoints;
  REPL; [[metabase.query-processor.middleware.splice-params-in-response/splice-params-in-response]] middleware handles
  similar functionality for queries that are actually executed.)"
  [query :- ::qp.schema/any-query]
  (or (:qp/compiled-inline query)
      (binding [driver/*compile-with-inline-parameters* true]
        (compile (dissoc query :qp/compiled)))))
