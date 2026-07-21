(ns metabase.usage-metadata.query-source
  "Pluggable sources of saved questions and models for candidate mining.

  A query source only chooses which Cards are analyzed. Candidate extraction, normalization,
  eligibility, ranking, and deduplication remain the responsibility of usage-metadata insights."
  (:require
   [java-time.api :as t]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defprotocol CandidateQuerySource
  "Something that can produce the IDs of saved queries to analyze."
  (card-ids [source]
    "Return a set of Card IDs. The miner subsequently restricts these to active questions and models."))

(defn candidate-query-source?
  "Whether `x` can supply saved queries to candidate mining."
  [x]
  (satisfies? CandidateQuerySource x))

(defrecord CollectionQuerySource [collection-id]
  CandidateQuerySource
  (card-ids [_]
    (let [selected-collection (or (t2/select-one [:model/Collection :id :location] :id collection-id)
                                  (throw (ex-info "Collection does not exist"
                                                  {:collection-id collection-id})))
          child-location     (str (:location selected-collection) collection-id "/")
          collection-ids     (conj (t2/select-pks-set :model/Collection
                                                      :location [:like (str child-location \%)])
                                   collection-id)]
      (t2/select-pks-set :model/Card
                         :collection_id [:in collection-ids]
                         :archived false
                         :type [:in [:question :model]]))))

(mu/defn collection :- [:fn candidate-query-source?]
  "Analyze active questions and models in `collection-id` and all of its descendant collections."
  [collection-id :- ms/PositiveInt]
  (->CollectionQuerySource collection-id))

(defrecord RecentViewLogQuerySource [days]
  CandidateQuerySource
  (card-ids [_]
    (t2/select-fn-set :model_id :model/ViewLog
                      :model "card"
                      :timestamp [:>= (t/minus (t/offset-date-time) (t/days days))])))

(mu/defn recent-views :- [:fn candidate-query-source?]
  "Analyze saved questions and models that have a Card view-log entry in the last `days` days."
  [days :- ms/PositiveInt]
  (->RecentViewLogQuerySource days))
