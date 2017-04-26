(ns metabase.models.humanization
  "Logic related to humanization of table names and other identifiers,
   e.g. taking an identifier like `my_table` and returning a human-friendly one like `My Table`.

   There are two implementations of humanization logic; advanced, cost-based logic is the default;
   which implementation is used is determined by the Setting `enable-advanced-humanization`.

   The actual algorithm for advanced humanization is in `metabase.util.infer-spaces`."
  (:require [clojure.string :as s]
            [clojure.tools.logging :as log]
            [metabase.models.setting :as setting :refer [defsetting]]
            [metabase.util.infer-spaces :refer [infer-spaces]]
            [toucan.db :as db]))

(def ^:private ^:const acronyms
  #{"id" "url" "ip" "uid" "uuid" "guid"})

(defn- capitalize-word [word]
  (if (contains? acronyms (s/lower-case word))
    (s/upper-case word)
    (s/capitalize word)))

(defn- name->human-readable-name:advanced
  "Implementation of `name->human-readable-name` used if the Setting `enable-advanced-humanization` is `false`."
  ^String [^String s]
  (when (seq s)
    ;; explode string on spaces, underscores, hyphens, and camelCase
    (s/join " " (for [part  (s/split s #"[-_\s]+|(?<=[a-z])(?=[A-Z])")
                      :when (not (s/blank? part))
                      word  (dedupe (flatten (infer-spaces part)))]
                  (capitalize-word word)))))

(defn- name->human-readable-name:simple
  "Implementation of `name->human-readable-name` used if the Setting `enable-advanced-humanization` is `true`."
  ^String [^String s]
  ;; explode on hypens, underscores, and spaces
  (when (seq s)
    (s/join " " (for [part  (s/split s #"[-_\s]+")
                      :when (not (s/blank? part))]
                  (capitalize-word part)))))


(declare enable-advanced-humanization)

(defn name->human-readable-name
  "Convert a string NAME of some object like a `Table` or `Field` to one more friendly to humans.

    (name->human-readable-name \"admin_users\") -> \"Admin Users\"

   (The actual implementation of this function depends on the value of `enable-advanced-humanization`; by default,
   `name->human-readable-name:advanced` is used)."
  ^String [^String s]
  ((if (enable-advanced-humanization)
      name->human-readable-name:advanced
      name->human-readable-name:simple) s))


(defn- custom-display-name?
  "Is DISPLAY-NAME a custom name that was set manually by the user in the metadata edit screen?"
  [internal-name display-name]
  (and (not= display-name (name->human-readable-name:simple   internal-name))
       (not= display-name (name->human-readable-name:advanced internal-name))))

(defn- re-humanize-names! [model]
  (doseq [{id :id, internal-name :name, display-name :display_name} (db/select [model :id :name :display_name])
          :let                                                      [new-display-name (name->human-readable-name internal-name)]
          :when                                                     (and (not= display-name new-display-name)
                                                                         (not (custom-display-name? internal-name display-name)))]
    (log/info (format "Updating display name for %s '%s': '%s' -> '%s'" (name model) internal-name display-name new-display-name))
    (db/update! model id
      :display_name new-display-name)))

(defn- re-humanize-table-and-field-names!
  "Update the display names of all tables in the database using new values obtained from the (obstensibly toggled implementation of) `name->human-readable-name`."
  []
  (re-humanize-names! 'Table)
  (re-humanize-names! 'Field))


(defn- set-enable-advanced-humanization! [^Boolean new-value]
  (setting/set-boolean! :enable-advanced-humanization new-value)
  (log/info (format "Now using %s table name humanization." (if (enable-advanced-humanization) "ADVANCED" "SIMPLE")))
  (re-humanize-table-and-field-names!))

(defsetting enable-advanced-humanization
  "Metabase can attempt to transform your table and field names into more sensible, human-readable versions, e.g. \"somehorriblename\" becomes \"Some Horrible Name\".
   This doesn’t work all that well if the names are in a language other than English, however. Do you want us to take a guess?"
  :type    :boolean
  :default true
  :setter  set-enable-advanced-humanization!)
