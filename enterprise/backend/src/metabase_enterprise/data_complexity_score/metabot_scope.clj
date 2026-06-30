(ns metabase-enterprise.data-complexity-score.metabot-scope
  "Resolves the internal Metabot's retrieval scope for the `:metabot` catalog."
  (:require
   [metabase-enterprise.data-complexity-score.appdb-source :as appdb-source]
   [metabase.metabot.config :as metabot.config]
   [metabase.premium-features.core :as premium-features]
   [toucan2.core :as t2]))

(defn internal-metabot-scope
  "`{:verified-only? <bool> :collection-id <nil|Long>}` matching what Metabot's Card query would
  apply. Returns a default-open scope (`{:verified-only? false :collection-id nil}`) when the
  CLI is pointed at an appdb older than the `metabot` table — see
  [[appdb-source/*tolerate-missing-relations?*]]."
  []
  (let [entity-id (get-in metabot.config/metabot-config [metabot.config/internal-metabot-id :entity-id])
        metabot   (appdb-source/with-missing-relation-fallback
                    ::metabot-row nil
                    #(t2/select-one :model/Metabot :entity_id entity-id))]
    {:verified-only? (and (boolean (:use_verified_content metabot))
                          (premium-features/has-feature? :content-verification))
     :collection-id  (:collection_id metabot)}))
