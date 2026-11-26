(ns metabase.remote-sync.schema
  (:require
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]))

(mr/def ::pk
  [:or :int :string])

(mr/def ::synced-filter-opts
  "The options of a synced filter clause: with `:include-archived?`, it selects the archived rows too that it would
  select if they weren't archived."
  [:maybe [:map {:closed true}
           [:include-archived? {:optional true} :boolean]]])

(mr/def ::worktree
  "A remote sync worktree, a checkout of a branch whose content lives in the same tables as the main app."
  [:map {:closed true}
   [:id         ms/PositiveInt]
   [:branch     :string]
   [:is_default :boolean]
   [:creator_id [:maybe ms/PositiveInt]]
   [:created_at ms/TemporalInstant]
   [:updated_at ms/TemporalInstant]])
