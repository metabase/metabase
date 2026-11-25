(ns metabase.dependencies.items
  "The options that the `:items` functions of the dependencies specs take."
  (:require
   [metabase.util.malli.registry :as mr]))

(set! *warn-on-reflection* true)

(mr/def ::items-opts
  "What an `:items` function takes: the user whose readable items it selects (`:user-id`, `:is-superuser?`,
  `:is-data-analyst?`), the items it keeps by their archived state or that of their collection (`:include-archived`),
  whether it keeps the items in personal collections, the internal content such as Metabase Analytics, and the tables of
  the sample and audit databases, and the card types it keeps, every one without `:card-types`."
  [:map {:closed true}
   [:user-id                       pos-int?]
   [:is-superuser?                 {:optional true} [:maybe :boolean]]
   [:is-data-analyst?              {:optional true} [:maybe :boolean]]
   [:include-archived              [:enum :exclude :all :only]]
   [:include-personal-collections? :boolean]
   [:include-internal?             :boolean]
   [:include-sample-databases?     :boolean]
   [:card-types                    {:optional true} [:maybe [:sequential [:or :keyword :string]]]]])
