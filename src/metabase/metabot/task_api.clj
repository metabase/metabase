(ns metabase.metabot.task-api
  "Predefined AI tasks that are supported in Metabase.
  Generally, all will be stateful and require some level of configuration to work some external service(s).")

(defprotocol Embedder
  (single [_ string])
  (bulk [_ map-of-string-to-string]))

(defprotocol ContextGenerator
  (context [_ {:keys [prompt context-entities]}]))

(defprotocol MBQLInferencer
  (infer-mbql [_ {:keys [context prompt]}]))

