(ns metabase.query-processor.util.transformations.common
  (:require
   [metabase.lib.core :as lib]
   [metabase.lib.schema.metadata :as lib.schema.metadata]
   [metabase.util.malli :as mu]))

(mu/defn update-aggregation-metadata-from-previous-stage-to-produce-correct-ref-in-current-stage :- ::lib.schema.metadata/column
  "Force a `[:field {} <name>]` ref."
  [col :- ::lib.schema.metadata/column]
  (-> col
      (assoc :lib/source              :source/previous-stage
             :lib/source-column-alias (:lib/desired-column-alias col))
      (lib/with-temporal-bucket (if (isa? ((some-fn :effective-type :base-type) col) :type/Temporal)
                                  ;; for temporal columns: set temporal type to `:default` to
                                  ;; prevent [[metabase.query-processor.middleware.auto-bucket-datetimes]] from
                                  ;; trying to mess with it.
                                  :default
                                  ;; for other columns: remove temporal type, it should be nil anyway but remove it to
                                  ;; be safe.
                                  nil))
      (lib/with-join-alias nil)
      (lib/with-binning nil)))
