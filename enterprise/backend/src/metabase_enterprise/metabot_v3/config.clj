(ns metabase-enterprise.metabot-v3.config
  (:require
   [metabase-enterprise.metabot-v3.settings :as metabot-v3.settings]
   [toucan2.core :as t2]))

(def internal-metabot-id
  "The UUID of the internal Metabot instance."
  "b5716059-ad40-4d83-a4e1-673af020b2d8")

(def embedded-metabot-id
  "The UUID of the embedded Metabot instance."
  "c61bf5f5-1025-47b6-9298-bf1827105bb6")

(def metabot-config
  "Configuration for the built-in metabot instances."
  {internal-metabot-id {:entity-id "metabotmetabotmetabot"}
   embedded-metabot-id {:entity-id "embeddedmetabotmetabo"}})

(defn normalize-metabot-id
  "Return the primary key for the metabot instance identified by `metabot-id`.

  Returns nil if no entry can be found.
  The provided ID can be a UUID from [[metabot-config]] or an entity_id of a Metabot instance."
  [metabot-id]
  (t2/select-one-pk :model/Metabot :entity_id (get-in metabot-config [metabot-id :entity-id] metabot-id)))

(defn resolve-dynamic-metabot-id
  "Resolve dynamic metabot ID with logical fall backs.
   Precedence: explicit metabot-id > env metabot-id > default (internal)"
  [metabot-id]
  (or metabot-id
      (metabot-v3.settings/metabot-id)
      internal-metabot-id))
