(ns metabase.search.entity-retrieval.db
  "Application database queries for the entity retrieval module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module never talks to `toucan2.core` itself."
  (:require
   [metabase.toucan.core :as t2]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]))

(defn- pairs-where
  "The clause matching any of the `[entity-type entity-local-id]` `pairs`, as a balanced tree because row-value IN isn't
  portable across our app DBs."
  [pairs]
  (let [n (count pairs)]
    (case n
      0 (t2/fragment [:or])
      1 (let [[entity-type entity-local-id] (first pairs)]
          (t2/fragment [:and
                        [:= :entity_type entity-type]
                        [:= :entity_local_id entity-local-id]]))
      (let [[l r] (split-at (quot n 2) pairs)]
        (t2/fragment [:or (pairs-where l) (pairs-where r)])))))

(mu/defn ai-contexts-for-entities
  "The OsiAiContext rows for the given `[entity-type entity-local-id]` pairs."
  [entity-type+ids :- [:sequential [:tuple :string ms/PositiveInt]]]
  (t2/select :model/OsiAiContext {:where (pairs-where entity-type+ids)}))
