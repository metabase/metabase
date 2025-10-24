(ns metabase.embedding.util
  "Utility functions for common operations related to embedding.")

(def ^:private embedding-sdk-client "embedding-sdk-react")

(defn has-react-sdk-header?
  "Check if the client has indicated it is from the Embedding SDK for React "
  [request]
  (= (get-in request [:headers "x-metabase-client"]) embedding-sdk-client))
