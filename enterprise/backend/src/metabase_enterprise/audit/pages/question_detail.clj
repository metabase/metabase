(ns metabase-enterprise.audit.pages.question-detail
  "Detail page for a single Card (Question)."
  (:require [metabase-enterprise.audit.pages.common :as common]
            [metabase-enterprise.audit.pages.common.card-and-dashboard-detail :as card-and-dash-detail]
            [metabase.models.card :refer [Card]]
            [metabase.util.schema :as su]
            [schema.core :as s]))

(s/defn ^:internal-query-fn views-by-time
  "Get views of a Card broken out by a time `unit`, e.g. `day` or `day-of-week`."
  [card-id :- su/IntGreaterThanZero, datetime-unit :- common/DateTimeUnitStr]
  (card-and-dash-detail/views-by-time "card" card-id datetime-unit))

(s/defn ^:internal-query-fn cached-views-by-time
  "Get cached views of a Card broken out by a time `unit`, e.g. `day` or `day-of-week`."
  [card-id :- su/IntGreaterThanZero, datetime-unit :- common/DateTimeUnitStr]
  (card-and-dash-detail/cached-views-by-time card-id datetime-unit))

(s/defn ^:internal-query-fn revision-history
  "Get the revision history for a Card."
  [card-id :- su/IntGreaterThanZero]
  (card-and-dash-detail/revision-history Card card-id))

(s/defn ^:internal-query-fn audit-log
  "Get a view log for a Card."
  [card-id :- su/IntGreaterThanZero]
  (card-and-dash-detail/audit-log "card" card-id))

(s/defn ^:internal-query-fn avg-execution-time-by-time
  "Average execution time broken out by period"
  [card-id :- su/IntGreaterThanZero, datetime-unit :- common/DateTimeUnitStr]
  (card-and-dash-detail/avg-execution-time-by-time card-id datetime-unit))
