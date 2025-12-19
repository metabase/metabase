(ns metabase.lib.segment
  "A Segment is a saved MBQL query stage snippet with `:filter`. Segments are always boolean expressions."
  (:refer-clojure :exclude [mapv empty?])
  (:require
   [metabase.lib.filter :as lib.filter]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.metadata.calculation :as lib.metadata.calculation]
   [metabase.lib.metadata.protocols :as lib.metadata.protocols]
   [metabase.lib.options :as lib.options]
   [metabase.lib.ref :as lib.ref]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.lib.schema.metadata :as lib.schema.metadata]
   [metabase.lib.util :as lib.util]
   [metabase.lib.walk.util :as lib.walk.util]
   [metabase.util.i18n :as i18n]
   [metabase.util.malli :as mu]
   [metabase.util.performance :refer [mapv empty?]]))

(defn- resolve-segment [query segment-id]
  (when (integer? segment-id)
    (lib.metadata/segment query segment-id)))

(defmethod lib.ref/ref-method :metadata/segment
  [{:keys [id]}]
  (lib.options/ensure-uuid [:segment {} id]))

(defmethod lib.metadata.calculation/type-of-method :metadata/segment
  [_query _stage-number _segment-metadata]
  :type/Boolean)

(defmethod lib.metadata.calculation/type-of-method :segment
  [_query _stage-number _segment-clause]
  :type/Boolean)

(defn- fallback-display-name []
  (i18n/tru "[Unknown Segment]"))

(defmethod lib.metadata.calculation/display-name-method :metadata/segment
  [_query _stage-number segment-metadata _style]
  (or (:display-name segment-metadata)
      (:name segment-metadata)
      (fallback-display-name)))

(defmethod lib.metadata.calculation/display-name-method :segment
  [query stage-number [_tag _opts segment-id-or-name] style]
  (or (when (integer? segment-id-or-name)
        (when-let [segment-metadata (lib.metadata/segment query segment-id-or-name)]
          (lib.metadata.calculation/display-name query stage-number segment-metadata style)))
      (fallback-display-name)))

(defmethod lib.metadata.calculation/display-info-method :metadata/segment
  [query stage-number {:keys [description filter-positions], :as segment-metadata}]
  (let [default-display-info-method (get-method lib.metadata.calculation/display-info-method :default)
        default-display-info        (default-display-info-method query stage-number segment-metadata)]
    (cond-> default-display-info
      description (assoc :description description)
      filter-positions (assoc :filter-positions filter-positions))))

(defmethod lib.metadata.calculation/display-info-method :segment
  [query stage-number [_tag _opts segment-id-or-name]]
  (if-let [segment-metadata (resolve-segment query segment-id-or-name)]
    (lib.metadata.calculation/display-info query stage-number segment-metadata)
    {:effective-type    :type/Boolean
     :display-name      (fallback-display-name)
     :long-display-name (fallback-display-name)}))

(mu/defn available-segments :- [:maybe [:sequential {:min 1} ::lib.schema.metadata/segment]]
  "Get a list of Segments that you may consider using as filter for a query. Only Segments that have the same
  `table-id` as the `source-table` for this query will be suggested."
  ([query]
   (available-segments query -1))
  ([query :- ::lib.schema/query
    stage-number :- :int]
   (when (zero? (lib.util/canonical-stage-index query stage-number))
     (when-let [source-table-id (lib.util/source-table-id query)]
       (let [segments (lib.metadata.protocols/segments (lib.metadata/->metadata-provider query) source-table-id)
             segment-filters (into {}
                                   (keep-indexed (fn [index filter-clause]
                                                   (when (lib.util/clause-of-type? filter-clause :segment)
                                                     [(get filter-clause 2) index])))
                                   (lib.filter/filters query 0))]
         (cond
           (empty? segments)        nil
           (empty? segment-filters) (vec segments)
           :else                    (mapv (fn [segment-metadata]
                                            (let [filter-pos (-> segment-metadata :id segment-filters)]
                                              (cond-> segment-metadata
                                                ;; even though at most one filter can reference a given segment
                                                ;; we use plural in order to keep the interface used with
                                                ;; plain filters referencing columns
                                                filter-pos (assoc :filter-positions [filter-pos]))))
                                          segments)))))))

(defn- check-segment-cycles
  "DFS to detect cycles starting from `segment-id` with `definition`.
  `metadata-provider` is used for looking up referenced segments.
  `path-nodes` is the set of segment IDs currently in the DFS path (for cycle detection).
  `visited` is the set of segment IDs we've fully processed (for avoiding redundant work).
  Returns updated `visited` set. Throws if a cycle is detected or if a referenced segment doesn't exist."
  ([metadata-provider definition segment-id]
   (check-segment-cycles metadata-provider definition segment-id #{} #{}))
  ([metadata-provider definition segment-id path-nodes visited]
   (cond
     (contains? path-nodes segment-id)
     (throw (ex-info (i18n/tru "Segment cycle detected.")
                     {:segment-id segment-id}))

     (contains? visited segment-id)
     visited

     :else
     (let [referenced-ids (lib.walk.util/all-segment-ids definition)
           path-nodes'    (conj path-nodes segment-id)]
       (reduce (fn [visited' ref-id]
                 (if-let [segment (lib.metadata/segment metadata-provider ref-id)]
                   (check-segment-cycles metadata-provider (:definition segment) ref-id path-nodes' visited')
                   (throw (ex-info (i18n/tru "Segment {0} does not exist." ref-id)
                                   {:segment-id ref-id}))))
               (conj visited segment-id)
               referenced-ids)))))

(mu/defn check-segment-overwrite
  "Check if saving a segment with `segment-id` and `definition` would create a cycle.
  Returns nil if safe to save, throws an exception if it would create a cycle.

  `segment-id` can be nil for new segments that don't have an ID yet.
  `definition` is the segment's MBQL5 query which also serves as the metadata provider
  for looking up referenced segments."
  [segment-id :- [:maybe ::lib.schema.id/segment]
   definition :- ::lib.schema/query]
  (check-segment-cycles definition definition segment-id)
  nil)
