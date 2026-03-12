(ns metabase.lib.metadata.util
  "Helpers for use in `lib.metadata.*` without creating circular deps."
  (:require
   [metabase.lib.metadata.protocols :as lib.metadata.protocols]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.lib.schema.metadata :as lib.schema.metadata]
   [metabase.util.malli :as mu]))

(mu/defn ->metadata-provider :- ::lib.schema.metadata/metadata-provider
  "Get a MetadataProvider from something that can provide one."
  ([metadata-providerable]
   (->metadata-provider metadata-providerable nil))

  ([metadata-providerable :- ::lib.schema.metadata/metadata-providerable
    database-id           :- [:maybe
                              [:or
                               ::lib.schema.id/database
                               ::lib.schema.id/saved-questions-virtual-database]]]
   (cond
     (lib.metadata.protocols/metadata-provider? metadata-providerable)
     metadata-providerable

     (map? metadata-providerable)
     (some-> metadata-providerable :lib/metadata ->metadata-provider)

     ((some-fn fn? var?) metadata-providerable)
     (if (pos-int? database-id)
       (metadata-providerable database-id)
       (throw (ex-info "Cannot initialize new metadata provider without a Database ID"
                       {:f metadata-providerable}))))))
