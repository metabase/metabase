(ns metabase-enterprise.audit-app.pages.question-detail
  "Detail page for a single Card (Question)."
  (:require
   [metabase-enterprise.audit-app.interface :as audit.i]
   [metabase-enterprise.audit-app.pages.common :as common]
   [metabase-enterprise.audit-app.pages.common.card-and-dashboard-detail
    :as card-and-dash-detail]
   [metabase.models.card :refer [Card]]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]))

;; Get views of a Card broken out by a time `unit`, e.g. `day` or `day-of-week`.
(mu/defmethod audit.i/internal-query ::views-by-time
  [_query-type
   card-id       :- ms/PositiveInt
   datetime-unit :- common/DateTimeUnitStr]
  (card-and-dash-detail/views-by-time "card" card-id datetime-unit))

;; Get cached views of a Card broken out by a time `unit`, e.g. `day` or `day-of-week`.
(mu/defmethod audit.i/internal-query ::cached-views-by-time
  [_query-type
   card-id       :- ms/PositiveInt
   datetime-unit :- common/DateTimeUnitStr]
  (card-and-dash-detail/cached-views-by-time card-id datetime-unit))

;; Get the revision history for a Card.
(mu/defmethod audit.i/internal-query ::revision-history
  [_query-type card-id :- ms/PositiveInt]
  (card-and-dash-detail/revision-history Card card-id))

;; Get a view log for a Card.
(mu/defmethod audit.i/internal-query ::audit-log
  [_query-type card-id :- ms/PositiveInt]
  (card-and-dash-detail/audit-log "card" card-id))

;; Average execution time broken out by period
(mu/defmethod audit.i/internal-query ::avg-execution-time-by-time
  [_query-type
   card-id       :- ms/PositiveInt
   datetime-unit :- common/DateTimeUnitStr]
  (card-and-dash-detail/avg-execution-time-by-time card-id datetime-unit))
