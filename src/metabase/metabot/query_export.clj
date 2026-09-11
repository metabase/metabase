(ns metabase.metabot.query-export
  "Whether a query Metabot is about to put in front of the model may be shown at all. Rendering one
  resolves table and field ids to names through an unfiltered metadata provider, so the permission
  gate in [[metabase.metabot.tools.shared.content-store]] runs first and this namespace turns its
  answer into what the caller renders."
  (:require
   [metabase.metabot.tools.shared.content-store :as shared.content-store]))

(set! *warn-on-reflection* true)

(defn exportable-query?
  "May the current user see `query` rendered with its ids resolved to names? A query carrying no
  `:database` only ever pprints, so it passes."
  [query]
  (some? (shared.content-store/query-for-export query false)))

(defn transform-with-exportable-source
  "`transform` with its stored source query withheld unless the current user may run it. Rendering
  the source resolves table and field ids to names; the rest of the transform stays readable
  either way."
  [transform]
  (if (exportable-query? (get-in transform [:source :query]))
    transform
    (update transform :source dissoc :query)))
