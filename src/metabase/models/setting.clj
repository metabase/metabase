(ns metabase.models.setting
  (:refer-clojure :exclude [get set])
  (:require [clojure.core.match :refer [match]]
            [korma.core :refer :all :exclude [delete]]
            [metabase.db :refer [sel del]]))

(declare Setting
         cached-setting-values
         restore-cache-if-needed)

;; # PUBLIC

;; ## ACCESSORS

(defn get
  "Fetch value of `Setting` for `Org`.
   Cached lookup time is ~60µs, compared to ~1800µs for DB lookup."
  [org-id k]
  {:pre [(integer? org-id)
         (keyword? k)]}
  (restore-cache-if-needed)
  (or (@cached-setting-values [k org-id])
      (when-let [v (sel :one :field [Setting :value] :key (name k) :organization_id org-id)]
        (swap! cached-setting-values assoc [k org-id] v)
        v)))

(defn set
  "Set the value of `Setting` for `Org`.

    (set org-id :mandrill-api-key \"xyz123\")"
  [org-id k v]
  {:pre [(integer? org-id)
         (keyword? k)
         (string? v)]}
  (if (get org-id k) (update Setting
                             (set-fields {:value v})
                             (where {:key (name k)
                                     :organization_id org-id}))
      (insert Setting
              (values {:key (name k)
                       :organization_id org-id
                       :value v})))
  (restore-cache-if-needed)
  (swap! cached-setting-values assoc [k org-id] v)
  v)

(defn delete
  "Delete a `Setting` value for `Org`."
  [org-id k]
  {:pre [(integer? org-id)
         (keyword? k)]}
  (restore-cache-if-needed)
  (swap! cached-setting-values dissoc [k org-id])
  (del Setting :key (name k) :organization_id org-id))

;; ## DEFSETTING

(defmacro defsetting
  "Defines a new `Setting` that will be added to the DB at some point in the future.
   Conveniently can be used as a getter/setter as well:

     (defsetting mandrill-api-key \"API key for Mandrill.\")
     (mandrill-api-key org-id)           ; get the value for Org
     (mandrill-api-key org-id new-value) ; update the value for Org"
  [nm description]
  {:pre [(symbol? nm)
         (string? description)]}
  (let [setting-key (keyword nm)]
    `(do
       (defn ~nm ~description
         ([org-id#]
          (get org-id# ~setting-key))
         ([org-id# value#]
          (set org-id# ~setting-key value#)))
       (alter-meta! #'~nm assoc :is-setting? true))))


;; ## ALL SETTINGS (ETC)

(defn all
  "Return all `Settings` for `Org`."
  [org-id]
  {:pre [(integer? org-id)]}
  (restore-cache-if-needed)
  (->> @cached-setting-values
       (map (fn [[[k o-id] v]]
              (when (= org-id o-id)
                {k v})))
       (filter identity)
       (reduce merge {})))

(defn settings-list
  "Return a list of all Settings (as created with `defsetting`)."
  []
  (->> (all-ns)
       (mapcat ns-interns)
       vals
       (map meta)
       (filter :is-setting?)
       (map (fn [{k :name desc :doc}]
              {:key (keyword k)
               :description desc}))))

(defn all-with-descriptions
  "Return a combined list of all `Settings` and values for `Org`, if they exist."
  [org-id]
  (let [settings-for-org (all org-id)]
    (->> (settings-list)
         (map (fn [{k :key :as setting}]
                (assoc setting
                       :value (k settings-for-org)))))))


;; # IMPLEMENTATION

(defn- restore-cache-if-needed []
  (when-not @cached-setting-values
    (reset! cached-setting-values (->> (sel :many Setting)
                                       (map (fn [{k :key org :organization_id v :value}]
                                              {[(keyword k) org] v}))
                                       (reduce merge {})))))

(def ^:private cached-setting-values
  (atom nil))

(defentity ^:private Setting
  (table :setting))
