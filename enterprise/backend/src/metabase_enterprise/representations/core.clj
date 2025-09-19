(ns metabase-enterprise.representations.core
  "Core functionality for the representations module that enables human-writable
   formats for Metabase entities for version control and programmatic management."
  (:require
   [clj-yaml.core :as yaml]
   [clojure.java.io :as io]
   [clojure.walk :as walk]
   [metabase.models.serialization :as serdes]
   [metabase.query-processor :as qp]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

;; this probably exists somewhere
(defn- remove-nils [map]
  (reduce (fn [map [k v]]
            (if (nil? v)
              map
              (assoc map k v)))
          {} map))

(defn card-ref [card]
  (format "%s-%s" (name (:type card)) (:id card)))

(defn export-card [type question]
  (let [query (serdes/export-mbql (:dataset_query question))]
    (cond-> {:name (:name question)
             ;;:version "question-v0"
             :type type
             :ref (format "%s-%s" (name type) (:id question))
             :description (:description question)}

      (= :native (:type query))
      (assoc :query (-> query :native :query)
             :database (:database query))

      (= :query (:type query))
      (assoc :mbql_query (:query query)
             :database (:database query))

      :always
      remove-nils)))

(defn export-collection [collection]
  (-> {:type "collection"
       :ref (format "%s-%s" "collection" (:id collection))
       :name (:name collection)
       :description (:description collection)}
      remove-nils))

(defn- write-em
  "Writes representations to a directory `dir`. Will take a collection-id and serialize the whole collection, creating a folder named <collection-name> there. Example, supposing a collection id of 8 with name \"custom\",


  (write-em \"/tmp/\" 8)
  ❯ tree custom
  custom
  ├── c-115-card1147709.card.yml
  ├── c-116-card1148224.card.yml
  └── c-117-card1147694.card.yml

  1 directory, 3 files"
  [dir collection-id]
  (let [collection (t2/select-one :model/Collection :id collection-id)]
    ;; todo: create folder called collection name
    (letfn [(stuff [card]
              (let [card-id (:id card)]
                {:name (:name card)
                 :id card-id
                 :version "1-card"
                 :type :card
                 :ref (format "c-%s-%s" card-id (str (gensym "card")))
                 ;; :sql-query compiled
                 :dataset_query (serdes/export-mbql (:dataset_query card))
                 ;; rows are there to give a preview, this is "dev" only stuff.
                 :rows (try (->> (qp/process-query (:dataset_query card))
                                 :data :rows (take 10))
                            (catch Exception _e [[:error :getting :rows]]))}))
            (write! [card-stuff]
              (let [filename (format "%s/%s/%s.card.yml" dir (:name collection) (:ref card-stuff))]
                (io/make-parents filename)
                (spit filename
                      (yaml/generate-string (dissoc card-stuff :rows :id)
                                            {:dumper-options {:flow-style :block
                                                              :split-lines false}}))
                (with-open [w (java.io.BufferedWriter. (io/writer filename :append true))]
                  (.newLine w)
                  (.newLine w)
                  (doseq [row (:rows card-stuff)]
                    (.write w (format "# %s\n" row))))))]
      (let [cards (t2/select :model/Card :collection_id collection-id)
            nanos->id (into {} (map (juxt :entity_id :id)) cards)
            cards (map stuff cards)
            id->ref (into {} (map (juxt :id :ref)) cards)
            cards (map (fn [card] (update card :dataset_query
                                          (fn [q] (walk/postwalk (fn [x]
                                                                   (or (some-> x nanos->id id->ref)
                                                                       x))
                                                                 q))))
                       cards)]
        (doseq [card cards]
          (write! card)
          (print ".")
          (flush))))))

;; metabase/test_resources

;; A file to define database references
;; Represent the database schema
