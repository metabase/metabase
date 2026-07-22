(ns metabase-enterprise.data-studio.api.seed
  "`/api/ee/data-studio/seed` endpoints. Seeds are git-authored: they're created and edited as
  `seeds/<name>.csv` in the remote-sync repo and materialized on pull, so this surface is
  read-only. It exists for the Library UI to list what's materialized."
  (:require
   [metabase-enterprise.data-studio.seeds :as seeds]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.util.malli.schema :as ms]))

(set! *warn-on-reflection* true)

(def ^:private SeedResponse
  [:sequential
   [:map
    [:id ms/PositiveInt]
    [:name :string]
    [:table_id [:maybe ms/PositiveInt]]
    [:collection_id [:maybe ms/PositiveInt]]
    [:csv_hash [:maybe :string]]
    [:last_synced_sha [:maybe :string]]
    [:sync_error [:maybe :string]]]])

(api.macros/defendpoint :get "/" :- SeedResponse
  "List all materialized seeds."
  []
  (api/check-data-analyst)
  (seeds/list-seeds))

(def ^{:arglists '([request respond raise])} routes
  "`/api/ee/data-studio/seed` routes."
  (api.macros/ns-handler *ns* +auth))
