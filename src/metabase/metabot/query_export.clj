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

(defn- native-query?
  "Whether `query` has a native stage anywhere in it, in either the MBQL 5 or the legacy shape.
  [[metabase.metabot.util/extract-sql-content]] is no substitute: it returns nil for a multi-stage
  query on purpose, so a caller can't mistake stage 0's SQL for the whole thing."
  [query]
  (boolean
   (some (fn [node]
           (and (map? node)
                (or (= :mbql.stage/native (:lib/type node))
                    (= "mbql.stage/native" (get node "lib/type"))
                    (contains? node :native)
                    (contains? node "native"))))
         (tree-seq coll? seq query))))

(defn- source-query-text
  "A transform's stored source query as the model should see it, or nil when it must not be shown
  at all. Rendering happens here so it uses the query and provider the permission check already
  produced, rather than normalizing and resolving a second time."
  [query]
  (when-let [{:keys [query mp unchecked?]} (shared.content-store/query-for-export query false)]
    (cond
      ;; A cleared query renders the way it always has: native SQL verbatim, anything else through
      ;; the provider the check already built.
      mp         (or (metabot.u/extract-sql-content query)
                     (llm-shape/export-gated-query-for-llm query mp shared.content-store/default-store))
      ;; The check could not be made. A structured query still prints, resolving nothing, but
      ;; native SQL spells its table and column names out in the text, so it stays out entirely.
      unchecked? (when-not (native-query? query)
                   (llm-shape/export-gated-query-for-llm query nil shared.content-store/default-store))
      ;; Nothing to check: no database, or the database is gone and its metadata with it. An
      ;; orphaned transform still shows its source, which is what admins repair it from.
      :else      (llm-shape/transform-query->text query))))

(defn transform-with-exportable-source
  "Render a transform's stored source query for the model, or withhold it.
  The query is withheld when the current user may not run it, or when the permission check could
  not be made and the query is native. The rest of the transform stays readable either way."
  [transform]
  (if-let [text (source-query-text (get-in transform [:source :query]))]
    (assoc-in transform [:source :query] text)
    (update transform :source dissoc :query)))
