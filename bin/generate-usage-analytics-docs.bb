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
  "Matches `(events/derive! :event/<topic> <parent>)`. Group 1 is the topic; group 2 matches
   only when the parent is a keyword, so its absence means the call shape drifted and we
   would silently drop that topic."
  #"\((?:[a-zA-Z0-9.-]+/)?derive!\s+:event/([a-z0-9-]+)(\s+:)?")

(def ^:private content-card-types
  "Values from report_card.type yielded by the `type AS entity_type` UNION
   arm in the v_content SQL view."
  ["model" "question"])

(def ^:private view-log-entity-types
  "Entity types written to view_log by the event handlers in
   src/metabase/view_log/events/view_log.clj and src/metabase/documents/view_log.clj.
   Hardcoded because `model AS entity_type` leaves no SQL literals to extract; see
   [[assert-view-log-sql-shape!]]."
  ["card" "collection" "dashboard" "document" "table"])

;; ---------------------------------------------------------------------------
;; Shared helpers
;; ---------------------------------------------------------------------------

(defn- sorted-values
  "Every extractor's output contract: a sorted, deduped, non-empty vector. Throws when empty
   so a moved or renamed source surfaces loudly instead of silently emptying a documented list."
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
(defn- model?     [doc] (and (= "Card" (serdes-model doc))
                             (= "model" (some-> doc :type name))))

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

(defn- dashboard-card-names
  "Card display names from the sibling subdir holding the Card YAMLs that a dashboard's
   inline DashboardCards reference, ordered by filename."
  [dashboard-path]
  (let [dir (fs/path (fs/parent dashboard-path)
                     (str/replace (fs/file-name dashboard-path) #"\.ya?ml$" ""))]
    (when (fs/directory? dir)
      (->> (fs/list-dir dir)
           (filter yaml-file?)
           (map read-yaml)
           (sort-by :path)
           (keep (comp :name :doc))))))

(defn- dashboard-entries [yamls]
  (for [{:keys [path doc]} yamls
        :when (dashboard? doc)]
    {:name        (:name doc)
     :description (:description doc)
     :label       "Cards"
     :items       (dashboard-card-names path)}))

(defn- model-entries [yamls]
  (for [{:keys [doc]} yamls
        :when (model? doc)]
    {:name        (:name doc)
     :description (:description doc)
     :label       "Columns"
     :items       (keep :display_name (:result_metadata doc))}))

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
        ;; Guard against partial drift: `sorted-values` only catches the case where every
        ;; call site changed shape, not where a few did and get silently dropped.
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
    :items       (audit-log-topics (:audit-log-events sources))}
   {:name        "Query log query sources"
    :description "The Query Source column on the [Query log](#query-log) model takes one of:"
    :items       (query-sources (:query-sources sources))}
   {:name        "Content entity types"
    :description "The Entity Type column on the [Content](#content) model takes one of:"
    :items       (content-entity-types (:content-views sources))}
   {:name        "View log entity types"
    :description "The Entity Type column on the [View log](#view-log) model takes one of:"
    :items       view-log-entity-types}])

;; ---------------------------------------------------------------------------
;; Markdown rendering
;; ---------------------------------------------------------------------------

(defn- bullet-list [items]
  (str/join "\n" (map #(str "- " %) items)))

(defn- section-markdown
  "Render one `###` subsection from `{:name :description :label :items}`. The list is
   dropped when `items` is empty, and rendered bare when there is no `label`."
  [{:keys [name description label items]}]
  (->> [(str "### " name)
        description
        (when (seq items)
          (str (when label (str label ":\n\n")) (bullet-list items)))]
       (remove str/blank?)
       (str/join "\n\n")))

(defn- sections-markdown [entries]
  (str/join "\n\n" (map section-markdown entries)))

(defn- document-markdown
  [{:keys [intro dashboards models categorical]}]
  (str (str/join "\n\n"
                 (remove str/blank?
                         [(str/trimr intro)
                          "## Dashboards"
                          (sections-markdown dashboards)
                          "## Models"
                          (sections-markdown models)
                          "## Categorical column values"
                          "Some columns in the models above hold one of a fixed set of values."
                          (sections-markdown categorical)]))
       "\n"))

;; ---------------------------------------------------------------------------
;; Entry point
;; ---------------------------------------------------------------------------

(defn- generate! [{:keys [yaml-dir template output sources]}]
  (when-not (fs/directory? yaml-dir)
    (throw (ex-info (str "YAML directory does not exist: " yaml-dir)
                    {:yaml-dir yaml-dir
                     :cwd      (str (fs/cwd))})))
  (assert-view-log-sql-shape! (:view-log-views sources))
  (let [yamls       (top-level-yamls yaml-dir)
        dashboards  (dashboard-entries yamls)
        models      (model-entries     yamls)
        categorical (categorical-entries sources)
        content     (document-markdown
                     {:intro       (slurp template)
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
                     (str/join ", " (map (comp count :items) categorical))))))

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
