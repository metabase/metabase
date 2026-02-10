(ns metabase.embedding.util
  "Utility functions for common operations related to embedding.")

(def ^:private embedding-sdk-client "embedding-sdk-react")
(def ^:private embedded-analytics-js-client "embedding-simple")

(defn has-react-sdk-header?
  "Check if the client has indicated it is from the Embedding SDK for React."
  [request]
  (= (get-in request [:headers "x-metabase-client"]) embedding-sdk-client))

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
