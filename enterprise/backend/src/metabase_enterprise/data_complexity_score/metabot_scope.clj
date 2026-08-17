(ns metabase-enterprise.data-complexity-score.metabot-scope
  "Resolves the internal Metabot's retrieval scope for the `:metabot` catalog."
  (:require
   [metabase-enterprise.data-complexity-score.appdb-source :as appdb-source]
   [metabase.metabot.config :as metabot.config]
   [toucan2.core :as t2]))

(defn internal-metabot-scope
  "`{:curated-only? <bool> :collection-id <nil|Long>}` matching the filters Metabot search applies.
  Returns a default-open scope (`{:curated-only? false :collection-id nil}`) when the CLI is pointed
  at an appdb older than the `metabot` table — see [[appdb-source/*tolerate-missing-relations?*]]."
  []
  (let [entity-id (get-in metabot.config/metabot-config [metabot.config/internal-metabot-id :entity-id])
        metabot   (appdb-source/with-missing-relation-fallback
                    ::metabot-row nil
                    #(t2/select-one :model/Metabot :entity_id entity-id))]
    ;; `use_verified_content` means "verified or curated content only" (see the note in
    ;; `metabase.metabot.models.metabot`). No premium-feature gate, mirroring the search index's
    ;; precomputed `curated` column: a curation signal can only be set while its feature is present,
    ;; so the signals are already feature-correct.
    {:curated-only? (boolean (:use_verified_content metabot))
     :collection-id (:collection_id metabot)}))
