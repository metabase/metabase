(ns metabase.query-processor.middleware.parameters.native
  "Param substitution for *SQL* queries.

  This is a new implementation, fondly referred to as 'SQL parameters 2.0', written for v0.23.0. The new
  implementation uses prepared statement args instead of substituting them directly into the query, and is much
  better-organized and better-documented.

  The Basics:

  *  Things like `{{x}}` (required params) get subsituted with the value of `:x`, which can be a literal used in a
     clause (e.g. in a clause like `value = {{x}}`) or a \"field filter\" that handles adding the clause itself
     (e.g. `{{timestamp}}` might become `timestamp BETWEEN ? AND ?`).

  *  Things like `[[AND {{x}]]` are optional params. If the param (`:x`) isn't specified, the *entire* clause inside
     `[[...]]` is replaced with an empty string; If it is specified, the value inside the curly brackets `{{x}}` is
     replaced as usual and the rest of the clause (`AND ...`) is included in the query as-is

  Various `metabase.query-processor.middleware.parameters.native.*` namespaces implement different steps of this
  process, which are as follows:

  1. `values` parses `:parameters` passed in as arguments to the query and returns a map of param key -> value

  2. `parse` takes a SQL query string and breaks it out into a series of string fragments interleaved with objects
     representing optional and non-optional params

  3.  `substitute` (and the related namespace `substitution`) replace optional and param objects with appropriate SQL
      snippets and prepared statement args, and combine the sequence of fragments back into a single SQL string."
  (:require [metabase.driver :as driver]
            [metabase.query-processor.middleware.parameters.native
             [parse :as parse]
             [substitute :as substitute]
             [values :as values]]))

(defn expand-inner
  "Expand parameters inside an *inner* native `query`. Not recursive -- recursive transformations are handled in
  the `middleware.parameters` functions that invoke this function."
  [{:keys [parameters query native] :as inner-query}]
  (if-not (driver/supports? driver/*driver* :native-parameters)
    inner-query
    ;; Totally ridiculous, but top-level native queries use the key `:query` for SQL or equivalent, while native
    ;; source queries use `:native`. So we need to handle either case.
    (let [query (or query native)]
      ;; only SQL is officially supported rn! We can change this in the future. But we will probably want separate
      ;; implementations of `parse` for other drivers, such as ones with JSON-based query languages. I think?
      (if-not (string? query)
        inner-query
        (merge
         (dissoc inner-query :parameters :template-tags)
         (let [[query params] (-> query
                                  parse/parse
                                  (substitute/substitute (values/query->params-map inner-query)))]
           (merge
            (if (:query inner-query)
              {:query query}
              {:native query})
            {:params params})))))))
