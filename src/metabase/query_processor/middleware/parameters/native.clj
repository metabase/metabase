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

(defn- expand-inner [{:keys [parameters query] :as inner-query}]
  (println "(values/query->params-map inner-query):" (values/query->params-map inner-query)) ; NOCOMMIT
  (merge
   (dissoc inner-query :parameters :template-tags)
   (let [[query params] (-> query
                            parse/parse
                            (substitute/substitute (values/query->params-map inner-query)))]
     {:query  query
      :params params})))

(defn expand
  "Expand parameters inside a native `query`."
  [{:keys [parameters], inner :native, :as query}]
  (if-not (driver/supports? driver/*driver* :native-parameters)
    query
    ;; sometimes `:parameters` are specified at the top level (not sure if this is still true IRL, but it is in
    ;; tests), instead of at the same level; merge those in first if that is indeed the case
    (let [inner' (expand-inner (update inner :parameters #(concat parameters %)))]
      (assoc query :native inner'))))
