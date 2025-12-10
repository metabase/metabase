(ns metabase.embedding.util
  "Utility functions for common operations related to embedding.")

(def ^:private embedding-sdk-client "embedding-sdk-react")
(def ^:private embedded-analytics-js-client "embedding-simple")

(defn has-react-sdk-header?
  "Check if the client has indicated it is from the Modular Embedding SDK"
  [request]
  (= (get-in request [:headers "x-metabase-client"]) embedding-sdk-client))

(defn has-embedded-analytics-js-header?
  "Check if the client has indicated it is from Modular embedding"
  [request]
  (= (get-in request [:headers "x-metabase-client"]) embedded-analytics-js-client))

(defn is-modular-embedding-request?
  "Check if the request is either from Modular Embedding SDK or from Modular embedding"
  [request]
  (or (has-react-sdk-header? request)
      (has-embedded-analytics-js-header? request)))
