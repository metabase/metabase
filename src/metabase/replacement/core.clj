(ns metabase.replacement.core
  "The helpers that the replacement specs of the models are built with, over the query-level swaps of source-swap."
  (:require
   [metabase.lib.core :as lib]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.lib.schema.parameter :as lib.schema.parameter]
   [metabase.lib.util :as lib.util]
   [metabase.replacement.spec :as replacement.spec]
   [metabase.replacement.walk :as replacement.walk]
   [metabase.source-swap.core :as source-swap]
   [metabase.source-swap.schema :as source-swap.schema]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]))

(set! *warn-on-reflection* true)

(mu/defn valid-query? :- :boolean
  "Returns true if `maybe-query` has at least one stage.

  This is used to skip fully broken queries in the app db."
  [maybe-query :- [:maybe [:or ::lib.schema/query [:map {:closed true}]]]]
  (some? (seq (:stages maybe-query))))

(mr/def ::card-id->card
  [:map-of ::lib.schema.id/card :map])

(defn- card-query
  "The query of the card with `card-id` among `card-id->card`, or nil when it is absent or not valid."
  [card-id->card card-id]
  (when-some [card (get card-id->card card-id)]
    (let [query (:dataset_query card)]
      (when (valid-query? query)
        query))))

(defn- upgrade-source-card-ref
  "The upgraded `ref` that a parameter takes its values from in the card with `card-id`, or `ref` itself."
  [ref card-id card-id->card]
  (or (when (lib.util/field-clause? ref)
        (when-some [query (card-query card-id->card card-id)]
          (-> query
              lib/append-stage
              (source-swap/upgrade-field-ref -1 ref))))
      ref))

(mu/defn upgrade-parameter-source-card-refs :- [:sequential :map]
  "The `parameters` with the refs that they take their values from in cards upgraded, the cards being those of
  `card-id->card`."
  [parameters    :- [:sequential :map]
   card-id->card :- ::card-id->card]
  (replacement.walk/walk-parameter-source-card-refs parameters #(upgrade-source-card-ref %1 %2 card-id->card)))

(mu/defn upgrade-parameter-target :- ::lib.schema.parameter/target
  "The upgraded parameter `target` on the card with `card-id` among `card-id->card`, or `target` itself."
  [target        :- ::lib.schema.parameter/target
   card-id       :- ::lib.schema.id/card
   card-id->card :- ::card-id->card]
  (or (when-some [query (card-query card-id->card card-id)]
        (source-swap/upgrade-field-ref-in-parameter-target query target))
      target))

(mu/defn swap-parameter-target :- ::lib.schema.parameter/target
  "The parameter `target` on the card with `card-id` among `card-id->card` swapped to `new-source`, or `target`
  itself."
  [target        :- ::lib.schema.parameter/target
   card-id       :- ::lib.schema.id/card
   card-id->card :- ::card-id->card
   old-source    :- ::source-swap.schema/source
   new-source    :- ::source-swap.schema/source]
  (or (when-some [query (card-query card-id->card card-id)]
        (source-swap/swap-source-in-parameter-target query target old-source new-source))
      target))

(mu/defn swap-parameter-source-card-id :- [:sequential :map]
  "The `parameters` that take their values from the card `old-source` taking them from the card `new-source`, when
  both are cards."
  [parameters                      :- [:sequential :map]
   [old-source-type old-source-id] :- ::source-swap.schema/source
   [new-source-type new-source-id] :- ::source-swap.schema/source]
  (letfn [(swap-card-id [card-id]
            (if (and (= :card old-source-type)
                     (= :card new-source-type)
                     (= old-source-id card-id))
              new-source-id
              card-id))]
    (replacement.walk/walk-parameter-source-card-ids parameters swap-card-id)))

(mu/defn upgrade-definition-field-refs :- replacement.spec/Writes
  "The writes that upgrade the field refs of the `:definition` query of `row` of `model`."
  [model :- :keyword
   row   :- :map]
  (let [query (:definition row)]
    (if (valid-query? query)
      (let [query' (source-swap/upgrade-field-refs-in-query query)]
        (if (not= query query')
          [[model (:id row) {:definition query'}]]
          []))
      [])))

(mu/defn swap-definition-source :- [:maybe replacement.spec/Writes]
  "The writes that swap `old-source` for `new-source` in the `:definition` query of `row` of `model`, and set its
  `:table_id` to the `:table-id` that `query->database-and-table-ids` gives of the new query, or nil when the query
  is not valid."
  [model                         :- :keyword
   row                           :- :map
   old-source                    :- ::source-swap.schema/source
   new-source                    :- ::source-swap.schema/source
   query->database-and-table-ids :- ifn?]
  (let [query (:definition row)]
    (when (valid-query? query)
      (let [query'    (source-swap/swap-source-in-query query old-source new-source)
            table-id  (:table_id row)
            table-id' (:table-id (query->database-and-table-ids query'))
            changes   (cond-> {}
                        (not= query query')       (assoc :definition query')
                        (not= table-id table-id') (assoc :table_id table-id'))]
        (if (seq changes)
          [[model (:id row) changes]]
          [])))))
