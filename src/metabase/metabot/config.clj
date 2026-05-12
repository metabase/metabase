(ns metabase.metabot.config
  (:require
   [medley.core :as m]
   [metabase.api.common :as api]
   [metabase.llm.settings :as llm.settings]
   [metabase.metabot.settings :as metabot.settings]
   [toucan2.core :as t2]))

(def internal-metabot-id
  "The ID of the internal Metabot instance."
  "b5716059-ad40-4d83-a4e1-673af020b2d8")

(def embedded-metabot-id
  "The ID of the embedded Metabot instance."
  "c61bf5f5-1025-47b6-9298-bf1827105bb6")

(def slackbot-metabot-id
  "The ID of the Slack Metabot instance."
  "9a89fe64-54b9-4ab2-8022-eccd772e5073")

(defn any-metabot-enabled?
  "Returns true if at least one of the metabot instances (internal or embedded) is enabled."
  []
  (and (llm.settings/ai-features-enabled?)
       (or (metabot.settings/metabot-enabled?)
           (metabot.settings/embedded-metabot-enabled?))))

(defn check-metabot-enabled!
  "Throws a 403 if metabot is not enabled. When called with no arguments, checks that at least one metabot instance is
   enabled. When called with a `metabot-id`, checks the specific instance's setting."
  ([]
   (api/check (llm.settings/ai-features-enabled?)
              [403 "AI features are not enabled."])
   (api/check (any-metabot-enabled?)
              [403 "Metabot is not enabled."]))
  ([metabot-id]
   (api/check (llm.settings/ai-features-enabled?)
              [403 "AI features are not enabled."])
   (if (= metabot-id embedded-metabot-id)
     (api/check (metabot.settings/embedded-metabot-enabled?)
                [403 "Embedded Metabot is not enabled."])
     (api/check (metabot.settings/metabot-enabled?)
                [403 "Metabot is not enabled."]))))

(def metabot-config
  "The name of the collection exposed by the answer-sources tool."
  {internal-metabot-id {:profile-id "internal"
                        :entity-id "metabotmetabotmetabot"}
   embedded-metabot-id {:profile-id "embedding_next"
                        :entity-id "embeddedmetabotmetabo"}
   slackbot-metabot-id {:profile-id "slackbot"
                        :entity-id "slackbotmetabotmetabo"}})

(defn metabot-id->profile-id
  "Return the profile-id for the Metabot instance with ID `metabot-id` or \"default\" if no profile-id is configured."
  [metabot-id]
  (or (get-in metabot-config [metabot-id :profile-id])
      (:profile-id (m/find-first #(when (= (:entity-id %) metabot-id)
                                    (:profile-id %))
                                 (vals metabot-config)))))

(defn normalize-metabot-id
  "Return the primary key for the metabot instance identified by `metabot-id`.

  Returns nil if no entry can be found.
  The provided ID can be a UUID from [[metabot-config]] or an entity_id of a Metabot instance."
  [metabot-id]
  (t2/select-one-pk :model/Metabot :entity_id (get-in metabot-config [metabot-id :entity-id] metabot-id)))

(defn resolve-dynamic-metabot-id
  "Resolve dynamic metabot ID with logical fall backs
   Precedence: explicit metabot-id > env metabot-id > default (internal)"
  [metabot-id]
  (or metabot-id
      (metabot.settings/metabot-id)
      internal-metabot-id))

(defn resolve-dynamic-profile-id
  "Resolve the ultimate ai-service profile ID with logical fall backs
   Precedence: explicit profile_id > env profile_id > metabot-id->profile-id > default (embedding_next)"
  ([profile-id]
   (resolve-dynamic-profile-id profile-id (resolve-dynamic-metabot-id nil)))
  ([profile-id metabot-id]
   (or profile-id
       (metabot-id->profile-id metabot-id)
       "embedding_next")))
