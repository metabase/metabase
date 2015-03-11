(ns metabase.models.setting
  (:refer-clojure :exclude [get set])
  (:require [clojure.core.match :refer [match]]
            [korma.core :refer :all :exclude [delete]]
            [metabase.db :refer [sel del post-select]]))

(declare Setting
         SettingValue
         cached-setting-values
         setup)

;; # PUBLIC

;; ## ACCESSORS

(defn get
  "Fetch setting with key K for Org.
   Cached lookup time is ~70 s, compared to ~1100 s for DB lookup."
  [org-id k]
  {:pre [(integer? org-id)
         (keyword? k)]}
  (setup)
  (or (@cached-setting-values [k org-id])
      (when-let [v (sel :one :field [SettingValue :value] :setting_key (name k) :organization_id org-id)]
        (swap! cached-setting-values assoc [k org-id] v)
        v)))

(defn set [org-id k v]
  {:pre [(integer? org-id)
         (keyword? k)
         (string? v)]}
  (if (get org-id k) (update SettingValue
                             (set-fields {:value v})
                             (where {:setting_key (name k)
                                     :organization_id org-id}))
      (insert SettingValue
              (values {:setting_key (name k)
                       :organization_id org-id
                       :value v})))
  (setup)
  (swap! cached-setting-values assoc [k org-id] v)
  v)

(defn delete [org-id k]
  {:pre [(integer? org-id)
         (keyword? k)]}
  (setup)
  (swap! cached-setting-values dissoc [k org-id])
  (del SettingValue :setting_key (name k) :organization_id org-id))

;; ## DEFSETTING

(def defsetting-dirty? (atom false))

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
       (alter-meta! #'~nm assoc :is-setting? true)
       (reset! metabase.models.setting/defsetting-dirty? true))))


;; ## ALL SETTINGS (ETC)

(defn all [org-id]
  {:pre [(integer? org-id)]}
  (setup)
  (->> @cached-setting-values
       (map (fn [[[k o-id] v]]
              (when (= org-id o-id)
                {k v})))
       (filter identity)
       (reduce merge {})))

(defn all-with-descriptions [org-id]
  (let [settings-for-org (all org-id)]
    (->> (sel :many Setting)
         (map (fn [{k :key :as setting}]
                (assoc setting
                       :value (k settings-for-org)))))))


;; # IMPLEMENTATION

(declare create-settings-if-needed
         restore-cache-if-needed)

(defn- setup []
  (create-settings-if-needed)
  (restore-cache-if-needed))

;; ## DEFSETTING

(defn- create-settings-if-needed []
  (when @defsetting-dirty?
    (println "RECREATING SETTINGS...")
    (reset! defsetting-dirty? false)
    (let [existing-settings (->> (sel :many :field [Setting :key])
                                 (map name)
                                 clojure.core/set)]
      (->> (all-ns)
           (mapcat ns-interns)
           vals
           (map meta)
           (filter :is-setting?)
           (map (fn [{k :name desc :doc}]
                  {:key (name k)
                   :description desc}))
           (filter #((complement contains?) existing-settings (:key %)))
           (map (fn [setting]
                  (insert Setting (values setting))))))))


;; ## ACCESSORS

(defn- restore-cache-if-needed []
  (when-not @cached-setting-values
    (reset! cached-setting-values (->> (sel :many SettingValue)
                                       (map (fn [{k :setting_key org :organization_id v :value}]
                                              {[(keyword k) org] v}))
                                       (reduce merge {})))))

(def ^:private cached-setting-values
  (atom nil))

(defentity ^:private Setting
  (table :setting))

(defmethod post-select Setting [_ {k :key :as setting}]
  (assoc setting
         :key (keyword k)))

(defentity ^:private SettingValue
  (table :setting_value))
