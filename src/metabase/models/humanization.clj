(ns metabase.models.humanization
  "Logic related to humanization of table names and other identifiers, e.g. taking an identifier like `my_table` and
  returning a human-friendly one like `My Table`.

  There are currently two implementations of humanization logic, previously three.
  Which implementation is used is determined by the Setting `humanization-strategy`.
  `:simple`, which merely replaces underscores and dashes with spaces, and `:none`,
  which predictibly is merely an identity function that does nothing to the results.

  There used to also be `:advanced`, which was the default until enough customers
  complained that we first fixed it and then the fix wasn't good enough so we removed it."
  (:require [clojure.string :as str]
            [clojure.tools.logging :as log]
            [metabase.models.setting :as setting :refer [defsetting]]
            [metabase.util.i18n :refer [deferred-tru trs tru]]
            [toucan.db :as db]))

(declare humanization-strategy)

(defmulti ^String name->human-readable-name
  "Convert a name, such as `num_toucans`, to a human-readable name, such as `Num Toucans`. With one arg, this uses the
  strategy defined by the Setting `humanization-strategy`. With two args, you may specify a custom strategy (intended
  mainly for the internal implementation):

     (humanization-strategy :simple)
     (name->human-readable-name \"cool_toucans\")                         ;-> \"Cool Toucans\"
     ;; this is the same as:
     (name->human-readable-name (humanization-strategy) \"cool_toucans\") ;-> \"Cool Toucans\"
     ;; specifiy a different strategy:
     (name->human-readable-name :none \"cool_toucans\")                   ;-> \"cool_toucans\""
  {:arglists '([s] [strategy s])}
  (fn
    ([_] (keyword (humanization-strategy)))
    ([strategy _] (keyword strategy))))

(def ^:private ^:const acronyms
  #{"id" "url" "ip" "uid" "uuid" "guid"})

(defn- capitalize-word [word]
  (if (contains? acronyms (str/lower-case word))
    (str/upper-case word)
    (str/capitalize word)))

;; simple replaces hyphens and underscores with spaces and capitalizes
(defmethod name->human-readable-name :simple
  ([s] (name->human-readable-name :simple s))
  ([_, ^String s]
   ;; explode on hyphens, underscores, and spaces
   (when (seq s)
     (str/join " " (for [part  (str/split s #"[-_\s]+")
                         :when (not (str/blank? part))]
                     (capitalize-word part))))))

;; :none is just an identity implementation
(defmethod name->human-readable-name :none
  ([s]   s)
  ([_ s] s))


(defn- re-humanize-names!
  "Update all non-custom display names of all instances of `model` (e.g. Table or Field)."
  [old-strategy model]
  (run! (fn [{id :id, internal-name :name, display-name :display_name}]
          (let [old-strategy-display-name (name->human-readable-name old-strategy internal-name)
                new-strategy-display-name (name->human-readable-name internal-name)
                custom-display-name?      (not= old-strategy-display-name display-name)]
            (when (and (not= display-name new-strategy-display-name)
                       (not custom-display-name?))
              (log/info (trs "Updating display name for {0} ''{1}'': ''{2}'' -> ''{3}''"
                             (name model) internal-name display-name new-strategy-display-name))
              (db/update! model id
                :display_name new-strategy-display-name))))
        (db/select-reducible [model :id :name :display_name])))

(defn- re-humanize-table-and-field-names!
  "Update the non-custom display names of all Tables & Fields in the database using new values obtained from
  the (obstensibly swapped implementation of) `name->human-readable-name`."
  [old-strategy]
  (doseq [model ['Table 'Field]]
    (re-humanize-names! old-strategy model)))


(defn- set-humanization-strategy! [new-value]
  (let [new-strategy (or new-value "simple")]
    ;; check to make sure `new-strategy` is a valid strategy, or throw an Exception it is it not.
    (when-not (get-method name->human-readable-name (keyword new-strategy))
      (throw (IllegalArgumentException.
               (tru "Invalid humanization strategy ''{0}''. Valid strategies are: {1}"
                    new-strategy (keys (methods name->human-readable-name))))))
    (let [old-strategy (setting/get-string :humanization-strategy)]
      ;; ok, now set the new value
      (setting/set-string! :humanization-strategy (some-> new-value name))
      ;; now rehumanize all the Tables and Fields using the new strategy.
      ;; TODO: Should we do this in a background thread because it is potentially slow?
      (log/info (trs "Changing Table & Field names humanization strategy from ''{0}'' to ''{1}''" old-strategy new-strategy))
      (re-humanize-table-and-field-names! old-strategy))))

(defsetting ^{:added "0.28.0"} humanization-strategy
  (str (deferred-tru "To make table and field names more human-friendly, Metabase will replace dashes and underscores in them with spaces.")
       " "
       (deferred-tru "We’ll capitalize each word while at it, so ‘last_visited_at’ will become ‘Last Visited At’."))
  :default "simple"
  :setter  set-humanization-strategy!)
