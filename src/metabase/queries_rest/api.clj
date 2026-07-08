(ns metabase.queries-rest.api
  (:require
   [metabase.api.macros :as api.macros]
   [metabase.queries-rest.api.card]
   [metabase.queries-rest.api.cards]))

(comment metabase.queries-rest.api.card/keep-me
         metabase.queries-rest.api.cards/keep-me)

(def ^{:arglists '([request respond raise])} card-routes
  "`/api/card/` routes."
  (api.macros/ns-handler 'metabase.queries-rest.api.card))

(def ^{:arglists '([request respond raise])} cards-routes
  "`/api/cards/` routes."
  (api.macros/ns-handler 'metabase.queries-rest.api.cards))
