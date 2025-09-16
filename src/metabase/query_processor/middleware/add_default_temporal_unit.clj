(ns metabase.query-processor.middleware.add-default-temporal-unit
  (:require
   [metabase.driver :as driver]
   [metabase.driver.util :as driver.u]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.util :as lib.util]
   [metabase.lib.walk :as lib.walk]
   [metabase.util.malli :as mu]))

(defn- add-default-temporal-unit* [query]
  (lib.walk/walk-clauses
   query
   (fn [query _path-type path clause]
     (when (and (lib.util/clause-of-type? clause :field)
                (not (lib/raw-temporal-bucket clause))
                (isa? (lib.walk/apply-f-for-stage-at-path lib/type-of query path clause) :type/Temporal))
       (lib/with-temporal-bucket clause :default)))))

(mu/defn add-default-temporal-unit :- ::lib.schema/query
  "Add `:temporal-unit` `:default` to any temporal `:field` clauses that don't already have a `:temporal-unit`. This
  makes things more consistent because code downstream can rely on the key being present.

  Only activates for drivers with the `:temporal/requires-default-unit` feature."
  [query :- ::lib.schema/query]
  (let [database (lib.metadata/database query)]
    (cond-> query
      (driver.u/supports? driver/*driver* :temporal/requires-default-unit database) add-default-temporal-unit*)))
