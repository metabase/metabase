(ns metabase-enterprise.representations.import
  "Import functionality for Metabase entities from human-readable representations"
  (:require
   [metabase-enterprise.representations.v0.common :as v0-common]
   [metabase-enterprise.representations.v0.core :as v0-core]
   [representations.read :as rep-read]))

(set! *warn-on-reflection* true)

(defn yaml->toucan
  "Convert a validated representation into data suitable for creating/updating an entity.
   Returns a map with keys matching the Toucan model fields.
   Does NOT insert into the database - just transforms the data."
  [representation ref-index]
  (case (:version representation)
    :v0 (v0-core/yaml->toucan representation ref-index)))

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; Representation Normalization ;;

(defn insert!
  "Insert a representation as a new entity in the database."
  [representation ref-index]
  (let [representation (rep-read/parse representation)]
    (case (:version representation)
      :v0 (v0-core/insert! representation ref-index))))

(defn update!
  "Update an existing entity from a representation."
  [representation id ref-index]
  (let [representation (rep-read/parse representation)]
    (case (:version representation)
      :v0 (v0-core/update! representation id ref-index))))

;; Collections

(defn- collection-representations
  "Extract all representations from a collection YAML, including the collection itself,
   its databases, and recursively all child collections."
  [collection-yaml]
  (concat
   [(dissoc collection-yaml :children :databases)]
   (:databases collection-yaml)
   ;; recursive call
   (mapcat collection-representations (:children collection-yaml))))

(defn- persist-collection-tree
  "Persist the collection down through a nested collection tree."
  ([collection-yaml]
   (persist-collection-tree collection-yaml nil))
  ([collection-yaml parent-ref]
   (let [this-ref (str "ref:" (:name collection-yaml))]
     (-> collection-yaml
         (assoc :collection parent-ref)
         (update :children (fn [children]
                             (mapv #(persist-collection-tree % this-ref) children)))))))

(defn prepare-collection-tree-for-import
  "Prepare a collection tree (as outputted from [[export/export-entire-collection]] for [[insert-all!]]."
  [collection-yaml]
  (-> collection-yaml
      persist-collection-tree
      collection-representations))

(defn insert-all!
  "Insert a collection of representations."
  [representations]
  (loop [representations (v0-common/order-representations representations)
         index {}]
    (if (seq representations)
      (let [rep (first representations)
            instance (insert! rep (v0-common/map-entity-index index))]
        (recur (rest representations) (assoc index (:name rep) instance)))
      index)))
