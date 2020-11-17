(ns metabase.query-processor.middleware.parameters.native
  "Param substitution for native queries.

  The Basics:

  *  Things like `{{x}}` (required params) get substituted with the value of `:x`, which can be a literal used in a
     clause (e.g. in a clause like `value = {{x}}`) or a \"field filter\" that handles adding the clause itself
     (e.g. `{{timestamp}}` might become `timestamp BETWEEN ? AND ?`).

  *  Things like `[[AND {{x}]]` are optional params. If the param (`:x`) isn't specified, the *entire* clause inside
     `[[...]]` is replaced with an empty string; If it is specified, the value inside the curly brackets `{{x}}` is
     replaced as usual and the rest of the clause (`AND ...`) is included in the query as-is

  Native parameter parsing and substution logic shared by multiple drivers lives in
  `metabase.driver.common.parameters.*`. Driver-specific parsing/substitution logic is implemented in
  `metabase.driver.sql.parameters.*` (for SQL drivers) or similar namespaces for others.

  The different steps of this process, are similar between existing driver implementations, and are as follows:

  1. `values` parses `:parameters` passed in as arguments to the query and returns a map of param key -> value

  2. `parse` takes a string and breaks it out into a series of string fragments interleaved with objects
     representing optional and non-optional params

  3.  `substitute` (and the related namespace `substitution`) replace optional and param objects with appropriate SQL
      snippets and prepared statement args, and combine the sequence of fragments back into a single SQL string."
  (:require [clojure.set :as set]
            [metabase.driver :as driver]))

(defn expand-inner
  "Expand parameters inside an *inner* native `query`. Not recursive -- recursive transformations are handled in
  the `middleware.parameters` functions that invoke this function."
  [{:keys [parameters query native] :as inner-query}]
  (if-not (driver/supports? driver/*driver* :native-parameters)
    inner-query
    ;; Totally ridiculous, but top-level native queries use the key `:query` for SQL or equivalent, while native
    ;; source queries use `:native`. So we need to handle either case.
    (let [source-query?           (:native inner-query)
          substituted-inner-query (driver/substitute-native-parameters driver/*driver*
                                                                       (set/rename-keys inner-query {:native :query}))]
      (cond-> (dissoc substituted-inner-query :parameters :template-tags)
        source-query? (set/rename-keys {:query :native})))))
