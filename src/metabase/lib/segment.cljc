(ns metabase.lib.segment
  (:require
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.metadata.calculation :as lib.metadata.calculation]
   [metabase.shared.util.i18n :as i18n]))

(defmethod lib.metadata.calculation/display-name-method :metadata/segment
  [_query _stage-number segment-metadata]
  (or ((some-fn :display_name :name) segment-metadata)
      (i18n/tru "[Unknown Segment]")))

(defmethod lib.metadata.calculation/display-name-method :segment
  [query stage-number [_tag _opts segment-id-or-name]]
  (or (when (integer? segment-id-or-name)
        (when-let [segment-metadata (lib.metadata/segment query segment-id-or-name)]
          (lib.metadata.calculation/display-name query stage-number segment-metadata)))
      (i18n/tru "[Unknown Segment]")))
