(ns metabase.query-processor.middleware.add-stage-metadata
  (:require
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.metadata.calculation :as lib.metadata.calculation]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.util :as lib.util]
   [metabase.mbql.util :as mbql.u]
   [metabase.query-processor.interface :as qp.i]
   [metabase.util.i18n :refer [trs]]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]))

(defn- has-same-fields-as-previous-stage?
  "Whether this source query itself has a nested source query, and will have the exact same fields in the results as its
  nested source. If this is the case, we can return the `stage-metadata` for the nested source as-is, if it is
  present."
  [query stage-number {breakouts    :breakout
                       aggregations :aggregation
                       fields       :fields}]
  (when-let [{previous-stage-metadata :lib/stage-metadata} (lib.util/previous-stage query stage-number)]
    (and (every? empty? [breakouts aggregations])
         (or (empty? fields)
             (and (= (count fields) (count (:columns previous-stage-metadata)))
                  (every? #(mbql.u/match-one % [:field (_ :guard string?) _])
                          fields))))))

(mu/defn ^:private native-stage->metadata :- [:maybe ::lib.metadata/stage-metadata]
  "Given a `previous-stage`, return the source metadata that should be added at the parent level (i.e., at the same
  level where this `previous-stage` was present.) This metadata is used by other middleware to determine what Fields to
  expect from the source query."
  [query stage-number {previous-stage-metadata :lib/stage-metadata, :as previous-stage} :- ::lib.schema/stage]
  ;; If the source query has a nested source with metadata and does not change the fields that come back, return
  ;; metadata as-is
  (if (has-same-fields-as-previous-stage? query stage-number previous-stage)
    previous-stage-metadata
    ;; Otherwise we cannot determine the metadata automatically; usually, this is because the source query itself has
    ;; a native source query
    (do
      (when-not qp.i/*disable-qp-logging*
        (log/warn
         (trs "Cannot infer metadata for source query with native source query without source metadata.")
         {:previous-stage previous-stage}))
      nil)))

(mu/defn ^:private mbql-stage->metadata :- ::lib.metadata/stage-metadata
  [query stage-number :- :int stage]
  (lib.metadata.calculation/metadata query stage-number stage))

(mu/defn ^:private add-stage-metadata :- [:map
                                           [:lib/stage-metadata {:optional true} ::lib.metadata/stage-metadata]]
  [query stage-number :- :int stage]
  (when-let [previous-stage (lib.util/previous-stage query stage-number)]
    (let [native-previous-stage? (= (:lib/type previous-stage) :mbql.stage/native)
          metadata               ((if native-previous-stage?
                                    native-stage->metadata
                                    mbql-stage->metadata) query stage-number previous-stage)]
      (cond-> stage
        (seq metadata) (assoc :lib/stage-metadata metadata)))))

(mu/defn ^:private legacy-stage-metadata?
  "Whether this source metadata is *legacy* source metadata from < 0.38.0. Legacy source metadata did not include
  `:field_ref` or `:id`, which made it hard to correctly construct queries with. For MBQL queries, we're better off
  ignoring legacy source metadata and using `qp/query->expected-cols` to infer the source metadata rather than relying
  on old stuff that can produce incorrect queries. See #14788 for more information."
  [stage-metadata :- ::lib.metadata/stage-metadata]
  (and (seq stage-metadata)
       (every? nil? (map :field_ref (:columns stage-metadata)))))

(mu/defn ^:private should-add-stage-metadata?
  "Should we add `:stage-metadata` about the `:previous-stage` in this map? True if all of the following are true:

  * The map (e.g. an 'inner' MBQL query or a Join) has a `:previous-stage`

  * The map does not *already* have `:stage-metadata`, or the `:stage-metadata` is 'legacy' source metadata from
    versions < 0.38.0

  * The `:previous-stage` is an MBQL query, or a native source query with `:stage-metadata`"
  [query stage-number :- :int stage]
  (when-let [previous-stage (lib.util/previous-stage query stage-number)]
    (let [native-previous-stage?  (= (:lib/type previous-stage) :mbql.stage/native)
          previous-stage-metadata (:lib/stage-metadata previous-stage)]
      (and (or (not (:lib/stage-metadata stage))
               (legacy-stage-metadata? previous-stage-metadata))
           (or (not native-previous-stage?)
               previous-stage-metadata)))))

(defn add-stage-metadata-for-source-queries
  "Middleware that attempts to recursively add `:stage-metadata`, if not already present, to any maps with a
  `:previous-stage`.

  `:stage-metadata` is information about the columns we can expect to come back from the source
  query; this is added automatically for source queries added via the `card__id` source table form, but for *explicit*
  source queries that do not specify this information, we can often infer it by looking at the shape of the source
  query."
  [query]
  (lib.util/update-stages
   query
   (fn [query stage-number stage]
     (println "query:" query) ; NOCOMMIT
     (println "stage-number:" stage-number) ; NOCOMMIT
     (when (should-add-stage-metadata? query stage-number stage)
       (add-stage-metadata query stage-number stage)))))
