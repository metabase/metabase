(ns metabase-enterprise.data-complexity-score.metabot-scope
  "Resolves the internal Metabot's retrieval scope for the `:metabot` catalog."
  (:require
   [metabase-enterprise.data-complexity-score.db :as data-complexity-score.db]
   [metabase.metabot.config :as metabot.config]))

(defn internal-metabot-scope
  "`{:curated-only? <bool> :collection-id <nil|Long>}` matching the filters Metabot search applies."
  []
  (let [entity-id (get-in metabot.config/metabot-config [metabot.config/internal-metabot-id :entity-id])
        metabot   (data-complexity-score.db/metabot-by-entity-id entity-id)]
    ;; `use_verified_content` means "verified or curated content only" (see the note in
    ;; `metabase.metabot.models.metabot`). No premium-feature gate, mirroring the search index's
    ;; precomputed `curated` column: a curation signal can only be set while its feature is present,
    ;; so the signals are already feature-correct.
    {:curated-only? (boolean (:use_verified_content metabot))
     :collection-id (:collection_id metabot)}))
