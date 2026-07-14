(ns metabase.agent-api.models.mcp-export
  "The rows behind [[metabase.agent-api.exports]]: one generated export file per download link, with a TTL."
  (:require
   [methodical.core :as methodical]
   [toucan2.core :as t2])
  (:import
   (java.sql Blob)))

(set! *warn-on-reflection* true)

(methodical/defmethod t2/table-name :model/McpExport [_model] :mcp_export)

(defn- blob->bytes
  ^bytes [v]
  (if (instance? Blob v)
    (let [^Blob blob v]
      (.getBytes blob 1 (int (.length blob))))
    v))

(def ^:private transform-content
  "Coerce JDBC `Blob` values into plain byte arrays on read: H2 and MySQL hand back a `Blob`, Postgres a
   `byte[]`, and the download endpoint writes bytes."
  {:in  identity
   :out blob->bytes})

(t2/deftransforms :model/McpExport
  {:content transform-content})

(doto :model/McpExport
  (derive :metabase/model)
  (derive :hook/created-at-timestamped?))
