#!/usr/bin/env bb

(ns generate-usage-analytics-docs
  "Generate a markdown reference for the Usage Analytics collection by walking
   the shipped serdes YAML files. Also extracts a few categorical column-value
   lists from their canonical sources (Malli schemas, event derives, SQL views).

   Run from the repo root:

     ./bin/generate-usage-analytics-docs.bb

   Output: docs/usage-and-performance-tools/usage-analytics-reference.md"
  (:require [babashka.fs :as fs]
            [clj-yaml.core :as yaml]
            [clojure.java.io :as io]
            [clojure.string :as str]))

(def ^:private config
  {:yaml-dir "resources/instance_analytics/collections/main/usage_analytics"
   :template "bin/templates/usage-analytics-reference-intro.md"
   :output   "docs/usage-and-performance-tools/usage-analytics-reference.md"
   :title    "Usage analytics reference"
   :sources  {:query-sources     "src/metabase/lib/schema/info.cljc"
              :audit-log-events  "src/metabase/audit_app/events/audit_log.clj"
              :content-views     "resources/migrations/instance_analytics_views/content"
              :view-log-views    "resources/migrations/instance_analytics_views/view_log"}})

;; ---------------------------------------------------------------------------
;; Categorical-column rename/exclusion config
;; ---------------------------------------------------------------------------

(def ^:private audit-topic-renames
  "Topic renames applied by the v_audit_log SQL view's CASE statement.
   Keep in sync with resources/migrations/instance_analytics_views/audit_log/v*/mysql-audit_log.sql."
  {"pulse-create" "subscription-create"
   "pulse-delete" "subscription-delete"})

