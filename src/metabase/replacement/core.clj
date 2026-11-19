(ns metabase.replacement.core
  (:require
   [metabase.lib.core :as lib]
   [metabase.lib.metadata.protocols :as lib.metadata.protocols]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.lib.schema.parameter :as lib.schema.parameter]
   [metabase.lib.schema.ref :as lib.schema.ref]
   [metabase.lib.util :as lib.util]
   [metabase.replacement.compatibility :as replacement.compatibility]
   [metabase.replacement.mbql :as replacement.mbql]
   [metabase.replacement.native :as replacement.native]
   [metabase.replacement.schema :as replacement.schema]
   [metabase.replacement.spec :as replacement.spec]
   [metabase.replacement.util :as replacement.util]
   [metabase.replacement.walk :as replacement.walk]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]))

(set! *warn-on-reflection* true)

(mu/defn check-column-mappings :- [:sequential ::replacement.schema/column-mapping]
  "Build column mappings between source and target columns."
  [metadata-providerable :- ::lib.metadata.protocols/metadata-providerable
   old-source            :- ::replacement.schema/source
   new-source            :- ::replacement.schema/source]
  (replacement.compatibility/check-column-mappings metadata-providerable old-source new-source))

(mu/defn upgrade-field-ref :- ::lib.schema.ref/ref
  "Generate a new ref for a column."
  [query        :- ::lib.schema/query
   stage-number :- :int
   field-ref    :- :mbql.clause/field]
  (if (lib/native-only-query? query)
    field-ref
    (replacement.mbql/upgrade-field-ref query stage-number field-ref)))

(mu/defn upgrade-field-refs-in-query :- ::lib.schema/query
  "Upgrade all field refs in `query` to use name-based field refs when possible."
  [query :- ::lib.schema/query]
  (cond-> query
    (not (lib/native-only-query? query))
    replacement.mbql/upgrade-field-refs-in-mbql-stages))

(mu/defn upgrade-field-ref-in-parameter-target :- ::lib.schema.parameter/target
  "If the parameter target is a field ref, upgrade it to use a name-based field ref when possible."
  [query  :- ::lib.schema/query
   target :- ::lib.schema.parameter/target]
  (if (lib/native-only-query? query)
    target
    (replacement.mbql/upgrade-field-ref-in-parameter-mbql-target query target)))

(mu/defn swap-source-in-query :- ::lib.schema/query
  "Updates the query to use the new source table or card."
  [query      :- ::lib.schema/query
   old-source :- ::replacement.schema/source
   new-source :- ::replacement.schema/source]
  (cond-> query
    (lib/any-native-stage? query)
    (replacement.native/swap-source-in-native-stages old-source new-source)

    (not (lib/native-only-query? query))
    (replacement.mbql/swap-source-in-mbql-stages old-source new-source)))

(mu/defn swap-source-in-parameter-target :- ::lib.schema.parameter/target
  "If the parameter target is a field ref, swap it to reference the new source."
  [query      :- ::lib.schema/query
   target     :- ::lib.schema.parameter/target
   old-source :- ::replacement.schema/source
   new-source :- ::replacement.schema/source]
  (if (lib/native-only-query? query)
    target
    (replacement.mbql/swap-source-in-parameter-mbql-target query target old-source new-source)))

(mr/def ::card-id->card
  [:map-of ::lib.schema.id/card :map])

(defn- card-query
  "The query of the card with `card-id` among `card-id->card`, or nil when it is absent or not valid."
  [card-id->card card-id]
  (when-some [card (get card-id->card card-id)]
    (let [query (:dataset_query card)]
      (when (replacement.util/valid-query? query)
        query))))

(defn- upgrade-source-card-ref
  "The upgraded `ref` that a parameter takes its values from in the card with `card-id`, or `ref` itself."
  [ref card-id card-id->card]
  (or (when (lib.util/field-clause? ref)
        (when-some [query (card-query card-id->card card-id)]
          (-> query
              lib/append-stage
              (upgrade-field-ref -1 ref))))
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
        (upgrade-field-ref-in-parameter-target query target))
      target))

(mu/defn swap-parameter-target :- ::lib.schema.parameter/target
  "The parameter `target` on the card with `card-id` among `card-id->card` swapped to `new-source`, or `target`
  itself."
  [target        :- ::lib.schema.parameter/target
   card-id       :- ::lib.schema.id/card
   card-id->card :- ::card-id->card
   old-source    :- ::replacement.schema/source
   new-source    :- ::replacement.schema/source]
  (or (when-some [query (card-query card-id->card card-id)]
        (swap-source-in-parameter-target query target old-source new-source))
      target))

(mu/defn swap-parameter-source-card-id :- [:sequential :map]
  "The `parameters` that take their values from the card `old-source` taking them from the card `new-source`, when
  both are cards."
  [parameters                      :- [:sequential :map]
   [old-source-type old-source-id] :- ::replacement.schema/source
   [new-source-type new-source-id] :- ::replacement.schema/source]
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
    (if (replacement.util/valid-query? query)
      (let [query' (upgrade-field-refs-in-query query)]
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
   old-source                    :- ::replacement.schema/source
   new-source                    :- ::replacement.schema/source
   query->database-and-table-ids :- ifn?]
  (let [query (:definition row)]
    (when (replacement.util/valid-query? query)
      (let [query'    (swap-source-in-query query old-source new-source)
            table-id  (:table_id row)
            table-id' (:table-id (query->database-and-table-ids query'))
            changes   (cond-> {}
                        (not= query query')       (assoc :definition query')
                        (not= table-id table-id') (assoc :table_id table-id'))]
        (if (seq changes)
          [[model (:id row) changes]]
          [])))))
