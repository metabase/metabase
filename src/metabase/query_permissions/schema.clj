(ns metabase.query-permissions.schema
  (:require
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.util.malli.registry :as mr]))

(mr/def ::resolved-source-ids
  "Everything [[metabase.query-permissions.impl/required-perms-for-query]] and the data-access lens read from a
  preprocessed query."
  [:map {:closed true}
   [:table-ids           {:optional true} [:set ::lib.schema.id/table]]
   [:table-query-ids     {:optional true} [:set ::lib.schema.id/table]]
   [:card-ids            {:optional true} [:set ::lib.schema.id/card]]
   [:native?             {:optional true} :boolean]
   [:referenced-card-ids {:optional true} [:set ::lib.schema.id/card]]
   [:query-digest        {:optional true} :string]])
