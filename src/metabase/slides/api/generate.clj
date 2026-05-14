(ns metabase.slides.api.generate
  "`/api/slides/generate` — AI-driven slide deck generation. Placeholder; the
   real handler is added in a follow-up step."
  (:require
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.util.malli.schema :as ms]))

#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :post "/generate"
  "Generate slides from a prompt (stub)."
  [_route-params
   _query-params
   _body :- [:map [:prompt ms/NonBlankString]]]
  {:slides []})

(def ^{:arglists '([request respond raise])} routes
  "`/api/slides/generate` routes."
  (api.macros/ns-handler *ns* +auth))
