(ns metabase.models.humanization
  "Logic related to humanization of table names and other identifiers, e.g. taking an identifier like `my_table` and
  returning a human-friendly one like `My Table`.

  There are currently two implementations of humanization logic, previously three.
  Which implementation is used is determined by the Setting `humanization-strategy`.
  `:simple`, which merely replaces underscores and dashes with spaces, and `:none`,
  which predictibly is merely an identity function that does nothing to the results.

  There used to also be `:advanced`, which was the default until enough customers
  complained that we first fixed it and then the fix wasn't good enough so we removed it."
  (:require
   [metabase.models.setting :as setting :refer [defsetting]]
   [metabase.util :as u]
   [metabase.util.humanization :as u.humanization]
   [metabase.util.i18n :refer [deferred-tru tru]]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [toucan2.core :as t2]))

(declare humanization-strategy)

(defn name->human-readable-name
  "Convert a name, such as `num_toucans`, to a human-readable name, such as `Num Toucans`. With one arg, this uses the
  strategy defined by the Setting `humanization-strategy`. With two args, you may specify a custom strategy (intended
  mainly for the internal implementation):

    (humanization-strategy! :simple)
    (name->human-readable-name \"cool_toucans\")                         ;-> \"Cool Toucans\"
    ;; this is the same as:
    (name->human-readable-name (humanization-strategy) \"cool_toucans\") ;-> \"Cool Toucans\"
    ;; specifiy a different strategy:
    (name->human-readable-name :none \"cool_toucans\")                   ;-> \"cool_toucans\""
  ([s]
   (name->human-readable-name (humanization-strategy) s))
  ([strategy s]
   (u.humanization/name->human-readable-name strategy s)))

(defn- re-humanize-names!
  "Update all non-custom display names of all instances of `model` (e.g. Table or Field)."
  [old-strategy model]
  (run! (fn [{id :id, internal-name :name, display-name :display_name}]
          (let [old-strategy-display-name (name->human-readable-name old-strategy internal-name)
                new-strategy-display-name (name->human-readable-name internal-name)
                custom-display-name?      (not= old-strategy-display-name display-name)]
            (when (and (not= display-name new-strategy-display-name)
                       (not custom-display-name?))
              (log/infof "Updating display name for %s '%s': '%s' -> '%s'"
                         (name model) internal-name display-name new-strategy-display-name)
              (t2/update! model id
                          {:display_name new-strategy-display-name}))))
        (t2/reducible-select [model :id :name :display_name])))

(mu/defn ^:private re-humanize-table-and-field-names!
  "Update the non-custom display names of all Tables & Fields in the database using new values obtained from
  the (obstensibly swapped implementation of) `name->human-readable-name`."
  [old-strategy :- :keyword]
  (doseq [model [:model/Table :model/Field]]
    (re-humanize-names! old-strategy model)))

(defn- set-humanization-strategy! [new-value]
  (let [new-strategy (keyword (or new-value :simple))]
    ;; check to make sure `new-strategy` is a valid strategy, or throw an Exception it is it not.
    (when-not (get-method u.humanization/name->human-readable-name new-strategy)
      (throw (IllegalArgumentException.
               (tru "Invalid humanization strategy ''{0}''. Valid strategies are: {1}"
                    new-strategy (keys (methods u.humanization/name->human-readable-name))))))
    (let [old-strategy (setting/get-value-of-type :keyword :humanization-strategy)]
      ;; ok, now set the new value
      (setting/set-value-of-type! :keyword :humanization-strategy new-value)
      ;; now rehumanize all the Tables and Fields using the new strategy.
      ;; TODO: Should we do this in a background thread because it is potentially slow?
      ;; https://github.com/metabase/metabase/issues/39406
      (log/infof "Changing Table & Field names humanization strategy from '%s' to '%s'"
                 (name old-strategy) (name new-strategy))
      (re-humanize-table-and-field-names! old-strategy))))

(defsetting ^{:added "0.28.0"} humanization-strategy
  (deferred-tru
    (str "To make table and field names more human-friendly, Metabase will replace dashes and underscores in them "
         "with spaces. We’ll capitalize each word while at it, so ‘last_visited_at’ will become ‘Last Visited At’."))
  :type       :keyword
  :default    :simple
  :visibility :settings-manager
  :export?    true
  :audit      :raw-value
  :getter     (fn []
                (let [strategy (setting/get-value-of-type :keyword :humanization-strategy)
                      valid-values (set (keys (methods u.humanization/name->human-readable-name)))
                      valid-strategy? (contains? valid-values strategy)]
                  (when (not valid-strategy?) (log/warn (u/format-color :yellow "Invalid humanization strategy '%s'. Defaulting to 'simple'" strategy)))
                  (if valid-strategy? strategy :simple)))
  :setter     set-humanization-strategy!)
