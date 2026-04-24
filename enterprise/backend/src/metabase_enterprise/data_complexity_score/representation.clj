(ns metabase-enterprise.data-complexity-score.representation
  "Load a directory of JSON representation files into the shape the complexity scorer expects.

  The directory is laid out with one JSON file per section — `collections.json`, `tables.json`,
  `fields.json`, `cards.json`, `measures.json`, `embeddings.json`. Missing files are treated as
  empty.

  The loader is the offline counterpart of the app-db enumeration in
  [[metabase-enterprise.data-complexity-score.complexity]]: it produces library + universe catalog maps
  (each `{:entities [...] :collection-count N}`) matching the same shape `score-from-entities`
  expects, plus a file-backed embedder. Given identical content, scoring via this loader returns
  the same result as scoring against a live instance."
  (:require
   [clojure.java.io :as io]
   [clojure.string :as str]
   [metabase-enterprise.data-complexity-score.complexity-embedders :as embedders]
   [metabase.audit-app.core :as audit]
   [metabase.collections.core :as collections]
   [metabase.util :as u]
   [metabase.util.json :as json]))

(set! *warn-on-reflection* true)

(defn- read-section
  "Read `<section>.json` from `dir`, decoding into Clojure data. Returns `default` when the file
  is absent so fixtures can omit sections they don't need.

  Arrays-of-entities (collections, tables, fields, cards, measures) have stable
  keyword fields, so we keywordize. The embeddings map is keyed by actual entity name strings
  (`\"orders\"`, `\"audit_events\"`), so `keywordize?` must be false for that section."
  [dir section {:keys [keywordize? default]}]
  (let [f (io/file dir (str section ".json"))]
    (if (.exists f)
      (json/decode (slurp f) keywordize?)
      default)))

(defn- library-collection-ids
  "Set of collection IDs in the Library subtree — the Library root (identified by `:type`) plus
  every descendant (identified by `:location` starting with `/{root-id}/`). Matches the live
  scorer's `library-collection` + `descendant-ids` pair instead of relying on each descendant
  carrying a library-flavoured `:type`, which only holds for the two seed children."
  [collections]
  (if-let [{root-id :id} (u/seek #(= collections/library-collection-type (:type %)) collections)]
    (let [prefix (str "/" root-id "/")]
      (into #{root-id}
            (keep (fn [{:keys [id location]}]
                    (when (and location (str/starts-with? location prefix)) id)))
            collections))
    #{}))

(defn- ->field [{:keys [name semantic_type description]}]
  {:name          name
   :semantic-type semantic_type
   :description   description})

(defn- ->table-entity
  [fields-by-table measures-by-table {:keys [id name description]}]
  (let [active-fields (->> (fields-by-table id)
                           (filter :active)
                           (mapv ->field))]
    {:id            id
     :name          name
     :kind          :table
     :description   description
     :field-count   (count active-fields)
     :fields        active-fields
     :measure-names (mapv :name (remove :archived (measures-by-table id)))}))

(defn- ->card-entity [{:keys [id name type description]}]
  {:id            id
   :name          name
   :kind          (keyword type)
   :description   description
   :field-count   0
   :fields        []
   :measure-names []})

(defn- resolve-embeddings-file
  "Resolve an explicit `:embeddings-path` override against `dir` when it is relative, and return
  the `File`. Throws when the file doesn't exist — silently falling back to `{}` would mask a
  typo and produce a misleadingly low complexity score."
  ^java.io.File [dir embeddings-path]
  (let [given (io/file embeddings-path)
        f     (if (.isAbsolute given) given (io/file dir embeddings-path))]
    (when-not (.exists f)
      (throw (ex-info (str "Embeddings file not found: " (.getPath f))
                      {:embeddings-path embeddings-path
                       :resolved-path   (.getPath f)
                       :dir             (str dir)})))
    f))

(defn- universe-collection-count
  "Non-archived, non-personal collections in the representation. Mirrors the live
  `universe-collection-count` rule — audit filtering happens on the entity side, not collections."
  [collections]
  (->> collections
       (remove :archived)
       (remove :personal_owner_id)
       count))

(defn load-dir
  "Load representation files from `dir` and derive everything the complexity scorer needs.

  Returns `{:library <catalog> :universe <catalog> :embedder fn}` where each catalog is
  `{:entities [...] :collection-count N}` — shaped for
  [[metabase-enterprise.data-complexity-score.complexity/score-from-entities]].

  Options:
    `:embeddings-path` — explicit path to a JSON embeddings file. When provided, overrides the
      default `embeddings.json` in `dir`. Relative paths are resolved against `dir`. Throws if
      the resolved file is missing — asking for a specific embeddings source and silently
      scoring with none would be wrong."
  [dir & {:keys [embeddings-path]}]
  (let [kw               {:keywordize? true  :default []}
        str-keyed        {:keywordize? false :default {}}
        collections      (read-section dir "collections" kw)
        tables           (read-section dir "tables"      kw)
        fields           (read-section dir "fields"      kw)
        cards            (read-section dir "cards"       kw)
        measures         (read-section dir "measures"    kw)
        embeddings       (if embeddings-path
                           (json/decode (slurp (resolve-embeddings-file dir embeddings-path)) false)
                           (read-section dir "embeddings" str-keyed))
        fields-by-table  (group-by :table_id fields)
        meas-by-table    (group-by :table_id measures)
        lib-coll-ids     (library-collection-ids collections)
        ;; Audit-db filtering only mirrors the live `:universe` path. The live library-entities
        ;; doesn't exclude audit content, so neither do we — Library scope is collection-driven.
        universe-table?  (fn [t] (and (:active t)
                                      (not= (:db_id t) audit/audit-db-id)))
        library-table?   (fn [t] (and (:active t)
                                      (:is_published t)
                                      (contains? lib-coll-ids (:collection_id t))))
        model-or-metric? (fn [c] (and (not (:archived c))
                                      (contains? #{"model" "metric"} (:type c))))
        universe-card?   (fn [c] (and (model-or-metric? c)
                                      (not= (:database_id c) audit/audit-db-id)))
        library-card?    (fn [c] (and (model-or-metric? c)
                                      (contains? lib-coll-ids (:collection_id c))))
        ->table          #(->table-entity fields-by-table meas-by-table %)
        library-ents     (concat (mapv ->card-entity (filter library-card?   cards))
                                 (mapv ->table       (filter library-table?  tables)))
        universe-ents    (concat (mapv ->card-entity (filter universe-card?  cards))
                                 (mapv ->table       (filter universe-table? tables)))]
    {:library  {:entities         (vec library-ents)
                :collection-count (count lib-coll-ids)}
     :universe {:entities         (vec universe-ents)
                :collection-count (universe-collection-count collections)}
     :embedder (embedders/file-embedder embeddings)}))
