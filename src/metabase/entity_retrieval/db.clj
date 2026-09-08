(ns metabase.entity-retrieval.db
  "Application database queries for the entity retrieval module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module never talks to `toucan2.core` itself."
  (:require
   [metabase.osi.schema :as osi.schema]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(mu/defn ai-contexts-for-entities :- [:sequential ::osi.schema/osi-ai-context]
  "The OsiAiContext rows for the given `[entity-type entity-local-id]` pairs."
  [entity-type+ids :- [:sequential [:tuple :string ms/PositiveInt]]]
  ;; row-value IN isn't portable across our app DBs, so match the wanted (type, id) pairs with OR-of-ANDs.
  (t2/select :model/OsiAiContext
             {:where (into [:or]
                           (map (fn [[entity-type entity-local-id]]
                                  [:and
                                   [:= :entity_type entity-type]
                                   [:= :entity_local_id entity-local-id]]))
                           entity-type+ids)}))
