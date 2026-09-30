(ns metabase.embedding.util
  "Utility functions for common operations related to embedding.")

(def ^:private embedding-sdk-client "embedding-sdk-react")
(def ^:private embedded-analytics-js-client "embedding-simple")
(def ^:private data-app-client "data-app")

(defn has-react-sdk-header?
  "Check if the client has indicated it is from the Embedding SDK for React."
  [request]
  (= (get-in request [:headers "x-metabase-client"]) embedding-sdk-client))

(defn has-data-app-header?
  "Check if the client has indicated it is a sandboxed data app.

  Unlike its siblings here this one gates authorization, not behaviour:
  [[metabase.server.middleware.data-app-scope]] confines a request to the `data-app` scope
  on the strength of it, so the client name must stay in sync with
  `EMBEDDING_SDK_CONFIG.metabaseClientRequestHeader` on the FE."
  [request]
  (= (get-in request [:headers "x-metabase-client"]) data-app-client))

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
