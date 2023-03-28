(ns metabase.lib.metric
  (:require
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.metadata.calculation :as lib.metadata.calculation]
   [metabase.shared.util.i18n :as i18n]))

(defn- resolve-metric [query [_tag _opts metric-id-or-name]]
  (when (integer? metric-id-or-name)
    (lib.metadata/metric query metric-id-or-name)))

(defmethod lib.metadata.calculation/display-name-method :metadata/metric
  [_query _stage-number metric-metadata]
  (or ((some-fn :display_name :name) metric-metadata)
      (i18n/tru "[Unknown Metric]")))

(defmethod lib.metadata.calculation/display-name-method :metric
  [query stage-number metric]
  (or (when-let [metadata (resolve-metric query metric)]
        (lib.metadata.calculation/display-name query stage-number metadata))
      (i18n/tru "[Unknown Metric]")))

(defmethod lib.metadata.calculation/column-name-method :metric
  [query stage-number metric]
  (or (when-let [metadata (resolve-metric query metric)]
        (lib.metadata.calculation/column-name query stage-number metadata))
      "metric"))

(defmethod lib.metadata.calculation/type-of-method :metric
  [query stage-number metric]
  (or (when-let [metadata (resolve-metric query metric)]
        (lib.metadata.calculation/type-of query stage-number metadata))
      :type/*))
