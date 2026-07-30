(ns metabase.mcp.v2.template-tags
  "The v2 template-tag write dialect, shared by `question_write` (saving a native card) and
   `execute_sql` (exercising SQL — including field filters — before it is saved): map the tool's
   underscore-keyed tag shape onto the lib template-tag maps auto-extracted from the SQL."
  (:require
   [clojure.string :as str]
   [metabase.lib.core :as lib]
   [metabase.mcp.v2.common :as common]
   [metabase.mcp.v2.skills :as skills]))

(set! *warn-on-reflection* true)

(def ^:private tag-type->kw
  {"text" :text "number" :number "date" :date "boolean" :boolean
   "dimension" :dimension "temporal-unit" :temporal-unit})

(defn- tag-field-id
  "The field the tag binds: `field_id` (the write dialect), or the id embedded in a read-shape
   `dimension` ref — `[\"field\", <id>, opts]` legacy or `[\"field\", opts, <id>]` MBQL 5 — so the
   tags `get_content` returns round-trip through this tool unchanged."
  [{:keys [field_id dimension]}]
  (or field_id
      (when (sequential? dimension)
        (some #(when (or (int? %) (common/entity-id? %)) %) (rest dimension)))))

(defn- ->lib-template-tag
  "Map the tool's tag shape onto `existing-tag` (the lib-extracted template-tag map, which
   already carries `:id`/`:name`/`:display-name`). `dimension` and `temporal-unit` tags
   additionally carry a field (`field_id` — numeric id or 21-char entity_id, resolved here and
   built into a pMBQL field ref, since a JSON caller cannot construct one directly: it requires
   a `:lib/uuid`); `dimension` tags also carry a widget type (`widget_type`). Alongside the
   underscore write dialect, the kebab-case read shape `get_content` emits (`display-name`,
   `widget-type`, a `dimension` ref) is accepted, so a read-modify-write round-trip needs no
   translation."
  [existing-tag {tag-type :type :keys [display_name widget_type required default] :as tag}]
  (let [t            (or (tag-type->kw tag-type)
                         (common/throw-teaching-error
                          (format "Invalid template tag type %s — use \"text\", \"number\", \"date\", \"boolean\", \"dimension\", or \"temporal-unit\".\n%s"
                                  (pr-str tag-type) skills/template-tag-contract)))
        display-name (or display_name (:display-name tag))
        widget-type  (or widget_type (:widget-type tag))
        field-ref?   (contains? #{:dimension :temporal-unit} t)
        field-id     (when field-ref? (tag-field-id tag))]
    (when (and (= t :dimension) (str/blank? widget-type))
      (common/throw-teaching-error
       (str "A dimension template tag requires a widget_type, e.g. \"string/=\", \"number/=\", or \"date/all-options\".\n"
            skills/template-tag-contract)))
    (when (and field-ref? (nil? field-id))
      (common/throw-teaching-error
       (format "A %s template tag requires a field_id — the numeric id or 21-character entity_id of the column it binds.\n%s"
               (name t) skills/template-tag-contract)))
    (cond-> (assoc existing-tag :type t)
      display-name (assoc :display-name display-name)
      (some? required) (assoc :required (boolean required))
      (some? default) (assoc :default default)
      field-ref? (assoc :dimension [:field {:lib/uuid (str (random-uuid))}
                                    (common/resolve-id-or-404 :model/Field field-id)])
      (and (= t :dimension) widget-type) (assoc :widget-type (keyword widget-type)))))

(def ^:private reference-tag-types
  "Tag types that reference server-side SQL text — `{{snippet: …}}`, `{{#42}}` card refs, and
   source-table tags. They carry no caller-configurable value, but `get_content` emits them
   alongside the value tags, so a verbatim round-trip must accept them; entries of these types
   are skipped and the auto-extracted tag stands."
  #{"snippet" "card" "table"})

(defn apply-template-tags
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
              (keep (fn [[tag-name tag]]
                      (let [nm (name tag-name)]
                        (when-not (contains? reference-tag-types (:type tag))
                          [nm (->lib-template-tag (get existing-by-name nm) tag)]))))
              template_tags)))))

(def template-tags-arg-schema
  "The Malli schema for a tool's `template_tags` argument — one entry per `{{tag}}` in the SQL,
   keyed by tag name."
  [:map-of
   {:description (str "One entry per {{tag}} in the SQL, keyed by tag name; a name "
                      "absent from the SQL is an error. The shape get_content "
                      "returns round-trips verbatim.")}
   :keyword
   [:map
    [:type [:enum {:description (str "\"dimension\" = field filter, a widget bound to a column — "
                                     "write it bare in SQL (WHERE {{tag}}); \"temporal-unit\" = "
                                     "time-bucket picker for a datetime column; text/number/date/"
                                     "boolean = raw variables spliced as literals (you write the "
                                     "operator: WHERE total > {{tag}}); snippet/card/table "
                                     "reference entries are accepted and ignored — the SQL text "
                                     "configures them.")}
            "text" "number" "date" "boolean" "dimension" "temporal-unit"
            "snippet" "card" "table"]]
    [:display_name {:optional true} [:maybe [:string {:description "Widget label."}]]]
    [:field_id {:optional true}
     [:maybe [:or {:description (str "Required for dimension/temporal-unit: the bound column, as "
                                     "a numeric field id or 21-char entity_id.")}
              :int :string]]]
    [:widget_type {:optional true}
     [:maybe [:string {:description (str "Required for dimension: widget/operator matched to the "
                                         "column's type — e.g. \"string/=\", \"string/contains\", "
                                         "\"number/between\", \"date/all-options\", \"category\", "
                                         "\"id\".")}]]]
    [:required {:optional true} [:maybe :boolean]]
    [:default {:optional true} [:maybe :any]]]])
