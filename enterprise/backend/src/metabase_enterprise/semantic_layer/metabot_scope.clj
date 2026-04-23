(ns metabase-enterprise.semantic-layer.metabot-scope
  "Resolves the internal Metabot's retrieval scope for the `:metabot` catalog."
  (:require
   [metabase.metabot.config :as metabot.config]
   [metabase.premium-features.core :as premium-features]
   [toucan2.core :as t2]))

(defn internal-metabot-scope
  "`{:verified-only? <bool> :collection-id <nil|Long>}` matching what Metabot's Card query would apply."
  []
  (let [entity-id (get-in metabot.config/metabot-config [metabot.config/internal-metabot-id :entity-id])
        metabot   (t2/select-one :model/Metabot :entity_id entity-id)]
    {:verified-only? (and (boolean (:use_verified_content metabot))
                          (premium-features/has-feature? :content-verification))
     :collection-id  (:collection_id metabot)}))
