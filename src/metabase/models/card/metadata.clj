(ns metabase.models.card.metadata
  "Code related to Card metadata (re)calculation and saving updated metadata asynchronously."
  (:require
   [medley.core :as m]
   [metabase.analyze.core :as analyze]
   [metabase.api.common :as api]
   [metabase.legacy-mbql.normalize :as mbql.normalize]
   [metabase.lib.core :as lib]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.query-processor.metadata :as qp.metadata]
   [metabase.query-processor.preprocess :as qp.preprocess]
   [metabase.query-processor.util :as qp.util]
   [metabase.request.core :as request]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [toucan2.core :as t2]))

(declare ^:private fix-incoming-idents valid-ident?)

(mr/def ::future
  [:fn {:error/message "A future"} future?])

(mu/defn- legacy-result-metadata-future :- ::future
  [query :- :map]
  (future
    (try
      #_{:clj-kondo/ignore [:deprecated-var]}
      (qp.metadata/legacy-result-metadata query api/*current-user-id*)
      (catch Throwable e
        (log/errorf e "Error calculating result metadata for Card: %s" (ex-message e))
        []))))

(def ^:private metadata-sync-wait-ms
  "Duration in milliseconds to wait for the metadata before saving the card without the metadata. That metadata will be
saved later when it is ready."
  1500)

(mr/def ::maybe-async-result-metadata
  [:or
   [:map
    [:metadata [:maybe [:sequential :map]]]]
   [:map
    [:metadata-future ::future]]])

(mu/defn- maybe-async-model-result-metadata :- ::maybe-async-result-metadata
  [{:keys [query metadata original-metadata valid-metadata? entity-id]} :- [:map
                                                                            [:valid-metadata? :any]]]
  (log/debug "Querying for metadata and blending model metadata")
  (let [futur     (-> query
                      (assoc-in [:info :card-entity-id] entity-id)
                      legacy-result-metadata-future)
        metadata' (if valid-metadata?
                    (map mbql.normalize/normalize-source-metadata metadata)
                    original-metadata)
        result    (deref futur metadata-sync-wait-ms ::timed-out)
        combiner  (fn [result]
                    (-> result
                        (fix-incoming-idents {:type      :model
                                              :entity_id entity-id})
                        (qp.util/combine-metadata metadata')))]
    (if (= result ::timed-out)
      {:metadata-future (future
                          (try
                            (combiner @futur)
                            (catch Throwable e
                              (future-cancel futur)
                              (log/errorf e "Error blending model metadata: %s" (ex-message e))
                              metadata')))}
      {:metadata (combiner result)})))

(mu/defn- maybe-async-recomputed-metadata :- ::maybe-async-result-metadata
  [query entity-id]
  (log/debug "Querying for metadata")
  (let [futur (-> query
                  (assoc-in [:info :card-entity-id] entity-id)
                  legacy-result-metadata-future)
        result (deref futur metadata-sync-wait-ms ::timed-out)]
    (if (= result ::timed-out)
      {:metadata-future futur}
      {:metadata result})))

(defn normalize-dataset-query
  "Normalize the query `dataset-query` received via an HTTP call.
  Handles both (legacy) MBQL and pMBQL queries."
  [dataset-query]
  (if (= (lib/normalized-query-type dataset-query) :mbql/query)
    (lib/normalize dataset-query)
    (mbql.normalize/normalize dataset-query)))

(mu/defn maybe-async-result-metadata :- ::maybe-async-result-metadata
  "Return result metadata for the passed in `query`. If metadata needs to be recalculated, waits up to
  [[metadata-sync-wait-ms]] for it to be recalcuated; if not recalculated by then, returns a map with
  `:metadata-future`. Otherwise returns a map with `:metadata`.

  Takes the `original-query` so it can determine if existing `metadata` might still be valid. Takes `dataset?` since
  existing metadata might need to be \"blended\" into the fresh metadata to preserve metadata edits from the dataset.

  Note this condition is possible for new cards and edits to cards. New cards can be created from existing cards by
  copying, and they could be datasets, have edited metadata that needs to be blended into a fresh run.

  This is also complicated because everything is optional, so we cannot assume the client will provide metadata and
  might need to save a metadata edit, or might need to use db-saved metadata on a modified dataset."
  [{:keys [original-query query metadata original-metadata model? entity-id], :as options}]
  (let [valid-metadata? (and metadata
                             (mr/validate analyze/ResultsMetadata metadata))]
    (cond
      (or
       ;; query didn't change, preserve existing metadata
       (and (= (normalize-dataset-query original-query)
               (normalize-dataset-query query))
            valid-metadata?)
       ;; only sent valid metadata in the edit. Metadata might be the same, might be different. We save in either case
       (and (nil? query)
            valid-metadata?)
       ;; copying card and reusing existing metadata
       (and (nil? original-query)
            query
            valid-metadata?))
      (do
        (log/debug "Reusing provided metadata")
        ;; TODO: Passing this synthetic `card` is pretty hacky. Better to refactor `fix-incoming-idents`.
        {:metadata (fix-incoming-idents metadata {:entity_id entity-id
                                                  :type      (if model? :model :question)})})

      ;; frontend always sends query. But sometimes programatic don't (cypress, API usage). Returning an empty channel
      ;; means the metadata won't be updated at all.
      (nil? query)
      (do
        (log/debug "No query provided so not querying for metadata")
        {:metadata nil})

      ;; datasets need to incorporate the metadata either passed in or already in the db. Query has changed so we
      ;; re-run and blend the saved into the new metadata
      (and model? (or valid-metadata? (seq original-metadata)))
      (maybe-async-model-result-metadata (assoc options :valid-metadata? valid-metadata?))

      :else
      (maybe-async-recomputed-metadata query entity-id))))

(def ^:private metadata-async-timeout-ms
  "Duration in milliseconds to wait for the metadata before abandoning the asynchronous metadata saving. Default is 15
  minutes."
  (u/minutes->ms 15))

(defn- valid-ident?
  "Validates that model columns have idents that always start with `model__CardEntityId__`, and that all idents are
  nonempty strings.

  Note that this **does not** check that `:type :native` queries have native idents - SQL-based sandboxing stores
  `:native` queries but returns MBQL-like metadata with IDs and the Field `entity_id`s as idents."
  ;; TODO: That limitation that prevents checking native queries have native-looking :idents is unfortunate.
  ;; At least this checks that we never store `native____`, ie. native queries without a card entity_id.
  ([column card]
   (valid-ident? column (= (:type card) :model) (:entity_id card)))
  ([column model? entity-id]
   (let [valid-fn (cond
                    model?               lib/valid-model-ident?
                    :else                lib/valid-basic-ident?)]
     (valid-fn column entity-id))))

(mu/defn save-metadata-async!
  "Save metadata when (and if) it is ready. Takes a chan that will eventually return metadata. Waits up
  to [[metadata-async-timeout-ms]] for the metadata, and then saves it if the query of the card has not changed."
  [result-metadata-future :- ::future
   card                   :- [:map
                              [:id            ::lib.schema.id/card]
                              [:dataset_query :map]]]
  (let [id (u/the-id card)]
    (future
      (try
        (let [metadata (deref result-metadata-future metadata-async-timeout-ms ::timed-out)]
          (cond
            (= metadata ::timed-out)
            (do
              (log/infof "Metadata not ready in %s, abandoning" (u/format-milliseconds metadata-async-timeout-ms))
              (future-cancel result-metadata-future))

            (not (seq metadata))
            (log/infof "Not updating metadata asynchronously for card %s because no metadata" (u/the-id card))

            :else
            (let [current-query (t2/select-one-fn :dataset_query [:model/Card :dataset_query :card_schema] :id id)]
              (if (= (:dataset_query card) current-query)
                (do
                  (t2/update! :model/Card id {:result_metadata metadata})
                  (log/infof "Metadata updated asynchronously for card %s" id))
                (log/infof "Not updating metadata asynchronously for card %s because query has changed" id)))))
        (catch Throwable e
          (log/errorf e "Error updating metadata for Card %d asynchronously: %s" id (ex-message e)))))))

(defn infer-metadata
  "Infer the default result_metadata to store for MBQL cards.

  Ignores any that might be present already.

  If the card is provided and is a model, this will wrap [[lib/model-ident]] around the `:ident`s from the inner query."
  [query]
  (not-empty (request/with-current-user nil
               (u/ignore-exceptions
                 (qp.preprocess/query->expected-cols query)))))

(defn- xform-maybe-fix-idents-for-model
  "Returns a transducer that will conditionally wrap `:ident`s with [[lib/model-ident]] if they are not already wrapped
  for this model.

  If the provided card is not a model, returns [[identity]]."
  [card]
  (if (= (:type card) :model)
    (let [eid (:entity_id card)]
      (map (fn [col]
             (cond-> col
               (not (lib/valid-model-ident? col eid)) (lib/add-model-ident eid)))))
    identity))

(defn infer-metadata-with-model-overrides
  "Does a fresh [[infer-metadata]] for the provided query.

  - If the `card` is not a model, that fresh metadata is returned directly.
  - If the `card` **is** a model, then the fresh metadata is returned, but any existing `:result_metadata` is included
  so model metadata overrides (eg. new display_name or field types) are preserved in the result."
  [query card]
  (let [model?         (= (:type card) :model)
        model-metadata (when model? (:result_metadata card))
        ;; If this is a model, include that model metadata so QP will infer correctly overridden metadata.
        query          (cond-> query
                         model-metadata (update :info merge {:metadata/model-metadata model-metadata}))]
    (into [] (xform-maybe-fix-idents-for-model card) (infer-metadata query))))

;; TODO: Refactor this to use idents rather than names, so it's more robust.
(defn refresh-metadata
  "Update cached result metadata to reflect changes to the underlying tables.
  For now, this only handles the additional and removal of columns, and does not get into things like type changes."
  [{:keys [result_metadata dataset_query]} {:keys [update-fn] :or {update-fn identity}}]
  (let [new-metadata (infer-metadata dataset_query)
        old-names    (into #{} (map :name) result_metadata)
        new-names    (into #{} (map :name) new-metadata)]
    (vec (concat (filter (comp new-names :name) result_metadata)
                 (->> (remove (comp old-names :name) new-metadata)
                      (map update-fn))))))

(defn fix-incoming-idents
  "Result metadata included with an insert or update should already be in its final form, but might:
  - Have placeholders, if we didn't have an `:entity_id` for a new card when the query ran
  - Be for an inner query, not for a model, and need to be wrapped with the [[lib/model-ident]]."
  [results-metadata card]
  ;; It's important that the placeholders are handled first, otherwise the check for double-wrapping will fail.
  (into [] (comp (map #(update % :ident lib/replace-placeholder-idents (:entity_id card)))
                 (xform-maybe-fix-idents-for-model card))
        results-metadata))

(defn populate-result-metadata
  "When inserting/updating a Card, populate the result metadata column if not already populated by inferring the
  metadata from the query."
  [{query :dataset_query, metadata :result_metadata, existing-card-id :id, :as card}]
  (cond
    ;; not updating the query => no-op
    (not query)
    (do
      (log/debug "Not inferring result metadata for Card: query was not updated")
      (m/update-existing card :result_metadata fix-incoming-idents card))

    ;; passing in metadata => use that metadata, but replace any placeholder idents in it.
    metadata
    (do
      (log/debug "Not inferring result metadata for Card: metadata was passed in to insert!/update!")
      (update card :result_metadata fix-incoming-idents card))

    ;; this is an update, and dataset_query hasn't changed => no-op
    (and existing-card-id
         (= query (t2/select-one-fn :dataset_query :model/Card :id existing-card-id)))
    (do
      (log/debugf "Not inferring result metadata for Card %s: query has not changed" existing-card-id)
      card)

    ;; query has changed (or new Card) and this is a native query => set metadata to nil
    ;;
    ;; we can't infer the metadata for a native query without running it, so it's better to have no metadata than
    ;; possibly incorrect metadata.
    (= (:type query) :native)
    (do
      (log/debug "Can't infer result metadata for Card: query is a native query. Setting result metadata to nil")
      (assoc card :result_metadata nil))

    ;; otherwise, attempt to infer the metadata. If the query can't be run for one reason or another, set metadata to
    ;; nil.
    :else
    (do
      (log/debug "Attempting to infer result metadata for Card")
      (assoc card :result_metadata (infer-metadata-with-model-overrides query card)))))

(defn assert-valid-idents!
  "Given a card (or updates being made to a card) check the `:result_metadata` has correctly formed idents."
  [{cols :result_metadata :as card}]
  (lib/assert-idents-present! cols {:card-id (:id card)})
  (when-let [invalid (seq (remove #(or (nil? (:ident %))
                                       (valid-ident? % card))
                                  cols))]
    (throw (ex-info "Some columns in :result_metadata have bad :idents!"
                    {:invalid invalid}))))
