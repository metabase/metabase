(ns metabase.models.common
  (:require [clojure.string :as s]
            [metabase.api.common :refer [*current-user* *current-user-id* check]]
            [metabase.util :as u]))

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
    (when-let [n (->> (some-> n
                        (s/replace #"(?:-|_id)$" "")                                       ; strip off any trailing _id or -id suffix
                        (s/split #"_|-"))
                   (filterv not-empty)) ]                                                 ; explode string on underscores and hyphens
      (->> (for [[first-letter & rest-letters] n]                                     ; for each part of the string,
             (apply str (s/upper-case first-letter) (map s/lower-case rest-letters))) ; upcase the first char and downcase the rest
        (interpose " ")                                                               ; add a space between each part
        (apply str)))))                                                               ; convert back to a single string
