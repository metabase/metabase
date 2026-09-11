(ns metabase.metabot.query-export
  "Whether a query Metabot is about to put in front of the model may be shown at all, and in what
  form. Rendering one resolves table and field ids to names through an unfiltered metadata
  provider, so the permission check in [[metabase.metabot.tools.shared.content-store]] runs first
  and this namespace turns its answer into the text the caller renders."
  (:require
   [metabase.metabot.tools.shared.content-store :as shared.content-store]
   [metabase.metabot.tools.shared.llm-shape :as llm-shape]
   [metabase.metabot.util :as metabot.u]))

(set! *warn-on-reflection* true)

(defn- source-query-text
  "A transform's stored source query as the model should see it, or nil when it must not be shown
  at all. Rendering happens here so it uses the query and provider the permission check already
  produced instead of normalizing and resolving a second time."
  [query]
  (when-let [[checked mp] (shared.content-store/query-for-export query false)]
    (if-let [sql (metabot.u/extract-sql-content checked)]
      ;; Native SQL renders verbatim, as it always has, but only once the check has actually run.
      ;; Its table and column names are already plain text, so having no provider hides nothing.
      (when mp sql)
      (llm-shape/export-gated-query-for-llm checked mp shared.content-store/default-store))))

(defn transform-with-exportable-source
  "`transform` with its stored source query rendered for the model, or withheld when the current
  user may not run it. The rest of the transform stays readable either way."
  [transform]
  (if-let [text (source-query-text (get-in transform [:source :query]))]
    (assoc-in transform [:source :query] text)
    (update transform :source dissoc :query)))
