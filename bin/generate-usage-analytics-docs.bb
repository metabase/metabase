#!/usr/bin/env bb

(ns generate-usage-analytics-docs
  "Generate a markdown reference for the Usage Analytics collection by walking
   the shipped serdes YAML files.

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
  (some-> doc (get (keyword "serdes/meta")) last :model))

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
       (sort-by (comp str first))))

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
;; Markdown rendering
;; ---------------------------------------------------------------------------

(defn- bullet-list [items]
  (str/join "\n" (map #(str "- " %) items)))

(defn- section-header [level text]
  (str (apply str (repeat level "#")) " " text))

(defn- render-entity
  "Render one ### subsection: heading, optional description, and a labeled
   bullet list of items (or an empty-state fallback)."
  [{:keys [name description items items-label empty-label]}]
  (str/join "\n\n"
            (remove str/blank?
                    [(section-header 3 name)
                     description
                     (if (seq items)
                       (str items-label ":\n\n" (bullet-list items))
                       empty-label)])))

(defn- render-entities
  [{:keys [items-key items-label empty-label]} entities]
  (str/join "\n\n"
            (map #(render-entity (assoc %
                                        :items       (items-key %)
                                        :items-label items-label
                                        :empty-label empty-label))
                 entities)))

(def ^:private dashboard-section
  {:items-key :cards :items-label "Cards" :empty-label "_No cards found._"})

(def ^:private model-section
  {:items-key :columns :items-label "Columns" :empty-label "_No columns found._"})

(defn- render-intro
  "Load the header markdown template and substitute {{title}}."
  [template-path title]
  (-> (slurp template-path)
      (str/replace "{{title}}" title)))

(defn- render-document
  [{:keys [template title dashboards models]}]
  (str
   (render-intro template title)
   "## Dashboards\n\n"
   (render-entities dashboard-section dashboards) "\n\n"
   "## Models\n\n"
   (render-entities model-section models) "\n"))

;; ---------------------------------------------------------------------------
;; Entry point
;; ---------------------------------------------------------------------------

(defn- generate [{:keys [yaml-dir template output title]}]
  (when-not (fs/directory? yaml-dir)
    (throw (ex-info (str "YAML directory does not exist: " yaml-dir)
                    {:yaml-dir yaml-dir
                     :cwd      (str (fs/cwd))})))
  (let [yaml-pairs (top-level-yamls yaml-dir)
        dashboards (collect-dashboards yaml-pairs)
        models     (collect-models     yaml-pairs)
        content    (render-document
                    {:template   template
                     :title      title
                     :dashboards dashboards
                     :models     models})]
    (io/make-parents output)
    (spit output content)
    (println (format "Wrote %s" output))
    (println (format "  %d dashboards, %d models"
                     (count dashboards) (count models)))
    {:dashboards (count dashboards)
     :models     (count models)
     :output     output}))

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
