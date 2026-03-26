(ns metabase.metabot.core
  "API namespace for the `metabase.metabot` module."
  (:require
   [metabase.metabot.api]
   [potemkin :as p]))

(p/import-vars
 [metabase.metabot.api
  routes])

;; TODO: Port analyze-chart to use the native LLM infrastructure
;; instead of the deleted `metabase.metabot.client`.
;; The frontend (`AIQuestionAnalysisSidebar`, `useDashCardAnalysis`) actively calls
;; `POST /api/ai-entity-analysis/analyze-chart` which hits this function.
(defn analyze-chart
  "Stub for legacy analyze-chart"
  [_chart-data]
  (throw (ex-info "Legacy Metabot AI-service function is no longer available: analyze-chart"
                  {:status-code 501
                   :function    :analyze-chart})))
