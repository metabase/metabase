(ns metabase.dependencies.items
  "The options that the `:items` functions of the dependencies specs take, and the helpers they build their queries
  with."
  (:require
   [metabase.util.honey-sql-2 :as h2x]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]))

(set! *warn-on-reflection* true)

(mr/def ::items-opts
  "What an `:items` function takes: the user whose readable items it selects (`:user-id`, `:is-superuser?`,
  `:is-data-analyst?`), the items it keeps by their archived state or that of their collection (`:include-archived`),
  whether it keeps the items in personal collections, the internal content such as Metabase Analytics, and the tables of
  the sample and audit databases, the card types it keeps, every one without `:card-types`, and the text the name or
  the location of an item contains, which a model applies when its items are searched."
  [:map {:closed true}
   [:user-id                       pos-int?]
   [:is-superuser?                 {:optional true} [:maybe :boolean]]
   [:is-data-analyst?              {:optional true} [:maybe :boolean]]
   [:include-archived              [:enum :exclude :all :only]]
   [:include-personal-collections? :boolean]
   [:include-internal?             :boolean]
   [:include-sample-databases?     :boolean]
   [:card-types                    {:optional true} [:maybe [:sequential [:or :keyword :string]]]]
   [:search-text                   {:optional true} [:maybe :string]]])

(mu/defn search-clause :- [:maybe ::h2x/honeysql-expr]
  "The rows whose `name-expr` or `location-expr` contains `search-text`, ignoring case, nil without one."
  [name-expr     :- ::h2x/honeysql-expr
   location-expr :- [:maybe ::h2x/honeysql-expr]
   search-text   :- [:maybe :string]]
  (when search-text
    (let [pattern (h2x/like-substring search-text)]
      [:or
       [:like [:lower name-expr] pattern]
       [:like [:lower location-expr] pattern]])))