(def ^:private audit-topic-exclusions
  "Topics filtered out of the v_audit_log SQL view's WHERE clause."
  #{"card-read" "card-query" "dashboard-read" "dashboard-query"})

(def ^:private event-derive-re
  "Matches `(events/derive! :event/<topic> <parent>)` in an event namespace. Group 1 is the
   topic. Group 2 is present only when the parent is a keyword — either a `::keyword`
   grouping tag or another `:event/` topic — so its absence means the call shape drifted and
   we would silently drop that topic. The namespace alias is optional so an alias rename
   does not silently drop topics either."
  #"\((?:[a-zA-Z0-9.-]+/)?derive!\s+:event/([a-z0-9-]+)(\s+:)?")

(def ^:private content-card-types
  "Values from report_card.type yielded by the `type AS entity_type` UNION
   arm in the v_content SQL view."
  ["model" "question"])

(def ^:private view-log-entity-types
  "Entity types written to the view_log table by event handlers in
   src/metabase/view_log/events/view_log.clj and
   src/metabase/documents/view_log.clj. Hardcoded because the
   v_view_log SQL view exposes them via `model AS entity_type` (no SQL
   literals to extract). Update when new model types start being
   view-logged."
  ["card" "collection" "dashboard" "document" "table"])

;; ---------------------------------------------------------------------------
;; Shared helpers
;; ---------------------------------------------------------------------------

(defn- sorted-values
  "Every extractor's output contract: a sorted, deduped, non-empty vector. Throws when
   empty so a moved or renamed source surfaces loudly instead of silently emptying a
   documented list. `coll` comes last so call sites can end in `(->> ... (sorted-values ...))`."
  [label coll]
  (let [values (vec (sort (distinct coll)))]
    (when (empty? values)
      (throw (ex-info (str "Extracted 0 " label "; source likely moved or changed shape")
                      {:extractor label})))
    values))

(defn- latest-vN-dir
  "Return the directory under `parent` with the highest numeric vN suffix."
  [parent]
  (let [dirs (->> (fs/list-dir parent)
                  (filter fs/directory?)
                  (filter #(re-matches #"v\d+" (fs/file-name %))))]
    (when (empty? dirs)
      (throw (ex-info (str "No vN directories under " parent) {:parent parent})))
    (->> dirs
         (sort-by #(Long/parseLong (subs (fs/file-name %) 1)))
         last)))

;; ---------------------------------------------------------------------------
;; YAML loading + classification
;; ---------------------------------------------------------------------------

(defn- yaml-file? [p]
  (boolean (re-find #"\.ya?ml$" (str p))))

(defn- read-yaml
  "Parse a YAML file into `{:path ... :doc ...}`."
  [path]
  (try
    {:path (str path)
     :doc  (yaml/parse-string (slurp (str path)))}
    (catch Exception e
      (throw (ex-info (str "Failed to parse YAML: " path)
                      {:path (str path) :cause (.getMessage e)} e)))))

(defn- serdes-model
  "Read the entity kind from a YAML's serdes/meta block (last entry wins —
   nested entities such as DashboardCards put their parent first)."
  [doc]
  (some-> doc :serdes/meta last :model))

(defn- dashboard? [doc] (= "Dashboard" (serdes-model doc)))
(defn- card?      [doc] (= "Card"      (serdes-model doc)))
(defn- model?     [doc] (and (card? doc) (= "model" (some-> doc :type name))))

;; ---------------------------------------------------------------------------
;; Collectors
;; ---------------------------------------------------------------------------

(defn- top-level-yamls
  "Return `{:path :doc}` maps for every YAML directly in the usage-analytics
   collection (excluding files inside dashboard subdirectories)."
  [yaml-dir]
  (->> (fs/list-dir yaml-dir)
       (filter #(and (fs/regular-file? %) (yaml-file? %)))
       (map read-yaml)
       (sort-by :path)))

(defn- dashboard-card-dir
  "Sibling directory next to a dashboard YAML that holds the Card YAMLs
   referenced by the dashboard's inline DashboardCards."
  [dashboard-path]
  (fs/path (fs/parent dashboard-path)
           (str/replace (fs/file-name dashboard-path) #"\.ya?ml$" "")))

(defn- dashboard-card-names
  "Return card display names from a dashboard's sibling subdir, ordered by filename."
  [dashboard-path]
  (let [dir (dashboard-card-dir dashboard-path)]
    (when (fs/directory? dir)
      (->> (fs/list-dir dir)
           (filter yaml-file?)
           (map read-yaml)
           (sort-by :path)
           (keep (comp :name :doc))))))

(defn- model-columns
  "Display names of every column the model exposes."
  [doc]
  (keep :display_name (:result_metadata doc)))

(defn- dashboard-entries [yamls]
  (for [{:keys [path doc]} yamls
        :when (dashboard? doc)]
    {:name        (:name doc)
     :description (:description doc)
     :cards       (dashboard-card-names path)}))

(defn- model-entries [yamls]
  (for [{:keys [doc]} yamls
        :when (model? doc)]
    {:name        (:name doc)
     :description (:description doc)
     :columns     (model-columns doc)}))

;; ---------------------------------------------------------------------------
;; Categorical-column extractors
;; ---------------------------------------------------------------------------

(defn- query-sources
  "Read the [:enum ...] body of `::context` in info.cljc and return its
   keyword names as sorted strings."
  [src]
  (let [content (slurp src)
        ;; Only an optional docstring may sit between `::context` and its `[:enum`, so a
        ;; `::context` that stops being an enum throws below rather than matching some later
        ;; definition's `[:enum` and yielding a plausible-looking wrong list.
        m       (re-find #"(?s)\(mr/def\s+::context\s*(?:\"[^\"]*\"\s*)?\[:enum(.*?)\]\)" content)]
    (when-not m
      (throw (ex-info (str "Could not find (mr/def ::context [:enum ...]) in " src)
                      {:source src})))
    (->> (re-seq #":([a-z][a-z0-9-]*(?:/[a-z][a-z0-9-]*)?)" (second m))
         (map second)
         (remove #(str/includes? % "/"))
         (sorted-values "query sources"))))

(defn- audit-log-topics
  "Grep [[event-derive-re]] over the audit-log event file, then apply the v_audit_log SQL
   view's rename and exclusion rules so the list matches what users see in the analytics
   model."
  [src]
  (let [forms   (re-seq event-derive-re (slurp src))
        ;; Guard against partial drift: `sorted-values` below only catches the case where the
        ;; shape changed everywhere, not where some call sites moved to a shape we no longer
        ;; match and would silently drop.
        drifted (keep #(when-not (nth % 2) (second %)) forms)]
    (when (seq drifted)
      (throw (ex-info (str "`derive!` parent is no longer a keyword for: " (str/join ", " drifted))
                      {:source src :topics (vec drifted)})))
    (->> forms
         (map second)
         (remove audit-topic-exclusions)
         (map #(get audit-topic-renames % %))
         (sorted-values "audit log topics"))))

(defn- content-entity-types
  "Pull `'X' AS entity_type` literals from the latest mysql-content.sql view,
   plus the report_card.type values when the view's CASE-on-type arm is
   present."
  [views-dir]
  (let [sql-file      (str (fs/path (latest-vN-dir views-dir) "mysql-content.sql"))
        content       (slurp sql-file)
        literals      (->> (re-seq #"(?i)'([a-z_]+)'\s+as\s+entity_type" content)
                           (map second))
        has-card-arm? (and (re-find #"(?i)type\s+as\s+entity_type" content)
                           (re-find #"(?i)report_card" content))]
    (->> (concat literals (when has-card-arm? content-card-types))
         (sorted-values "content entity types"))))

(defn- assert-view-log-sql-shape!
  "Throws if the v_view_log SQL view stops using `model AS entity_type` —
   the assumption that lets us hardcode [[view-log-entity-types]]."
  [views-dir]
  (let [sql-file (str (fs/path (latest-vN-dir views-dir) "mysql-view_log.sql"))]
    (when-not (re-find #"(?i)model\s+as\s+entity_type" (slurp sql-file))
      (throw (ex-info "v_view_log SQL no longer uses `model AS entity_type`. Re-derive view-log-entity-types manually."
                      {:source sql-file})))))

(defn- categorical-entries
  "The fixed-value column lists, each read from its canonical source."
  [sources]
  [{:name        "Activity log topics"
    :description "The Topic column on the [Activity log](#activity-log) model takes one of:"
    :values      (audit-log-topics (:audit-log-events sources))}
   {:name        "Query log query sources"
    :description "The Query Source column on the [Query log](#query-log) model takes one of:"
    :values      (query-sources (:query-sources sources))}
   {:name        "Content entity types"
    :description "The Entity Type column on the [Content](#content) model takes one of:"
    :values      (content-entity-types (:content-views sources))}
   {:name        "View log entity types"
    :description "The Entity Type column on the [View log](#view-log) model takes one of:"
    :values      view-log-entity-types}])

;; ---------------------------------------------------------------------------
;; Markdown rendering
;; ---------------------------------------------------------------------------

(defn- bullet-list [items]
  (str/join "\n" (map #(str "- " %) items)))

(defn- section-header [level text]
  (str (apply str (repeat level "#")) " " text))

(defn- labelled-list-renderer
  "Returns a fn that renders items as `<label>:\\n\\n<bullets>`, falling back
   to `empty-label` when the seq is empty."
  [label empty-label]
  (fn [items]
    (if (seq items)
      (str label ":\n\n" (bullet-list items))
      empty-label)))

(defn- bare-list
  "Render `items` as a plain bullet list, or `nil` when empty."
  [items]
  (when (seq items)
    (bullet-list items)))

(defn- entity-markdown
  "Render one `###` subsection from `{:name :description :items :render-items}`."
  [{:keys [name description items render-items]}]
  (str/join "\n\n"
            (remove str/blank?
                    [(section-header 3 name)
                     description
                     (render-items items)])))

(defn- entities-markdown
  [{:keys [items-key render-items]} entities]
  (->> entities
       (map (fn [e]
              (entity-markdown {:name         (:name e)
                                :description  (:description e)
                                :items        (items-key e)
                                :render-items render-items})))
       (str/join "\n\n")))

(def ^:private dashboard-section
  {:items-key    :cards
   :render-items (labelled-list-renderer "Cards" "_No cards found._")})

(def ^:private model-section
  {:items-key    :columns
   :render-items (labelled-list-renderer "Columns" "_No columns found._")})

(def ^:private categorical-section
  {:items-key    :values
   :render-items bare-list})

(defn- intro-markdown
  "Substitute `{{title}}` into `template-content`."
  [template-content title]
  (str/replace template-content "{{title}}" title))

(defn- document-markdown
  [{:keys [intro dashboards models categorical]}]
  (str (str/join "\n\n"
                 (remove str/blank?
                         [(str/trimr intro)
                          "## Dashboards"
                          (entities-markdown dashboard-section dashboards)
                          "## Models"
                          (entities-markdown model-section models)
                          "## Categorical column values"
                          "Some columns in the models above hold one of a fixed set of values."
                          (entities-markdown categorical-section categorical)]))
       "\n"))

;; ---------------------------------------------------------------------------
;; Entry point
;; ---------------------------------------------------------------------------

(defn- generate! [{:keys [yaml-dir template output title sources]}]
  (when-not (fs/directory? yaml-dir)
    (throw (ex-info (str "YAML directory does not exist: " yaml-dir)
                    {:yaml-dir yaml-dir
                     :cwd      (str (fs/cwd))})))
  (assert-view-log-sql-shape! (:view-log-views sources))
  (let [yamls       (top-level-yamls yaml-dir)
        dashboards  (dashboard-entries yamls)
        models      (model-entries     yamls)
        categorical (categorical-entries sources)
        intro       (intro-markdown (slurp template) title)
        content     (document-markdown
                     {:intro       intro
                      :dashboards  dashboards
                      :models      models
                      :categorical categorical})]
    (io/make-parents output)
    (spit output content)
    (println (format "Wrote %s" output))
    (println (format "  %d dashboards, %d models, %d categorical columns (%s values)"
                     (count dashboards)
                     (count models)
                     (count categorical)
                     (str/join ", " (map (comp count :values) categorical))))
    {:dashboards  (count dashboards)
     :models      (count models)
     :categorical (count categorical)
     :output      output}))

(defn -main [& _args]
  (try
    (generate! config)
    (catch Exception e
      (println "Error:" (.getMessage e))
      (when-let [data (ex-data e)]
        (println "  data:" (pr-str data)))
      (System/exit 1))))

(when (= *file* (System/getProperty "babashka.file"))
  (-main))
