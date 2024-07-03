(ns metabase.models.card.metadata
  "Code related to Card metadata (re)calculation and saving updated metadata asynchronously."
  (:require
   [malli.core :as mc]
   [metabase.analyze :as analyze]
   [metabase.api.common :as api]
   [metabase.compatibility :as compatibility]
   [metabase.legacy-mbql.normalize :as mbql.normalize]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.query-processor.metadata :as qp.metadata]
   [metabase.query-processor.preprocess :as qp.preprocess]
   [metabase.query-processor.util :as qp.util]
   [metabase.server.middleware.session :as mw.session]
   [metabase.shared.util.i18n :refer [trs]]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [toucan2.core :as t2]))

(mr/def ::future
  [:fn {:error/message "A future"} future?])

(mu/defn ^:private legacy-result-metadata-future :- ::future
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

(mu/defn ^:private maybe-async-model-result-metadata :- ::maybe-async-result-metadata
  [{:keys [query metadata original-metadata valid-metadata?]} :- [:map
                                                                  [:valid-metadata? :any]]]
  (log/debug (trs "Querying for metadata and blending model metadata"))
  (let [futur     (legacy-result-metadata-future query)
        metadata' (if valid-metadata?
                    (map mbql.normalize/normalize-source-metadata metadata)
                    original-metadata)
        result    (deref futur metadata-sync-wait-ms ::timed-out)]
    (if (= result ::timed-out)
      {:metadata-future (future
                          (try
                            (qp.util/combine-metadata @futur metadata')
                            (catch Throwable e
                              (future-cancel futur)
                              (log/errorf e "Error blending model metadata: %s" (ex-message e))
                              metadata')))}
      {:metadata (qp.util/combine-metadata result metadata')})))

(mu/defn ^:private maybe-async-recomputed-metadata :- ::maybe-async-result-metadata
  [query]
  (log/debug (trs "Querying for metadata"))
  (let [futur (legacy-result-metadata-future query)
        result (deref futur metadata-sync-wait-ms ::timed-out)]
    (if (= result ::timed-out)
      {:metadata-future futur}
      {:metadata result})))

(mu/defn maybe-async-result-metadata :- ::maybe-async-result-metadata
  "Return return result metadata for the passed in `query`. If metadata needs to be recalculated, waits up
  to [[metadata-sync-wait-ms]] for it to be recalcuated; if not recalculated by then, returns a map with
  `:metadata-future`. Otherwise returns a map with `:metadata`.

  Takes the `original-query` so it can determine if existing `metadata` might still be valid. Takes `dataset?` since
  existing metadata might need to be \"blended\" into the fresh metadata to preserve metadata edits from the dataset.

  Note this condition is possible for new cards and edits to cards. New cards can be created from existing cards by
  copying, and they could be datasets, have edited metadata that needs to be blended into a fresh run.

  This is also complicated because everything is optional, so we cannot assume the client will provide metadata and
  might need to save a metadata edit, or might need to use db-saved metadata on a modified dataset."
  [{:keys [original-query query metadata original-metadata model?], :as options}]
  (let [valid-metadata? (and metadata (mc/validate analyze/ResultsMetadata metadata))]
    (cond
      (or
       ;; query didn't change, preserve existing metadata
       (and (= (compatibility/normalize-dataset-query original-query)
               (compatibility/normalize-dataset-query query))
            valid-metadata?)
       ;; only sent valid metadata in the edit. Metadata might be the same, might be different. We save in either case
       (and (nil? query)
            valid-metadata?)
       ;; copying card and reusing existing metadata
       (and (nil? original-query)
            query
            valid-metadata?))
      (do
        (log/debug (trs "Reusing provided metadata"))
        {:metadata metadata})

      ;; frontend always sends query. But sometimes programatic don't (cypress, API usage). Returning an empty channel
      ;; means the metadata won't be updated at all.
      (nil? query)
      (do
        (log/debug (trs "No query provided so not querying for metadata"))
        {:metadata nil})

      ;; datasets need to incorporate the metadata either passed in or already in the db. Query has changed so we
      ;; re-run and blend the saved into the new metadata
      (and model? (or valid-metadata? (seq original-metadata)))
      (maybe-async-model-result-metadata (assoc options :valid-metadata? valid-metadata?))

      :else
      (maybe-async-recomputed-metadata query))))

(def ^:private metadata-async-timeout-ms
  "Duration in milliseconds to wait for the metadata before abandoning the asynchronous metadata saving. Default is 15
  minutes."
  (u/minutes->ms 15))

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
            (let [current-query (t2/select-one-fn :dataset_query [:model/Card :dataset_query] :id id)]
              (if (= (:dataset_query card) current-query)
                (do
                  (t2/update! :model/Card id {:result_metadata metadata})
                  (log/infof "Metadata updated asynchronously for card %s" id))
                (log/infof "Not updating metadata asynchronously for card %s because query has changed" id)))))
        (catch Throwable e
          (log/errorf e "Error updating metadata for Card %d asynchronously: %s" id (ex-message e)))))))

(defn populate-result-metadata
  "When inserting/updating a Card, populate the result metadata column if not already populated by inferring the
  metadata from the query."
  [{query :dataset_query, metadata :result_metadata, existing-card-id :id, :as card}]
  (cond
    ;; not updating the query => no-op
    (not query)
    (do
      (log/debug "Not inferring result metadata for Card: query was not updated")
      card)

    ;; passing in metadata => no-op
    metadata
    (do
      (log/debug "Not inferring result metadata for Card: metadata was passed in to insert!/update!")
      card)

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
      (let [inferred-metadata (not-empty (mw.session/with-current-user nil
                                           (u/ignore-exceptions
                                             (qp.preprocess/query->expected-cols query))))]
        (assoc card :result_metadata inferred-metadata)))))
