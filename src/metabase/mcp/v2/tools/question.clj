(ns metabase.mcp.v2.tools.question
  "The v2 MCP `question` write tool: resolves one of three query sources — `query_handle`
   (a handle from an execute tool), inline `query` (MBQL 5), or `native` (raw SQL) — into a
   `dataset_query` map for card creation."
  (:require
   [metabase.api.common :as api]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.mcp.v2.common :as common]))

(set! *warn-on-reflection* true)

(def ^:private tag-type->kw
  {"text" :text "number" :number "date" :date "dimension" :dimension})

(defn- ->lib-template-tag
  "Map the tool's tag shape onto `existing-tag` (the lib-extracted template-tag map, which
   already carries `:id`/`:name`/`:display-name`). `dimension` tags additionally carry a
   pMBQL field ref (`dimension`) and a widget type (`widget_type`)."
  [existing-tag {tag-type :type :keys [display_name dimension widget_type required default]}]
  (let [t (or (tag-type->kw tag-type)
              (common/throw-teaching-error
               (format "Invalid template tag type %s — use \"text\", \"number\", \"date\", or \"dimension\"."
                       (pr-str tag-type))))]
    (cond-> (assoc existing-tag :type t)
      display_name (assoc :display-name display_name)
      (some? required) (assoc :required (boolean required))
      (some? default) (assoc :default default)
      (= t :dimension) (assoc :dimension dimension :widget-type (keyword widget_type)))))

(defn- apply-template-tags
  "Apply caller-supplied `template_tags` to a native `query`. Every supplied tag name must
   appear in the SQL (i.e. among the tags `lib/native-query` auto-extracted); unknown names
   are a teaching error naming the tag."
  [query template_tags]
  (if (empty? template_tags)
    query
    (let [extracted (get-in query [:stages 0 :template-tags])
          present (into #{} (map :name) extracted)
          existing-by-name (into {} (map (juxt :name identity)) extracted)]
      (doseq [tag-name (keys template_tags)]
        (when-not (contains? present (name tag-name))
          (common/throw-teaching-error
           (format "Template tag %s does not appear in the SQL — add {{%s}} to the query or drop the tag."
                   (str "{{" (name tag-name) "}}") (name tag-name)))))
      (lib/with-template-tags
        query
        (into {}
              (map (fn [[tag-name tag]]
                     (let [nm (name tag-name)]
                       [nm (->lib-template-tag (get existing-by-name nm) tag)])))
              template_tags)))))

#_{:clj-kondo/ignore [:unused-private-var]} ; wired into the tool handler in Task 4
(defn- resolve-query-source
  "Resolve exactly one query source to a `dataset_query` map. `query_handle` re-runs the
   save-path guards (native allowed); `query` is inline MBQL 5; `native` is built from raw SQL."
  [{:keys [query_handle query native]} session-id]
  (let [sources (cond-> []
                  query_handle (conj :query_handle)
                  query        (conj :query)
                  native       (conj :native))]
    (when-not (= 1 (count sources))
      (common/throw-teaching-error
       "Pass exactly one query source: `query_handle` (a handle from an execute tool), `query` (inline MBQL 5), or `native` ({database_id, sql})."))
    (cond
      query_handle
      (:query (common/resolve-query-handle-for-save! session-id api/*current-user-id* query_handle))

      query
      (lib-be/normalize-query query)

      native
      (let [{:keys [database_id sql template_tags]} native
            mp (lib-be/application-database-metadata-provider database_id)]
        (-> (lib/native-query mp sql)
            (apply-template-tags template_tags))))))
