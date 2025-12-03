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
  `metabase.driver.common.parameters.*` (for legacy MBQL) and `metabase.query-processor.parameters.*` (for MBQL 5).
  Driver-specific parsing/substitution logic is implemented in `metabase.driver.sql.parameters.*` (for SQL drivers) or
  similar namespaces for others.

  The different steps of this process, are similar between existing driver implementations, and are as follows:

  1. `values` parses `:parameters` passed in as arguments to the query and returns a map of param key -> value

  2. `parse` takes a string and breaks it out into a series of string fragments interleaved with objects
     representing optional and non-optional params

  3.  `substitute` (and the related namespace `substitution`) replace optional and param objects with appropriate SQL
      snippets and prepared statement args, and combine the sequence of fragments back into a single SQL string."
  (:refer-clojure :exclude [mapv])
  (:require
   [clojure.set :as set]
   [medley.core :as m]
   [metabase.driver :as driver]
   [metabase.driver.util :as driver.u]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.metadata :as lib.schema.metadata]
   ^{:clj-kondo/ignore [:deprecated-namespace]} [metabase.query-processor.store :as qp.store]
   [metabase.util.malli :as mu]
   [metabase.util.performance :refer [mapv]]))

(defn- substitute-native-parameters* [stage]
  (-> stage
      (set/rename-keys {:native :query})
      (m/update-existing :parameters (fn [parameters]
                                       (mapv lib/->legacy-MBQL parameters)))
      (m/update-existing :template-tags update-vals lib/->legacy-MBQL)
      (dissoc :lib/type)
      (->> (driver/substitute-native-parameters driver/*driver*))
      (set/rename-keys {:query :native})
      (assoc :lib/type (:lib/type stage))))

(mu/defn expand-stage :- ::lib.schema/stage.native
  "Expand parameters inside an *inner* native `query`. Not recursive -- recursive transformations are handled in
  the `middleware.parameters` functions that invoke this function."
  [metadata-providerable :- ::lib.schema.metadata/metadata-providerable
   stage                 :- ::lib.schema/stage.native]
  (if-not (driver.u/supports? driver/*driver* :native-parameters (lib.metadata/database metadata-providerable))
    stage
    (let [substituted-stage (if (qp.store/initialized?)
                              (substitute-native-parameters* stage)
                              (qp.store/with-metadata-provider (lib.metadata/->metadata-provider metadata-providerable)
                                (substitute-native-parameters* stage)))]
      (->
       substituted-stage
       (dissoc :parameters :template-tags)))))
