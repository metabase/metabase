(ns metabase.warehouse-schema.settings
  "Settings of the warehouse-schema module."
  (:require
   [metabase.settings.core :as setting :refer [defsetting]]
   [metabase.util :as u]
   [metabase.util.humanization :as u.humanization]
   [metabase.util.i18n :refer [deferred-tru tru]]
   [metabase.util.log :as log]
   [metabase.warehouse-schema.humanization :as humanization]))

(defn- set-humanization-strategy!
  "Set `humanization-strategy` to `new-value`, throwing for an unknown strategy, then re-humanize every Table and
  Field display name.

  TODO: Should we do this in a background thread because it is potentially slow?
  https://github.com/metabase/metabase/issues/39406"
  [new-value]
  (let [new-strategy (keyword (or new-value :simple))]
    (when-not (get-method u.humanization/name->human-readable-name new-strategy)
      (throw (IllegalArgumentException.
              (tru "Invalid humanization strategy ''{0}''. Valid strategies are: {1}"
                   new-strategy (keys (methods u.humanization/name->human-readable-name))))))
    (let [old-strategy (setting/get-value-of-type :keyword :humanization-strategy)]
      (setting/set-value-of-type! :keyword :humanization-strategy new-value)
      (log/infof "Changing Table & Field names humanization strategy from '%s' to '%s'"
                 (name old-strategy) (name new-strategy))
      (humanization/re-humanize-table-and-field-names! old-strategy))))

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
