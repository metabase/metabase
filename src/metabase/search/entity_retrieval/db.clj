(ns metabase.search.entity-retrieval.db
  "Application database queries for the entity retrieval module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module never talks to `toucan2.core` itself."
  (:require
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [metabase.warehouse-schema-overlay.core :as warehouse-schema-overlay]
   [toucan2.core :as t2]))

(mu/defn ai-contexts-for-entities
  "The human-approved OsiAiContext rows for the given `[entity-type entity-local-id]` pairs."
  [entity-type+ids :- [:sequential [:tuple :string ms/PositiveInt]]]
  ;; row-value IN isn't portable across our app DBs, so match the wanted (type, id) pairs with OR-of-ANDs.
  (t2/select :model/OsiAiContext
             {:where [:and
                      [:= :data_source "human"]
                      (into [:or]
                            (map (fn [[entity-type entity-local-id]]
                                   [:and
                                    [:= :entity_type entity-type]
                                    [:= :entity_local_id entity-local-id]]))
                            entity-type+ids)]}))

(mu/defn member-rows
  "Read source fields matching a membership predicate, including Table user settings."
  [model :- :keyword, fields :- [:sequential :keyword], where :- vector?]
  (t2/select (into [model] fields)
             (cond-> {:where where}
               (= model :model/Table) (assoc :from [(warehouse-schema-overlay/table-query)]))))

(mu/defn parent-id
  "Read the parent key of a via-parent entity."
  [model :- :keyword, fk :- :keyword, id :- ms/PositiveInt]
  (t2/select-one-fn fk model :id id))

(mu/defn raw-ai-context-rows
  "Read raw JSON for one type and a bounded set of entity IDs."
  [entity-type :- :string, ids :- [:sequential ms/PositiveInt]]
  (t2/query {:select [:entity_type :entity_local_id :ai_context]
             :from   [:osi_ai_context]
             :where  [:and [:= :entity_type entity-type] [:in :entity_local_id (vec ids)]]}))
