(ns metabase-enterprise.workspaces.context
  (:require
   [metabase.util.i18n :refer [tru]]
   [toucan2.core :as t2]))

(defn- fetch-entities [type model-select ids]
  (if (empty? ids)
    {}
    (let [id->entity (t2/select-fn->fn :id identity model-select :id [:in ids])]
      (when (not= (count ids) (count id->entity))
        (throw (ex-info (tru "Unable to find all graph entities in the appdb")
                        {:status-code   500
                         :type          type
                         :ids           ids
                         :transform-ids (remove id->entity ids)})))
      id->entity)))

(defn- fetch-transforms [transform-ids]
  (fetch-entities "transform" :model/Transform transform-ids))

(defn- fetch-tables [table-ids]
  (fetch-entities "table" [:model/Table :id :db_id :schema :name] table-ids))
