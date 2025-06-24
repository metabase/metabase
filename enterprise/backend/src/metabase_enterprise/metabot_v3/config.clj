(ns metabase-enterprise.metabot-v3.config
  (:require
   [medley.core :as m]
   [toucan2.core :as t2]))

(def internal-metabot-id
  "The ID of the internal Metabot instance."
  "b5716059-ad40-4d83-a4e1-673af020b2d8")

(def embedded-metabot-id
  "The ID of the embedded Metabot instance."
  "c61bf5f5-1025-47b6-9298-bf1827105bb6")

(def metabot-config
  "The name of the collection exposed by the answer-sources tool."
  {internal-metabot-id {:profile-id "experimental"
                        :entity-id "metabotmetabotmetabot"}
   embedded-metabot-id {:profile-id "default"
                        :entity-id "embeddedmetabotmetabo"}})

(defn metabot-profile-id
  "Return the profile-id for the Metabot instance with ID `metabot-id` or \"default\" if no profile-id is configured."
  [metabot-id]
  (or (get-in metabot-config [metabot-id :profile-id])
      (m/find-first #(when (= (:entity-id %) metabot-id)
                       (:profile-id %))
                    (vals metabot-config))
      "default"))

(defn normalize-metabot-id
  "Return the primary key for the metabot instance identified by `metabot-id`.

  Returns nil, no entry can be found.
  The provided ID can be a UUID from [[metabot-config]] or an entity_id of a Metabot instance."
  [metabot-id]
  (t2/select-one-pk :model/Metabot :entity_id (get-in metabot-config [metabot-id :entity-id] metabot-id)))
