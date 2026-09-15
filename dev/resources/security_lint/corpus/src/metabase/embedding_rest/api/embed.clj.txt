(ns metabase.embedding-rest.api.embed
  "Security-lint test example: token-taking embed endpoints."
  (:require
   [metabase.api.macros :as api.macros]
   [metabase.embedding.jwt :as embed]))

(defn- unsign-and-translate-ids [token] (embed/unsign token))

(api.macros/defendpoint :get "/card/:token"
  "Verifies its token."
  [{:keys [token]} _query _body]
  (unsign-and-translate-ids token))

(api.macros/defendpoint :get "/theme/:token"
  "Trusts its token."
  [{:keys [token]} _query _body]
  token)
