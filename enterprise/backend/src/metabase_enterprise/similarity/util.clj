(ns metabase-enterprise.similarity.util
  "REPL-only utilities for visually inspecting similarity-graph output.

   Not part of the production API surface. Intended for ad-hoc debugging of
   `metabase-enterprise.similarity.api/neighbors` output: looks up each
   neighbor's underlying entity and prints a compact, enriched table to
   stdout."
  (:require
   [clojure.string :as str]
   [metabase-enterprise.dependencies.dependency-types :as deps.dependency-types]
   [metabase-enterprise.similarity.api :as sim.api]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- fetch-entity
  "Look up the underlying row for `entity-type/entity-id`. Returns nil if the
   type is unknown or the row no longer exists (e.g. hard-deleted)."
  [entity-type entity-id]
  (when-let [model (deps.dependency-types/dependency-type->model entity-type)]
    (try
      (t2/select-one model :id entity-id)
      (catch Throwable _ nil))))

(defn- card-tag [card]
  (case (some-> card :type name)
    "model"  "model"
    "metric" "metric"
    nil))

(defn- describe
  "Human-readable summary of an entity row. Returns
   `{:name <str> :extras [<str> ...]}`."
  [entity-type row]
  (cond
    (nil? row)
    {:name "<not found>" :extras []}

    (= :card entity-type)
    {:name   (or (:name row) "<unnamed>")
     :extras (cond-> []
               (card-tag row)       (conj (card-tag row))
               (:archived row)      (conj "archived")
               (:collection_id row) (conj (str "coll=" (:collection_id row)))
               (:view_count row)    (conj (str "views=" (:view_count row))))}

    (= :dashboard entity-type)
    {:name   (or (:name row) "<unnamed>")
     :extras (cond-> []
               (:archived row)      (conj "archived")
               (:collection_id row) (conj (str "coll=" (:collection_id row)))
               (:view_count row)    (conj (str "views=" (:view_count row))))}

    (= :table entity-type)
    {:name   (str (when (seq (:schema row)) (str (:schema row) "."))
                  (or (:name row) "<unnamed>"))
     :extras (cond-> []
               (false? (:active row)) (conj "inactive")
               (:db_id row)           (conj (str "db=" (:db_id row)))
               (:view_count row)      (conj (str "views=" (:view_count row))))}

    (= :document entity-type)
    {:name   (or (:name row) "<unnamed>")
     :extras (cond-> []
               (:archived row)      (conj "archived")
               (:collection_id row) (conj (str "coll=" (:collection_id row))))}

    :else
    {:name   (or (:name row) (str "<" (name entity-type) " #" (:id row) ">"))
     :extras (cond-> []
               (:archived row)      (conj "archived")
               (:collection_id row) (conj (str "coll=" (:collection_id row))))}))

(defn- truncate [s n]
  (let [s (str s)]
    (if (> (count s) n)
      (str (subs s 0 (max 0 (dec n))) "…")
      s)))

(defn- pad-r [s n]
  (let [s (truncate s n)]
    (str s (apply str (repeat (- n (count s)) \space)))))

(defn- pad-l [s n]
  (let [s (truncate (str s) n)]
    (str (apply str (repeat (- n (count s)) \space)) s)))

(defn- bar
  "Unicode block bar showing `score / max-score` over `width` cells."
  [score max-score width]
  (let [filled (if (or (zero? max-score) (nil? max-score))
                 0
                 (int (Math/round ^double (* width (/ (double score)
                                                      (double max-score))))))]
    (str (apply str (repeat (max 0 filled) \█))
         (apply str (repeat (max 0 (- width filled)) \space)))))

(defn- format-neighbors
  "Build the formatted, enriched table as a single string."
  [edges {:keys [name-width bar-width]
          :or   {name-width 50, bar-width 16}}]
  (let [{src-type :from_entity_type src-id :from_entity_id} (first edges)
        src-row     (fetch-entity src-type src-id)
        {src-name :name src-extras :extras} (describe src-type src-row)
        max-score   (apply max (map :score edges))
        type-w      10
        id-w        8
        score-w     9
        view-w      14
        header      (format "  %s  %s  %s  %s  %s  %s%s"
                            (pad-l "#" 3)
                            (pad-r "type" type-w)
                            (pad-l "id" id-w)
                            (pad-r "score" score-w)
                            (pad-r "view" view-w)
                            (if (pos? bar-width)
                              (str (pad-r (str "bar (max " (format "%.4g" (double max-score)) ")")
                                          bar-width)
                                   "  ")
                              "")
                            (str (pad-r "name" name-width) "  extras"))
        rule        (apply str (repeat (count header) \-))
        rows        (for [[idx {:keys [to_entity_type to_entity_id score view]}]
                          (map-indexed vector edges)]
                      (let [row (fetch-entity to_entity_type to_entity_id)
                            {nm :name extras :extras} (describe to_entity_type row)]
                        (format "  %s  %s  %s  %s  %s  %s%s"
                                (pad-l (inc idx) 3)
                                (pad-r (name to_entity_type) type-w)
                                (pad-l to_entity_id id-w)
                                (pad-r (format "%.5f" (double score)) score-w)
                                (pad-r (name view) view-w)
                                (if (pos? bar-width)
                                  (str (pad-r (bar score max-score bar-width) bar-width)
                                       "  ")
                                  "")
                                (str (pad-r nm name-width) "  "
                                     (str/join " · " extras)))))]
    (str/join \newline
              (concat [(format "Source: %s #%d — %s%s"
                               (name src-type) src-id src-name
                               (if (seq src-extras)
                                 (str "  (" (str/join ", " src-extras) ")")
                                 ""))
                       (format "Returned %d neighbor(s)" (count edges))
                       ""
                       header
                       rule]
                      rows
                      [""]))))

(defn print-neighbors
  "Pretty-print a list of `:model/SimilarEdge` rows produced by
   [[metabase-enterprise.similarity.api/neighbors]] to stdout. Returns nil.

   Convenience: if `arg` is a map it is forwarded to `neighbors` first, so
   `(print-neighbors {:entity-type :card :entity-id 4523 :k 10})` works
   end-to-end from the REPL.

   Options (second arg):
     :name-width  truncate the name column at this many characters (50)
     :bar-width   width of the relative-score bar in cells (16, 0 to suppress)"
  ([arg] (print-neighbors arg {}))
  ([arg opts]
   (let [edges (if (map? arg) (sim.api/neighbors arg) arg)]
     #_{:clj-kondo/ignore [:discouraged-var]}
     (println (if (empty? edges)
                "(no neighbors)"
                (format-neighbors edges opts))))))

(defn print-random-card-neighbors
  "Pick a random card from the top `pool` most-viewed (non-archived) cards
   and pretty-print its similarity neighbors via [[print-neighbors]]. REPL
   convenience for sampling the ensemble.

   Options:
     :pool  size of the most-viewed pool to sample from (default 2000)
     :k     number of neighbors to fetch (default 20)"
  ([] (print-random-card-neighbors {}))
  ([{:keys [pool k] :or {pool 2000, k 20}}]
   (let [ids (map :id (t2/select [:model/Card :id]
                                 :archived false
                                 {:order-by [[:view_count :desc]]
                                  :limit    pool}))]
     (when (seq ids)
       (print-neighbors {:entity-type :card
                         :entity-id   (rand-nth ids)
                         :k           k})))))
