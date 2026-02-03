(ns metabase.legacy-mbql.normalize
  "Normalize MBQL 1-4 to MBQL 4."
  (:require
   #?@(:clj
       ([metabase.legacy-mbql.schema.helpers :as helpers]
        [potemkin :as p]))
   [metabase.legacy-mbql.schema :as mbql.s]
   [metabase.lib.normalize :as lib.normalize]
   [metabase.util.malli :as mu]))

#?(:clj (comment helpers/keep-me))

;; this is only for the sake of a few random namespaces that use this still
#?(:clj
   (p/import-vars [helpers is-clause?]))

(defn- infer-schema [x]
  (or (mbql.s/infer-mbql-clause-schema x)
      ::mbql.s/Query))

(defn normalize
  "Normalize the tokens in a Metabase query (i.e., make them all `lisp-case` keywords), rewrite deprecated clauses as
  MBQL 4, and remove empty clauses."
  ([x]
   (normalize (infer-schema x) x))

  ([schema x]
   (when (:lib/type x)
     (throw (ex-info "Legacy MBQL normalization code cannot normalize MBQL >= 5" {:query x})))
   (lib.normalize/normalize schema x)))

(mu/defn normalize-or-throw :- ::mbql.s/Query
  "Like [[normalize]], but checks the result against the Malli schema for a legacy query, which will cause it to throw
  if it fails (at least in dev)."
  [query :- :map]
  (normalize query))

(defn normalize-field-ref
  "Normalize the field ref. Ensure it's well-formed mbql, not just json.

  DEPRECATED: use Lib + MBQL 5 in new code going forward."
  {:deprecated "0.57.0"}
  [clause]
  (normalize ::mbql.s/field clause))
