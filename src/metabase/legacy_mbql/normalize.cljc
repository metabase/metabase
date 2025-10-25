(ns metabase.legacy-mbql.normalize
  "Normalize MBQL 1-4 to MBQL 4."
  (:require
   #?@(:clj
       ([potemkin :as p]))
   [metabase.legacy-mbql.schema :as mbql.s]
   [metabase.legacy-mbql.schema.helpers :as helpers]
   [metabase.lib.normalize :as lib.normalize]
   [metabase.util.malli :as mu]))

;; this is only for the sake of a few random namespaces that use this still
#?(:clj
   (p/import-vars [helpers is-clause?]))

(defn- infer-schema [x]
  (or (when (sequential? x)
        (when-let [tag (helpers/effective-clause-tag x)]
          (keyword "metabase.legacy-mbql.schema" (name tag))))
      ::mbql.s/Query))

(defn normalize
  "Normalize the tokens in a Metabase query (i.e., make them all `lisp-case` keywords), rewrite deprecated clauses as
  MBQL 4, and remove empty clauses."
  ([x]
   (when (:lib/type x)
     (throw (ex-info "Legacy MBQL normalization code cannot normalize MBQL >= 5" {:query x})))
   (lib.normalize/normalize (infer-schema x) x))
  ([schema x]
   (lib.normalize/normalize schema x)))

(mu/defn normalize-or-throw :- ::mbql.s/Query
  "Like [[normalize]], but checks the result against the Malli schema for a legacy query, which will cause it to throw
  if it fails (at least in dev)."
  [query :- :map]
  (normalize query))

(defn normalize-field-ref
  "Normalize the field ref. Ensure it's well-formed mbql, not just json."
  {:deprecated "0.57.0"}
  [clause]
  (normalize ::mbql.s/field clause))
