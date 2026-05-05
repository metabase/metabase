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
   :title    "Usage analytics reference"})

;; ---------------------------------------------------------------------------
;; Categorical-column source paths and rename/exclusion config
;; ---------------------------------------------------------------------------

(def ^:private query-sources-src
  "src/metabase/lib/schema/info.cljc")

(def ^:private audit-log-events-src
  "src/metabase/audit_app/events/audit_log.clj")

(def ^:private content-views-dir
  "resources/migrations/instance_analytics_views/content")

(def ^:private view-log-views-dir
  "resources/migrations/instance_analytics_views/view_log")

(def ^:private audit-topic-renames
  "Topic renames applied by the v_audit_log SQL view's CASE statement.
   Keep in sync with resources/migrations/instance_analytics_views/audit_log/v*/mysql-audit_log.sql."
  {"pulse-create" "subscription-create"
   "pulse-delete" "subscription-delete"})

(def ^:private audit-topic-exclusions
  "Topics filtered out of the v_audit_log SQL view's WHERE clause."
  #{"card-read" "card-query" "dashboard-read" "dashboard-query"})

(def ^:private content-card-types
  "Values from report_card.type yielded by the `type AS entity_type` UNION
   arm in the v_content SQL view."
  ["model" "question"])

(def ^:private view-log-entity-types
  "Entity types written to the view_log table by event handlers in
   src/metabase/view_log/events/view_log.clj. Hardcoded because the
   v_view_log SQL view exposes them via `model AS entity_type` (no SQL
   literals to extract). Update when new model types start being
   view-logged."
  ["card" "collection" "dashboard" "table"])

;; ---------------------------------------------------------------------------
;; Shared helpers
;; ---------------------------------------------------------------------------

(defn- assert-non-empty [label coll]
  (when (empty? coll)
    (throw (ex-info (str "Extracted 0 " label "; source likely moved or changed shape")
                    {:extractor label})))
  coll)

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

(defn- load-yaml [path]
  (try
    (yaml/parse-string (slurp (str path)))
    (catch Exception e
      (throw (ex-info (str "Failed to parse YAML: " path)
                      {:path (str path) :cause (.getMessage e)} e)))))

(defn- yaml-file? [p]
  (boolean (re-find #"\.ya?ml$" (str p))))

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
  "Return [path doc] pairs for every YAML directly in the usage-analytics
   collection (excluding files inside dashboard subdirectories)."
  [yaml-dir]
  (->> (fs/list-dir yaml-dir)
       (filter #(and (fs/regular-file? %) (yaml-file? %)))
       (map (juxt identity load-yaml))
       (sort-by first)))

(defn- dashboard-card-dir
  "Sibling directory next to a dashboard YAML that holds the Card YAMLs
   referenced by the dashboard's inline DashboardCards."
  [dashboard-path]
  (fs/path (fs/parent dashboard-path)
           (str/replace (fs/file-name dashboard-path) #"\.ya?ml$" "")))

(defn- load-cards-in [dir]
  (->> (fs/list-dir dir)
       (filter yaml-file?)
       (map (fn [p] (assoc (load-yaml p) ::path (str p))))))

(defn- dashboard-card-names
  "Return card display names from a dashboard's sibling subdir, ordered by
   filename. (Cards in the subdir are Card YAMLs, not DashboardCards — the
   layout fields row/col live inline on the parent Dashboard, not here.)"
  [dashboard-path]
  (let [dir (dashboard-card-dir dashboard-path)]
    (when (fs/directory? dir)
      (->> (load-cards-in dir)
           (sort-by ::path)
           (keep :name)))))

(defn- model-columns
  "Display names of every column the model exposes."
  [doc]
  (->> (:result_metadata doc)
       (map :display_name)
       (filter some?)))

(defn- collect-dashboards [yaml-pairs]
  (for [[path doc] yaml-pairs
        :when (dashboard? doc)]
    {:name        (:name doc)
     :description (:description doc)
     :cards       (dashboard-card-names path)}))

(defn- collect-models [yaml-pairs]
  (for [[_path doc] yaml-pairs
        :when (model? doc)]
    {:name        (:name doc)
     :description (:description doc)
     :columns     (model-columns doc)}))

;; ---------------------------------------------------------------------------
;; Categorical-column extractors
;; ---------------------------------------------------------------------------

(defn- extract-query-sources
  "Read the [:enum ...] body of `::context` in info.cljc and return its
   keyword names as sorted strings."
  []
  (let [content (slurp query-sources-src)
        m       (re-find #"(?s)\(mr/def\s+::context.*?\[:enum(.*?)\]\)" content)]
    (when-not m
      (throw (ex-info (str "Could not find (mr/def ::context [:enum ...]) in " query-sources-src)
                      {:source query-sources-src})))
    (->> (re-seq #":([a-z][a-z0-9-]*(?:/[a-z][a-z0-9-]*)?)" (second m))
         (map second)
         (remove #(str/includes? % "/"))
         distinct
         sort
         vec
         (assert-non-empty "query sources"))))

(defn- extract-audit-log-topics
  "Grep `(derive :event/<topic> ::<parent>)` from the audit-log event file,
   then apply the v_audit_log SQL view's rename and exclusion rules so the
   list matches what users see in the analytics model."
  []
  (let [content (slurp audit-log-events-src)
        topics  (->> (re-seq #"\(derive\s+:event/([a-z0-9-]+)\s+::[a-z0-9-]+\)" content)
                     (map second)
                     distinct)]
    (->> topics
         (remove audit-topic-exclusions)
         (map #(get audit-topic-renames % %))
         distinct
         sort
         vec
         (assert-non-empty "audit log topics"))))

(defn- extract-content-entity-types
  "Pull `'X' AS entity_type` literals from the latest mysql-content.sql view,
   plus the report_card.type values when the view's CASE-on-type arm is
   present."
  []
  (let [latest        (latest-vN-dir content-views-dir)
        sql-file      (str (fs/path latest "mysql-content.sql"))
        content       (slurp sql-file)
        literals      (->> (re-seq #"(?i)'([a-z_]+)'\s+as\s+entity_type" content)
                           (map second))
        has-card-arm? (and (re-find #"(?i)type\s+as\s+entity_type" content)
                           (re-find #"(?i)report_card" content))]
    (->> (concat literals (when has-card-arm? content-card-types))
         distinct
         sort
         vec
         (assert-non-empty "content entity types"))))

(defn- extract-view-log-entity-types
  "Sanity-check that the v_view_log SQL view still uses `model AS entity_type`,
   then return the hardcoded list (entity types are determined by event
   handlers, not by SQL literals)."
  []
  (let [latest   (latest-vN-dir view-log-views-dir)
        sql-file (str (fs/path latest "mysql-view_log.sql"))
        content  (slurp sql-file)]
    (when-not (re-find #"(?i)model\s+as\s+entity_type" content)
      (throw (ex-info "v_view_log SQL no longer uses `model AS entity_type` — re-derive view-log-entity-types manually"
                      {:source sql-file})))
    (assert-non-empty "view log entity types" view-log-entity-types)))

(def ^:private categorical-sections
  [{:name        "Activity log topics"
    :description "The Topic column on the [Activity log](#activity-log) model takes one of:"
    :extractor   extract-audit-log-topics}
   {:name        "Query log query sources"
    :description "The Query Source column on the [Query log](#query-log) model takes one of:"
    :extractor   extract-query-sources}
   {:name        "Content entity types"
    :description "The Entity Type column on the [Content](#content) model takes one of:"
    :extractor   extract-content-entity-types}
   {:name        "View log entity types"
    :description "The Entity Type column on the [View log](#view-log) model takes one of:"
    :extractor   extract-view-log-entity-types}])

(defn- collect-categorical [sections]
  (mapv (fn [{:keys [name description extractor]}]
          {:name        name
           :description description
           :values      (extractor)})
        sections))

;; ---------------------------------------------------------------------------
;; Markdown rendering
;; ---------------------------------------------------------------------------

(defn- bullet-list [items]
  (str/join "\n" (map #(str "- " %) items)))

(defn- section-header [level text]
  (str (apply str (repeat level "#")) " " text))

(defn- render-entity
  "Render one ### subsection: heading, optional description, and a bullet list
   of items. With `:items-label`, the list is preceded by `<label>:`; without
   one (categorical sections), the description is expected to end with `:` and
   the bullets follow directly. Empty `items` falls back to `:empty-label`."
  [{:keys [name description items items-label empty-label]}]
  (str/join "\n\n"
            (remove str/blank?
                    [(section-header 3 name)
                     description
                     (cond
                       (and (seq items) items-label) (str items-label ":\n\n" (bullet-list items))
                       (seq items)                   (bullet-list items)
                       :else                         empty-label)])))

(defn- render-entities
  [{:keys [items-key items-label empty-label]} entities]
  (->> entities
       (map (fn [e]
              (render-entity {:name        (:name e)
                              :description (:description e)
                              :items       (items-key e)
                              :items-label items-label
                              :empty-label empty-label})))
       (str/join "\n\n")))

(def ^:private dashboard-section
  {:items-key :cards :items-label "Cards" :empty-label "_No cards found._"})

(def ^:private model-section
  {:items-key :columns :items-label "Columns" :empty-label "_No columns found._"})

(def ^:private categorical-section
  {:items-key :values})

(defn- render-intro
  "Load the header markdown template and substitute {{title}}."
  [template-path title]
  (-> (slurp template-path)
      (str/replace "{{title}}" title)))

(defn- render-document
  [{:keys [template title dashboards models categorical]}]
  (str (str/join "\n\n"
                 [(str/trimr (render-intro template title))
                  "## Dashboards"
                  (render-entities dashboard-section dashboards)
                  "## Models"
                  (render-entities model-section models)
                  "## Categorical column values"
                  "Some columns in the models above hold one of a fixed set of values."
                  (render-entities categorical-section categorical)])
       "\n"))

;; ---------------------------------------------------------------------------
;; Entry point
;; ---------------------------------------------------------------------------

(defn- generate [{:keys [yaml-dir template output title]}]
  (when-not (fs/directory? yaml-dir)
    (throw (ex-info (str "YAML directory does not exist: " yaml-dir)
                    {:yaml-dir yaml-dir
                     :cwd      (str (fs/cwd))})))
  (let [yaml-pairs  (top-level-yamls yaml-dir)
        dashboards  (collect-dashboards yaml-pairs)
        models      (collect-models     yaml-pairs)
        categorical (collect-categorical categorical-sections)
        content     (render-document
                     {:template    template
                      :title       title
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
    (generate config)
    (catch Exception e
      (println "Error:" (.getMessage e))
      (when-let [data (ex-data e)]
        (println "  data:" (pr-str data)))
      (System/exit 1))))

(when (= *file* (System/getProperty "babashka.file"))
  (-main))
