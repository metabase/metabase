(ns metabase.models.interface)

(defprotocol IModelInstanceApiSerialze
  (api-serialize [this]
    "Called on all objects being written out by the API. Default implementations return THIS as-is, but models can provide
     custom methods to strip sensitive data, from non-admins, etc."))

(extend-protocol IModelInstanceApiSerialze
  Object
  (api-serialize [this]
    this)
  nil
  (api-serialize [_]
    nil))
