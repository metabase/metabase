(ns metabase.mcp.v2.dashboards
  "The current-user redaction the v2 MCP dashboard reads apply before
   [[metabase.mcp.v2.projections/dashboard-row]] reshapes a hydrated dashboard.

   This reads `metabase.api.common/*current-user*` (through the model read checks) and so must be
   called as the requesting user; the projection it feeds is pure."
  (:require
   [metabase.models.interface :as mi]))

(set! *warn-on-reflection* true)

(defn- redact-dashcard
  [dashcard]
  (cond-> dashcard
    ;; The projection reads an absent `:card` the same way it reads an unhydrated one — as an id
    ;; with no name — so removing it is the whole redaction.
    (not (some-> (:card dashcard) mi/can-read?))
    (dissoc :card)

    (seq (:series dashcard))
    (update :series (partial mapv #(cond-> % (not (mi/can-read? %)) (select-keys [:id]))))))

(defn redact-dashboard
  "`dash`, hydrated with `[:dashcards :series :card]`, with the cards the current user cannot read
   reduced to their ids — the same collapse the REST dashboard response does."
  [dash]
  (update dash :dashcards (partial mapv redact-dashcard)))
