(ns metabase.queries.models.stored-result-use
  "Tracks references to a `stored_result` snapshot. Each row records one referencing entity:
  exactly one of `card_id` (a document cardEmbed's materialized Card) or `exploration_id`
  (the exploration that produced the snapshot) is set. Used for lifecycle/GC, by
  the cached card-query endpoint to validate that a client-supplied `stored_result_id` is actually
  paired with the card being read-checked, and by [[assert-can-view-card-snapshots!]] to enumerate
  every snapshot a Card renders from. Lives in the queries module alongside `:model/StoredResult`."
  (:require
   [metabase.queries.cached-result :as cached-result]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/StoredResultUse [_model] :stored_result_use)

(doto :model/StoredResultUse
  (derive :metabase/model)
  (derive :hook/timestamped?))

(t2/define-before-insert :model/StoredResultUse
  [row]
  (when (= (some? (:card_id row)) (some? (:exploration_id row)))
    (throw (ex-info "stored_result_use requires exactly one of :card_id or :exploration_id to be set"
                    {:card_id (:card_id row) :exploration_id (:exploration_id row)})))
  row)

(mu/defn carry-pairings-for-document!
  "Copy `(card_id, stored_result_id)` pairings onto newly created Cards for a document save.

  `pairs` is a seq of `[new-card-id stored-result-id]`. A pairing is inserted only when the
  snapshot is already reachable through this same document — i.e. a `stored_result_use` row
  exists for it against some Card whose `document_id` is `document-id`. That keeps the carry
  monotone: it can move an existing (document, snapshot) reachability onto another Card in that
  document, and can never widen a snapshot to a document that could not already read it."
  [document-id :- ms/PositiveInt
   pairs :- [:sequential [:tuple ms/PositiveInt ms/PositiveInt]]]
  (when (seq pairs)
    (let [distinct-pairs (distinct pairs)
          sr-ids         (into #{} (map second) distinct-pairs)
          doc-card-ids   (t2/select-pks-set :model/Card 'document_id document-id)
          reachable      (if (seq doc-card-ids)
                           (t2/select-fn-set :stored_result_id
                                             :model/StoredResultUse
                                             'card_id [:in doc-card-ids]
                                             'stored_result_id [:in sr-ids])
                           #{})]
      (doseq [[new-card-id sr-id] distinct-pairs
              :when (contains? reachable sr-id)]
        (t2/insert! :model/StoredResultUse
                    {:stored_result_id sr-id
                     :card_id          new-card-id})))))

(mu/defn assert-can-view-card-snapshots!
  "Throw a 403 unless the current user may be served *every* `stored_result` Card `card-id` renders
  from."
  [card-id :- ms/PositiveInt]
  (let [snapshots (t2/select :model/StoredResult
                             'id [:in ^:allow-subquery {:select ['stored_result_id]
                                                        :from   ['stored_result_use]
                                                        :where  ['= 'card_id card-id]}])]
    (when (empty? snapshots)
      (throw (ex-info (tru "This card has no cached results.") {:status-code 404})))
    (doseq [snapshot snapshots]
      (cached-result/assert-can-view-cached-result! snapshot))))
