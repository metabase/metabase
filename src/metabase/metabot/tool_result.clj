(ns metabase.metabot.tool-result)

(defn model-output
  "Return the provider-facing output from a tool result map.

  Tools may opt into a smaller, semantically sufficient `:model-output`. When
  it is absent (or nil), preserve the existing `:output` behavior. The result
  map itself is never changed, so the full `:output`, `:structured-output`, and
  other client/audit fields remain available to their existing consumers."
  [result]
  (when (map? result)
    (or (:model-output result)
        (:output result))))
