(ns metabase.lib.metric
  (:require
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.metadata.calculation :as lib.metadata.calculation]
   [metabase.shared.util.i18n :as i18n]))

(defmethod lib.metadata.calculation/display-name-method :metadata/metric
  [_query _stage-number metric-metadata]
  (or ((some-fn :display_name :name) metric-metadata)
      (i18n/tru "[Unknown Metric]")))

(defmethod lib.metadata.calculation/display-name-method :metric
  [query stage-number [_tag _opts metric-id-or-name]]
  (or (when (integer? metric-id-or-name)
        (when-let [metric-metadata (lib.metadata/metric query metric-id-or-name)]
          (lib.metadata.calculation/display-name query stage-number metric-metadata)))
      (i18n/tru "[Unknown Metric]")))
