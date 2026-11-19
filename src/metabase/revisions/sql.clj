(ns metabase.revisions.sql
  "The SQL that reads the Revisions of entities, which every module that lists entities with their last edit shares,
  kept free of the models of the revisions module so that those modules can require it."
  (:require
   [metabase.util.honey-sql-2 :as h2x]))

(defn newest-revision-clause
  "The where-clause true when the Revision under `alias` is the newest of the `model-name` entity whose id is the
  column `entity-id`, read as the one lookup of `max(id)` of that entity's Revisions."
  [alias model-name entity-id]
  [:= (keyword (str (name alias) ".id"))
   ^:allow-subquery {:select [[[:max :newest.id]]]
                     :from   [[:revision :newest]]
                     :where  [:and
                              [:= :newest.model (h2x/literal model-name)]
                              [:= :newest.model_id entity-id]]}])
