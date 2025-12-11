(ns metabase-enterprise.metabot-v3.config
  (:require
   [metabase-enterprise.metabot-v3.settings :as metabot-v3.settings]
   [metabase.util.log :as log]
   [toucan2.core :as t2]))

(def metabot-config
  "Configuration for the built-in metabot instances."
  {metabot-v3.settings/internal-metabot-uuid {:entity-id metabot-v3.settings/internal-metabot-entity-id
                                              :default-use-case "omnibot"}
   metabot-v3.settings/embedded-metabot-uuid {:entity-id metabot-v3.settings/embedded-metabot-entity-id
                                              :default-use-case "embedding"}})

(defn normalize-metabot-id
  "Return the primary key for the metabot instance identified by `metabot-id`.

  Returns nil if no entry can be found.
  The provided ID can be a UUID from [[metabot-config]] or an entity_id of a Metabot instance."
  [metabot-id]
  (t2/select-one-pk :model/Metabot :entity_id (get-in metabot-config [metabot-id :entity-id] metabot-id)))

(defn default-use-case
  "Return the default use case for a metabot. Falls back to \"omnibot\" for unknown metabots."
  [metabot-id]
  (or (get-in metabot-config [metabot-id :default-use-case])
      "omnibot"))

(defn resolve-dynamic-metabot-id
  "Resolve dynamic metabot ID with logical fall backs.
   Precedence: explicit metabot-id > env metabot-id > default (internal)"
  [metabot-id]
  (or metabot-id
      (metabot-v3.settings/metabot-id)
      metabot-v3.settings/internal-metabot-uuid))

(defn fetch-use-case
  "Fetch the use case configuration for a metabot instance.

   Arguments:
   - metabot-pk: The primary key of the metabot instance
   - use-case: The use case name (e.g., \"nlq\", \"transforms\")

   Returns a map with :profile and :enabled keys, or nil if use case not found."
  [metabot-pk use-case]
  (when (and metabot-pk use-case)
    (let [use-case-info (t2/select-one [:model/MetabotUseCase :profile :enabled]
                                       :metabot_id metabot-pk
                                       :name use-case)]
      (when-not use-case-info
        (log/warnf "No use case found for metabot %d with name %s" metabot-pk use-case))
      use-case-info)))
