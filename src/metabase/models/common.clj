(ns metabase.models.common
  (:require [clojure.string :as s]))

(def ^:const timezones
  ["GMT"
   "UTC"
   "US/Alaska"
   "US/Arizona"
   "US/Central"
   "US/Eastern"
   "US/Hawaii"
   "US/Mountain"
   "US/Pacific"
   "America/Costa_Rica"])

(def ^:const perms-none 0)
(def ^:const perms-read 1)
(def ^:const perms-readwrite 2)

(def ^:const permissions
  [{:id perms-none :name "None"},
   {:id perms-read :name "Read Only"},
   {:id perms-readwrite :name "Read & Write"}])

(defn name->human-readable-name
  "Convert a string NAME of some object like a `Table` or `Field` to one more friendly to humans.

    (name->human-readable-name \"admin_users\") -> \"Admin Users\""
  [^String n]
  (when (seq n)
    (->> (for [[first-letter & rest-letters] (->> (s/split n #"_|-")                 ; explode string on underscores and hyphens
                                                  (filter (complement s/blank?)))]   ; for each part of the string,
           (apply str (s/upper-case first-letter) (map s/lower-case rest-letters)))  ; upcase the first char and downcase the rest
         (interpose " ")                                                             ; add a space between each part
         (apply str))))                                                              ; convert back to a single string
