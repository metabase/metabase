(ns metabase.models.setting
  (:refer-clojure :exclude [get set])
  (:require [clojure.core.match :refer [match]]
            [korma.core :refer :all :exclude [delete]]
            [metabase.db :refer [sel del]]))

;; Settings are a fast + simple way to create a setting that can be set
;; from the admin page. They are saved to the Database, but intelligently
;; cached internally for super-fast lookups.
;;
;; Define a new Setting with `defsetting`:
;;
;;    (defsetting mandrill-api-key "API key for Mandrill")
;;
;; The setting and docstr will then be auto-magically accessible from the admin page.
;;
;; The var created with `defsetting` can be used as a getter/setter, or you can
;; use `get`/`set`/`delete`:
;;
;;     (require '[metabase.models.setting :as setting])
;;
;;     (setting/get :mandrill-api-key)
;;     (mandrill-api-key)
;;
;;     (setting/set :mandrill-api-key "NEW_KEY")
;;     (mandrill-api-key "NEW_KEY")
;;
;;     (setting/delete :mandrill-api-key)
;;     (mandrill-api-key nil)
;;
;; Get a map of all Settings:
;;
;;    (setting/all)

(declare Setting
         cached-setting-values
         restore-cache-if-needed
         settings-list)

;; # PUBLIC

;; ## ACCESSORS

(defn get
  "Fetch value of `Setting`.
   Cached lookup time is ~60µs, compared to ~1800µs for DB lookup."
  [k]
  {:pre [(keyword? k)]}
  (restore-cache-if-needed)
  (or (@cached-setting-values k)
      (when-let [v (sel :one :field [Setting :value] :key (name k))]
        (swap! cached-setting-values assoc k v)
        v)))

(defn set
  "Set the value of `Setting` for `Org`.

    (set :mandrill-api-key \"xyz123\")"
  [k v]
  {:pre [(keyword? k)
         (string? v)]}
  (if (get k) (update Setting
                      (set-fields {:value v})
                      (where {:key (name k)}))
      (insert Setting
              (values {:key (name k)
                       :value v})))
  (restore-cache-if-needed)
  (swap! cached-setting-values assoc k v)
  v)

(defn delete
  "Delete a `Setting` value for `Org`."
  [k]
  {:pre [(keyword? k)]}
  (restore-cache-if-needed)
  (swap! cached-setting-values dissoc k)
  (del Setting :key (name k)))

;; ## DEFSETTING

(defmacro defsetting
  "Defines a new `Setting` that will be added to the DB at some point in the future.
   Conveniently can be used as a getter/setter as well:

     (defsetting mandrill-api-key \"API key for Mandrill.\")
     (mandrill-api-key )          ; get the value
     (mandrill-api-key new-value) ; update the value
     (mandrill-api-key nil)       ; delete the value"
  [nm description]
  {:pre [(symbol? nm)
         (string? description)]}
  (let [setting-key (keyword nm)]
    `(do
       (defn ~nm ~description
         ([]
          (get ~setting-key))
         ([value#]
          (if-not value#
            (delete ~setting-key)
            (set ~setting-key value#))))
       (alter-meta! #'~nm assoc :is-setting? true))))


;; ## ALL SETTINGS (ETC)

(defn all
  "Return a map of all *defined* `Settings`.

    (all) -> {:mandrill-api-key ...}"
  []
  (restore-cache-if-needed)
  @cached-setting-values)

(defn all-with-descriptions
  "Return a sequence of Settings maps, including value and description."
  []
  (let [settings (all)]
    (->> (settings-list)
         (map (fn [{k :key :as setting}]
                (assoc setting
                       :value (k settings))))
         (sort-by :key))))


;; # IMPLEMENTATION

(defn- restore-cache-if-needed []
  (when-not @cached-setting-values
    (reset! cached-setting-values (->> (sel :many Setting)
                                       (map (fn [{k :key v :value}]
                                              {(keyword k) v}))
                                       (into {})))))

(def ^:private cached-setting-values
  (atom nil))

(defentity Setting
  (table :setting))

(defn- settings-list
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
