(ns metabase.query-processor.middleware.fetch-source-query
  (:require
   [metabase.driver :as driver]
   [metabase.driver.ddl.interface :as ddl.i]
   [metabase.lib.card :as lib.card]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.metadata.protocols :as lib.metadata.protocols]
   [metabase.lib.query :as lib.query]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.lib.schema.metadata :as lib.schema.metadata]
   [metabase.lib.walk :as lib.walk]
   [metabase.public-settings :as public-settings]
   [metabase.query-processor.error-type :as qp.error-type]
   [metabase.query-processor.store :as qp.store]
   [metabase.query-processor.util.persisted-cache :as qp.persisted]
   [metabase.util :as u]
   [metabase.util.i18n :refer [trs tru]]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [weavejester.dependency :as dep]))

;;; TODO -- consider whether [[normalize-card-query]] should be moved into [[metabase.lib.card]], seems like it would
;;; make sense but it would involve teasing out some QP-specific stuff to make it work.
(defn- fix-mongodb-first-stage
  "MongoDB native queries consist of a collection and a pipelne (query).

  TODO -- it's not great that this code lives here. This should be part of the MongoDB driver. We should NOT be
  hardcoding driver-specific behavior in generic QP middleware."
  [[first-stage & more]]
  (let [first-stage (cond-> first-stage
                      (and (= driver/*driver* :mongo)
                           (= (:lib/type first-stage) :mbql.stage/native))
                      (update :native (fn [x]
                                        (if (map? x)
                                          x
                                          {:collection  (:collection first-stage)
                                           :projections (:projections first-stage)
                                           :query       x}))))]
    (cons first-stage more)))

(mu/defn normalize-card-query :- ::lib.schema.metadata/card
  "Convert Card's query (`:datasaet-query`) to pMBQL as needed; splice in stage metadata and some extra keys."
  [metadata-providerable   :- ::lib.schema.metadata/metadata-providerable
   {card-id :id, :as card} :- ::lib.schema.metadata/card]
  (let [persisted-info (:lib/persisted-info card)
        persisted?     (qp.persisted/can-substitute? card persisted-info)]
    (when persisted?
      (log/infof "Found substitute cached query for card %s from %s.%s"
                 card-id
                 (ddl.i/schema-name {:id (:database-id card)} (public-settings/site-uuid))
                 (:table-name persisted-info)))
    (letfn [(update-stages [stages]
              (let [stages        (fix-mongodb-first-stage stages)
                    stages        (for [stage stages]
                                    ;; this is for detecting circular refs below.
                                    (assoc stage :qp/stage-is-from-source-card card-id))
                    card-metadata (lib.card/card-metadata-columns metadata-providerable card)
                    last-stage    (cond-> (last stages)
                                    (seq card-metadata) (assoc-in [:lib/stage-metadata :columns] card-metadata)
                                    ;; This will be applied, if still appropriate, by
                                    ;; the [[metabase.query-processor.middleware.persistence]] middleware
                                    ;;
                                    ;; TODO -- not 100% sure I did this right, there are almost no tests for this
                                    persisted? (assoc :persisted-info/native
                                                      (qp.persisted/persisted-info-native-query
                                                       (:database-id card)
                                                       persisted-info)))]
                (conj (vec (butlast stages)) last-stage)))
            (update-query [query]
              (-> (lib.query/query metadata-providerable query)
                  (update :stages update-stages)))]
      (update card :dataset-query update-query))))

(mu/defn ^:private card :- ::lib.schema.metadata/card
  [metadata-providerable :- ::lib.schema.metadata/metadata-providerable
   card-id               :- ::lib.schema.id/card]
  (let [card (or (lib.metadata/card metadata-providerable card-id)
                 (throw (ex-info (tru "Card {0} does not exist." (pr-str card-id))
                                 {:type qp.error-type/invalid-query, :card-id card-id})))]
    ;; make sure the Card has a valid query
    (when-not (:dataset-query card)
      (throw (ex-info (tru "Missing source query in Card {0}" card-id)
                      {:type qp.error-type/invalid-query, :card-id card-id})))
    ;; make sure this Card is from the same Database as the one we're running queries against.
    (let [source-database-id (u/the-id (lib.metadata/database metadata-providerable))]
      (when-not (= (:database-id card) source-database-id)
        (throw (ex-info (tru "Card {0} is from a different Database." (pr-str card-id))
                        {:type               qp.error-type/invalid-query
                         :source-database-id source-database-id
                         :card-database-id   (:database-id card)}))))
    (normalize-card-query metadata-providerable card)))

(mu/defn ^:private resolve-source-cards-in-stage :- [:maybe ::lib.schema/stages]
  [query     :- ::lib.schema/query
   stage     :- ::lib.schema/stage
   dep-graph :- (lib.schema.common/instance-of-class clojure.lang.Volatile)]
  (when (and (= (:lib/type stage) :mbql.stage/mbql)
             (:source-card stage))
    ;; make sure nested queries are enabled before resolving them.
    (when-not (public-settings/enable-nested-queries)
      (throw (ex-info (trs "Nested queries are disabled")
                      {:type qp.error-type/disabled-feature, :card-id (:source-card stage)})))
    ;; If the first stage came from a different source card (i.e., we are doing recursive resolution) record the
    ;; dependency of the previously-resolved source card on the one we're about to resolve. We can check for circular
    ;; dependencies this way.
    (when (:qp/stage-is-from-source-card stage)
      (u/prog1 (vswap! dep-graph
                       dep/depend
                       (tru "Card {0}" (:qp/stage-is-from-source-card stage))
                       (tru "Card {0}" (:source-card stage)))
        ;; This will throw if there's a cycle
        (dep/topo-sort <>)))
    (let [card         (card query (:source-card stage))
          card-stages  (get-in card [:dataset-query :stages])
          ;; this information is used by [[metabase.query-processor.middleware.annotate/col-info-for-field-clause*]]
          stage'        (-> stage
                            ;; these keys are used by the [[metabase.query-processor.middleware.annotate]] middleware to
                            ;; decide whether to "flow" the Card's metadata or not (whether to use it preferentially over
                            ;; the metadata associated with Fields themselves)
                            (assoc :qp/stage-had-source-card (:id card)
                                   :source-query/model?      (= (:type card) :model))
                            (dissoc :source-card))]
      (into (vec card-stages) [stage']))))

(def ^:private max-recursion-depth 50)

(defn- resolve-source-cards* [original-query recursion-depth dep-graph]
  ;; this is mostly to catch programmer bugs and avoid infinite loops, thus not i18n'ed. Dep graph should circular
  ;; dependencies if they occur
  (assert (<= recursion-depth max-recursion-depth)
          (format "Source Cards not fully resolved after %d iterations." max-recursion-depth))
  (let [updated-query                              (lib.walk/walk-stages
                                                    original-query
                                                    (fn [query _path stage]
                                                      (resolve-source-cards-in-stage query stage dep-graph)))
        card-id                                    (some :qp/stage-had-source-card
                                                         (reverse (:stages updated-query)))
        ;; `:qp/source-card-id` is used by [[metabase.query-processor.middleware.results-metadata/record-metadata!]] to
        ;; decide whether to record metadata as well as by the [[add-dataset-info]] post-processing middleware, and
        ;; by [[metabase.query-processor.middleware.permissions/check-query-permissions*]]
        updated-query                              (cond-> updated-query
                                                     card-id  (-> (update :qp/source-card-id #(or % card-id))
                                                                  (update-in [:info :card-id] #(or % card-id))))]
    (if (= updated-query original-query)
      original-query
      ;; if any resolution happened, recursively resolve things in the updated query in case we need to do MORE.
      (recur updated-query (inc recursion-depth) dep-graph))))

(mu/defn resolve-source-cards :- ::lib.schema/query
  "If a stage has a `:source-card`, fetch the Card and prepend its underlying stages to the pipeline."
  [query :- ::lib.schema/query]
  (let [query (dissoc query :source-card-id :qp/source-card-id)] ; `:source-card-id` was the old key
    (resolve-source-cards* query 0 (volatile! (dep/graph)))))

(defn add-dataset-info
  "Post-processing middleware that adds `:model` and `:dataset` (for historic reasons) `true` or `false` to queries with
  a source card.

  TODO -- we should remove remove the `:dataset` key and make sure nothing breaks, and make sure everything is looking
  at `:model` instead."
  [{:qp/keys [source-card-id], :as _preprocessed-query} rff]
  (if-not source-card-id
    rff
    (let [model? (= (:type (lib.metadata.protocols/card (qp.store/metadata-provider) source-card-id)) :model)]
      (fn rff' [metadata]
        (rff (cond-> metadata model? (assoc :dataset model?, :model model?)))))))
