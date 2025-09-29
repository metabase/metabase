(ns metabase-enterprise.representations.v0.common
  (:require
   [clojure.string :as str]
   [clojure.walk :as walk]
   [metabase.util :as u]
   [toucan2.core :as t2]))

(defn entity-id [ref collection-ref]
  (-> (str collection-ref "/" ref)
      hash
      str
      u/generate-nano-id))

(defn generate-entity-id
  "Generate a stable entity-id from the representation's collection-ref and its own ref."
  [representation]
  ;; Behold the beauty of this mechanism!
  ;; A bit hacky.
  ;; TODO: raw `:collection` key could be fragile; use name?
  (entity-id (:ref representation) (:collection representation)))

(defn find-collection-id
  "Find collection ID by name or ref. Returns nil if not found."
  [collection-ref]
  (when collection-ref
    (or
     (when (integer? collection-ref) collection-ref)
     ;; Try to find by slug or name
     (t2/select-one-pk :model/Collection :slug collection-ref)
     (t2/select-one-pk :model/Collection :name collection-ref))))

;; this probably exists somewhere
(defn remove-nils [map]
  (reduce (fn [map [k v]]
            (if (nil? v)
              map
              (assoc map k v)))
          {} map))

(defn ref? [x]
  (and (string? x)
       (str/starts-with? x "ref:")))

(defn unref [x]
  (when (ref? x)
    (subs x 4)))

(defn refs [entity]
  (let [v (volatile! [])]
    (walk/postwalk (fn [node]
                     (when (ref? node)
                       (vswap! v conj node))
                     node)
                   (dissoc entity :ref))
    (set (map unref @v))))

(defn ->ref [id type]
  (format "ref:%s-%s" (name type) id))

(defn hydrate-env-var [x]
  (when (and (string? x)
             (str/starts-with? x "env:"))
    (subs x 4)))

(defn ref->id
  "Find database ID by name or ref. Returns nil if not found."
  [entity-ref ref-index]
  (cond (integer? entity-ref)
        entity-ref
        (ref? entity-ref)
        (->> (unref entity-ref)
             (get ref-index)
             :id)
        (nil? entity-ref) nil
        :else
        (throw
         (ex-info "Could not process entity ref!"
                  {:entity-ref entity-ref
                   :ref-index ref-index}))))
