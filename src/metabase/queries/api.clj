(ns metabase.queries.api
  (:require
   [metabase.api.macros :as api.macros]
   [metabase.queries.api.card]
   [metabase.queries.api.cards]))

(comment metabase.queries.api.card/keep-me
         metabase.queries.api.cards/keep-me)

(def ^{:arglists '([request respond raise])} card-routes
  "`/api/card/` routes."
  (api.macros/ns-handler 'metabase.queries.api.card))

(def ^{:arglists '([request respond raise])} cards-routes
  "`/api/cards/` routes."
  (api.macros/ns-handler 'metabase.queries.api.cards))
