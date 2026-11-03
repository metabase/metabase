(ns metabase-enterprise.data-complexity-score.metabot-scope
  "Resolves the internal Metabot's retrieval scope for the `:metabot` catalog."
  (:require
   [metabase-enterprise.data-complexity-score.appdb-source :as appdb-source]
   [metabase-enterprise.data-complexity-score.db :as data-complexity-score.db]
   [metabase.metabot.config :as metabot.config]))

(defn internal-metabot-scope
  "Return `{:curated-only? <bool> :collection-id <nil|Long>}`, matching the filters Metabot search applies.
  The scope is open (`{:curated-only? false :collection-id nil}`) on an appdb older than the `metabot` table when
  `degraded-signals` is set; see [[appdb-source/with-missing-relation-fallback]]."
  ([]
   (internal-metabot-scope nil))
  ([degraded-signals]
   (let [metabot (appdb-source/with-missing-relation-fallback
                   degraded-signals ::metabot-row nil
                   #(data-complexity-score.db/metabot-by-entity-id metabot.config/internal-metabot-id))]
     ;; `use_verified_content` means "verified or curated content only" (see the note in
     ;; `metabase.metabot.models.metabot`). No premium-feature gate, mirroring the search index's
     ;; precomputed `curated` column: a curation signal can only be set while its feature is present,
     ;; so the signals are already feature-correct.
     {:curated-only? (boolean (:use_verified_content metabot))
      :collection-id (:collection_id metabot)})))
