(ns metabase.models.setting
  (:refer-clojure :exclude [get
                            set])
  (:require [korma.core :refer :all :exclude [delete]]
            [metabase.db :refer [sel del]]))

(declare Setting
         cached-settings
         restore-cache-if-needed)

;; ## PUBLIC

(defn get [k]
  {:pre [(keyword? k)]}
  (restore-cache-if-needed)
  (or (k @cached-settings)                                      ; cached lookup is ~70 μs
      (let [v (sel :one :field [Setting :value] :key (name k))] ; DB lookup is ~1100μs
        (swap! cached-settings assoc k v)
        v)))

(defn set [k v]
  {:pre [(keyword? k)
         (string? v)]}
  (if (get k) (update Setting
                      (set-fields {:value v})
                      (where {:key (name k)}))
      (insert Setting
              (values {:key (name k)
                       :value v})))
  (restore-cache-if-needed)
  (swap! cached-settings assoc k v)
  v)

(defn delete [k]
  {:pre (keyword? k)}
  (swap! cached-settings dissoc k)
  (del Setting :key (name k)))

(defn all []
  (restore-cache-if-needed)
  @cached-settings)


;; ## IMPLEMENTATION

(defn- restore-cache-if-needed []
  (when-not @cached-settings
    (reset! cached-settings (->> (sel :many Setting)
                                 (map (fn [{k :key v :value}]
                                        {(keyword k) v}))
                                 (reduce merge {})))))

(def ^:private cached-settings
  (atom nil))

(defentity ^:private Setting
  (table :settings))
