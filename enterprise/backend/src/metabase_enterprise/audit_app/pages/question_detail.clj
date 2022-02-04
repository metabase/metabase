(ns metabase-enterprise.audit-app.pages.question-detail
  "Detail page for a single Card (Question)."
  (:require [metabase-enterprise.audit-app.interface :as audit.i]
            [metabase-enterprise.audit-app.pages.common :as common]
            [metabase-enterprise.audit-app.pages.common.card-and-dashboard-detail :as card-and-dash-detail]
            [metabase.models.card :refer [Card]]
            [metabase.util.schema :as su]
            [schema.core :as s]))

;; Get views of a Card broken out by a time `unit`, e.g. `day` or `day-of-week`.
(s/defmethod audit.i/internal-query ::views-by-time
  [_ card-id :- su/IntGreaterThanZero datetime-unit :- common/DateTimeUnitStr]
  (card-and-dash-detail/views-by-time "card" card-id datetime-unit))

;; Get cached views of a Card broken out by a time `unit`, e.g. `day` or `day-of-week`.
(s/defmethod audit.i/internal-query ::cached-views-by-time
  [_ card-id :- su/IntGreaterThanZero, datetime-unit :- common/DateTimeUnitStr]
  (card-and-dash-detail/cached-views-by-time card-id datetime-unit))

;; Get the revision history for a Card.
(s/defmethod audit.i/internal-query ::revision-history
  [_ card-id :- su/IntGreaterThanZero]
  (card-and-dash-detail/revision-history Card card-id))

;; Get a view log for a Card.
(s/defmethod audit.i/internal-query ::audit-log
  [_ card-id :- su/IntGreaterThanZero]
  (card-and-dash-detail/audit-log "card" card-id))

;; Average execution time broken out by period
(s/defmethod audit.i/internal-query ::avg-execution-time-by-time
  [_ card-id :- su/IntGreaterThanZero datetime-unit :- common/DateTimeUnitStr]
  (card-and-dash-detail/avg-execution-time-by-time card-id datetime-unit))
