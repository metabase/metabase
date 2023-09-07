(ns metabase.lib.drill-thru.zoom
  "[[metabase.lib.drill-thru.object-details/object-detail-drill]] has the logic for determining whether to return this
  drill as an option or not."
  (:require
   [metabase.lib.drill-thru.common :as lib.drill-thru.common]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.drill-thru :as lib.schema.drill-thru]
   [metabase.util.malli :as mu]))

(defmethod lib.drill-thru.common/drill-thru-info-method :drill-thru/zoom
  [_query _stage-number drill-thru]
  (select-keys drill-thru [:many-pks? :object-id :type]))

(mu/defmethod lib.drill-thru.common/drill-thru-method :drill-thru/zoom :- ::lib.schema/query
  [query         :- ::lib.schema/query
   _stage-number :- :int
   _drill        :- ::lib.schema.drill-thru/drill-thru.zoom]
  ;; this is just an identity transformation, see
  ;; https://metaboat.slack.com/archives/C04CYTEL9N2/p1693965932617369
  query)
