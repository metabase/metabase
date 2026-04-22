(ns metabase-enterprise.semantic-layer.metabot-scope
  "Resolves the internal Metabot's retrieval scope for the `:metabot` catalog.
  Separate ns so the scoring code stays free of settings/feature-flag/Metabot-row reads.
  Shared by the HTTP endpoint and the scheduled job."
  (:require
   [metabase.metabot.config :as metabot.config]
   [metabase.premium-features.core :as premium-features]
   [toucan2.core :as t2]))

(defn internal-metabot-scope
  "`{:verified-only? <bool> :collection-id <nil|Long>}` matching what the internal Metabot's Card
  query would apply."
  []
  (let [metabot (t2/select-one :model/Metabot
                               :entity_id (get-in metabot.config/metabot-config
                                                  [metabot.config/internal-metabot-id :entity-id]))]
    {:verified-only? (and (premium-features/has-feature? :content-verification)
                          (boolean (:use_verified_content metabot)))
     :collection-id  (:collection_id metabot)}))
