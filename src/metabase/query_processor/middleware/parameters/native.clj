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
  `metabase.query-processor.parameters.*` (for MBQL 5). Driver-specific parsing/substitution logic is implemented in
  `metabase.driver.sql.parameters.*` (for SQL drivers) or similar namespaces for others.

  The different steps of this process, are similar between existing driver implementations, and are as follows:

  1. `values` parses `:parameters` passed in as arguments to the query and returns a map of param key -> value

  2. `parse` takes a string and breaks it out into a series of string fragments interleaved with objects
     representing optional and non-optional params

  3.  `substitute` (and the related namespace `substitution`) replace optional and param objects with appropriate SQL
      snippets and prepared statement args, and combine the sequence of fragments back into a single SQL string."
  (:require
   [metabase.driver :as driver]
   [metabase.driver.util :as driver.u]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.metadata :as lib.schema.metadata]
   [metabase.util.malli :as mu]))

(mu/defn expand-stage :- ::lib.schema/stage.native
  "Expand parameters inside an *inner* native `query`. Not recursive -- recursive transformations are handled in
  the `middleware.parameters` functions that invoke this function."
  [metadata-providerable :- ::lib.schema.metadata/metadata-providerable
   stage                 :- ::lib.schema/stage.native]
  (if-not (driver.u/supports? driver/*driver* :native-parameters (lib.metadata/database metadata-providerable))
    stage
    (let [substituted-stage (driver/substitute-native-parameters-in-stage driver/*driver* metadata-providerable stage)]
      (->
       substituted-stage
       (dissoc :parameters :template-tags)))))
