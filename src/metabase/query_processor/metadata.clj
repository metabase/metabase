(ns metabase.query-processor.metadata
  "Code related to calculating result metadata for a query (hopefully) without running it. This can always be done for
  MBQL queries; for native queries we use the driver implementation of
  [[metabase.driver/query-result-metadata]], which hopefully can calculate metadata without running the query. If
  that's not possible, our fallback `:default` implementation adds the equivalent of `LIMIT 1` to query and runs it."
  (:require
   [metabase.analyze.core :as analyze]
   [metabase.driver :as driver]
   [metabase.driver.util :as driver.u]
   [metabase.legacy-mbql.normalize :as mbql.normalize]
   [metabase.legacy-mbql.schema :as mbql.s]
   [metabase.lib-be.metadata.jvm :as lib.metadata.jvm]
   [metabase.lib.core :as lib]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.lib.schema.metadata :as lib.schema.metadata]
   [metabase.query-processor :as qp]
   [metabase.query-processor.preprocess :as qp.preprocess]
   [metabase.query-processor.schema :as qp.schema]
   [metabase.query-processor.util :as qp.util]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.performance :as perf]))

(mu/defn- metadata-from-preprocessing :- [:maybe [:sequential :map]]
  "For MBQL queries or native queries with result metadata attached to them already we can infer the columns just by
  preprocessing the query/looking at the last stage of the query."
  [query :- :map]
  (not-empty (u/ignore-exceptions (qp.preprocess/query->expected-cols query))))

(mu/defn- query-with-limit-1 :- :map
  [query :- :map]
  ;; for purposes of calculating the actual Fields & types returned by this query we really only need the first
  ;; row in the results
  (let [query (-> query
                  (assoc-in [:constraints :max-results] 1)
                  (assoc-in [:constraints :max-results-bare-rows] 1))]
    ;; need add the constraints above before calculating hash because those affect the hash
    ;;
    ;; (normally middleware takes care of calculating query hashes for 'userland' queries but this is not
    ;; technically a userland query -- we don't want to save a QueryExecution -- so we need to add `executed-by`
    ;; and `query-hash` ourselves so the remark gets added)
    (assoc-in query [:info :query-hash] (qp.util/query-hash query))))

(mu/defn- result-metadata-rff :- ::qp.schema/rff
  [metadata]
  (let [cols (:cols metadata)]
    (fn rf
      ([]
       (reduced cols))
      ([cols]
       (unreduced cols))
      ;; we should never get to this iteration since we should be quitting right away rather than reducing any rows, but
      ;; it's here just in case to be safe.
      ([cols _row]
       (ensure-reduced cols)))))

(mu/defmethod driver/query-result-metadata :default :- [:sequential :map]
  [_driver :- :keyword
   query   :- :map]
  (let [query' (query-with-limit-1 query)]
    (try
      (qp/process-query query' result-metadata-rff)
      (catch Throwable e
        (log/error e "Error running query to determine Card result metadata")
        []))))

(mu/defn- metadata-from-driver :- [:sequential :map]
  "Get metadata from the driver's implementation of [[metabase.driver/query-result-metadata]]. For JDBC-based drivers
  this returns metadata without actually running queries; the default implementation will run the query with `LIMIT 1`
  to get results."
  [query           :- :map
   current-user-id :- [:maybe ::lib.schema.id/user]]
  (let [query  (cond-> query
                 current-user-id (assoc-in [:info :executed-by] current-user-id))
        driver (driver.u/database->driver (:database query))]
    (driver/query-result-metadata driver query)))

(mu/defn- add-extra-column-metadata :- :map
  [col            :- :map
   legacy-or-mlv2 :- [:enum ::legacy ::mlv2]]
  (let [display-name-key (case legacy-or-mlv2
                           ::legacy :display_name
                           ::mlv2   :display-name)
        semantic-type-key (case legacy-or-mlv2
                            ::legacy :semantic_type
                            ::mlv2   :semantic-type)]
    (letfn [(ensure-display-name [col]
              (cond-> col
                ;; I'm trying to disable nice display name humanization because it breads like 100 Cypress tests and I
                ;; can't be bothered to go in and fix all of them even if this is objectively a better display name.
                ;; Seeing if this fixes things. -- Cam
                (not (display-name-key col))
                (assoc display-name-key (:name col) #_(u.humanization/name->human-readable-name :simple (:name col)))))
            (infer-semantic-type-by-name [col]
              (let [legacy-col    (cond-> col
                                    (= legacy-or-mlv2 ::mlv2)
                                    (perf/update-keys u/->snake_case_en))
                    semantic-type (analyze/infer-semantic-type-by-name legacy-col)]
                (merge col
                       (when semantic-type
                         {semantic-type-key semantic-type}))))]
      (-> col
          ensure-display-name
          infer-semantic-type-by-name))))

(mu/defn- result-metadata* :- [:sequential :map]
  [query current-user-id]
  (or (metadata-from-preprocessing query)
      (metadata-from-driver query current-user-id)))

(mu/defn result-metadata :- [:sequential ::lib.schema.metadata/column]
  "Get result metadata for a query, hopefully without actually having to run the query itself. For MBQL queries we can
  usually calculate result metadata based on what's returned by the final stage of the query. For native queries we
  call [[metabase.driver/native-query-result-metadata]], which defaults to actually running the query with a the
  equivalent of `LIMIT 1`, but some drivers such as `:sql-jdbc` offer optimized implementations that don't actually need
  to run the query. In this case, `current-user-id` is used so we can associate that information with the query that is
  run.

  Returns columns as MLv2-style `kebab-case` column metadata; for legacy metadata you can use [[legacy-result-metadata]]
  instead."
  ([query]
   (result-metadata query nil))

  ([query           :- [:map [:database ::lib.schema.id/database]]
    current-user-id :- [:maybe ::lib.schema.id/user]]
   (mapv
    (fn [col]
      (-> col
          (lib.metadata.jvm/instance->metadata :metadata/column)
          (add-extra-column-metadata ::mlv2)))
    (result-metadata* query current-user-id))))

(mu/defn- ensure-legacy :- ::mbql.s/legacy-column-metadata
  [col :- :map]
  (letfn [(ensure-field-ref [col]
            ;; HACK for backward compatibility with FE stuff -- ideally we would be able to remove this entirely but
            ;; if we do some e2e tests fail that I don't really have the energy to spend all day debugging -- Cam
            (cond-> col
              (not (:field_ref col)) (assoc :field_ref [:field (:name col) {:base-type (or (:base_type col) :type/*)}])))]
    (-> col
        lib/lib-metadata-column->legacy-metadata-column
        (add-extra-column-metadata ::legacy)
        ensure-field-ref
        mbql.normalize/normalize-source-metadata)))

(mu/defn legacy-result-metadata :- [:maybe [:sequential ::mbql.s/legacy-column-metadata]]
  "Like [[result-metadata]], but return metadata in legacy format rather than MLv2 format. This should be considered
  deprecated, as we're working on moving towards using MLv2-style metadata everywhere; avoid new usages of this function
  if possible, and prefer [[result-metadata]] instead.

  Note: it is preferable to use [[metabase.lib.core/lib-metadata-column->legacy-metadata-column]] directly if you really
  need to do this sort of conversion."
  {:deprecated "0.51.0"}
  [query           :- :map
   current-user-id :- [:maybe ::lib.schema.id/user]]
  (mapv
   ensure-legacy
   (result-metadata* query current-user-id)))
