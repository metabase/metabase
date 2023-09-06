(ns metabase.lib.drill-thru.pk
  "[[metabase.lib.drill-thru.object-details/object-detail-drill]] has the logic for determining whether to return this
  drill as an option or not."
  (:require
   [metabase.lib.drill-thru.common :as lib.drill-thru.common]
   [metabase.lib.filter :as lib.filter]))

(defmethod lib.drill-thru.common/drill-thru-info-method :drill-thru/pk
  [_query _stage-number drill-thru]
  (select-keys drill-thru [:many-pks? :object-id :type]))

(defmethod lib.drill-thru.common/drill-thru-method :drill-thru/pk
  [query stage-number {:keys [column object-id]} & _]
  ;; This type is only used when there are multiple PKs and one was selected - [= pk x] filter.
  (lib.filter/filter query stage-number (lib.filter/= column object-id)))
