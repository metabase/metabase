(ns metabase.embedding.util
  "Utility functions for common operations related to embedding."
  (:require
   [metabase.analytics.core :as analytics]
   [metabase.parameters.schema :as parameters.schema]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]))

(def ^:private embedding-sdk-client "embedding-sdk-react")
(def ^:private embedded-analytics-js-client "embedding-simple")

(defn has-react-sdk-header?
  "Check if the client has indicated it is from the Embedding SDK for React."
  [request]
  (= (get-in request [:headers "x-metabase-client"]) embedding-sdk-client))

(defn has-data-app-header?
  "Check if the client has indicated it is a sandboxed data app.

  Unlike its siblings here this one gates authorization, not behaviour:
  [[metabase.server.middleware.data-app-scope]] confines a request to the `data-app` scope
  on the strength of it."
  [request]
  (analytics/data-app-client? (get-in request [:headers "x-metabase-client"])))

(defn has-embedded-analytics-js-header?
  "Check if the client has indicated it is from modular embedding."
  [request]
  (= (get-in request [:headers "x-metabase-client"]) embedded-analytics-js-client))

(defn is-modular-embedding-request?
  "Check if the request is either from Embedding SDK for React or from modular embedding"
  [request]
  (or (has-react-sdk-header? request)
      (has-embedded-analytics-js-header? request)))

(defn is-modular-embedding-or-modular-embedding-sdk-request?
  "Check if the client is in modular embedding context."
  [request]
  (contains? #{embedding-sdk-client embedded-analytics-js-client}
             (get-in request [:headers "x-metabase-client"])))

(defn enabled-param-slugs
  "The set of param slugs (as keywords) from `dashboard-or-card-params` that may be exposed to embed viewers: only
  those explicitly whitelisted as \"enabled\" in `embedding-params`. Anything else — absent from the whitelist, or
  listed as \"disabled\" or \"locked\" — is not in the set, so it fails closed."
  [dashboard-or-card-params embedding-params]
  (into #{}
        (comp (filter #(= (get embedding-params (:slug %)) "enabled"))
              (map (comp keyword :slug)))
        dashboard-or-card-params))

(mu/defn enabled-params
  "Keep only the `parameters` an embed viewer may set: those whose slug is listed as `enabled` in the
  `embedding-params` whitelist. A `disabled`, `locked` or unlisted param is dropped."
  [parameters       :- [:maybe [:sequential ::parameters.schema/parameter]]
   embedding-params :- ms/EmbeddingParams]
  (let [param-slugs-to-keep (enabled-param-slugs parameters embedding-params)]
    (filter #(contains? param-slugs-to-keep (keyword (:slug %))) parameters)))
