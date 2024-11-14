(ns metabase-enterprise.metabot-v3.tools.get-query-sources
  (:require
    [cheshire.core :as json]
    [clojure.set :as set]
    [metabase-enterprise.metabot-v3.tools.interface :as metabot-v3.tools.interface]
    [metabase.models.card :as card :refer [Card]]
    [metabase.models.interface :as mi]
    [metabase.models.table :as table :refer [Table]]
    [metabase.util.malli :as mu]
    [toucan2.core :as t2]))

(mu/defmethod metabot-v3.tools.interface/*invoke-tool* :metabot.tool/get-query-sources
  [_tool-name _args _context]
  (let [models (into []
                     (filter mi/can-read?)
                     (t2/select [Card :id :collection_id :database_id :name], :type :model, :archived false))
        tables (into []
                     (filter mi/can-read?)
                     (t2/select [Table :id :db_id :display_name], :active true))]
    {:output
     (json/generate-string (into []
                                 (concat
                                  (map (fn [model]
                                         (-> (select-keys model [:id :database_id :name])
                                             (merge {:type :model})))
                                       models)
                                  (map (fn [table]
                                         (-> (set/rename-keys table {:db_id :database_id, :display_name :name})
                                             (merge {:type :table})))
                                       tables))))}))
