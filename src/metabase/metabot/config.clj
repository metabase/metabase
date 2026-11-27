(ns metabase.metabot.config
  (:require
   [metabase.api.common :as api]
   [metabase.embedding.util :as embedding.util]
   [metabase.llm.settings :as llm.settings]
   [metabase.metabot.db :as metabot.db]
   [metabase.metabot.settings :as metabot.settings]
   [metabase.request.core :as request]))

(def internal-metabot-id
  "The entity ID of the internal Metabot instance."
  "metabotmetabotmetabot")

(def embedded-metabot-id
  "The entity ID of the embedded Metabot instance."
  "embeddedmetabotmetabo")

(def legacy-metabot-ids
  "Legacy UUIDs mapped to Metabot entity IDs."
  {"b5716059-ad40-4d83-a4e1-673af020b2d8" internal-metabot-id
   "c61bf5f5-1025-47b6-9298-bf1827105bb6" embedded-metabot-id})

(defn any-metabot-enabled?
  "Returns true if at least one of the metabot instances (internal or embedded) is enabled."
  []
  (and (llm.settings/ai-features-enabled?)
       (or (metabot.settings/metabot-enabled?)
           (metabot.settings/embedded-metabot-enabled?))))

(defn check-metabot-enabled!
  "Throws a 403 if metabot is not enabled. When called with no arguments, checks that at least one metabot instance is
   enabled. When called with a Metabot row, checks the specific instance's setting."
  ([]
   (api/check (llm.settings/ai-features-enabled?)
              [403 "AI features are not enabled."])
   (api/check (any-metabot-enabled?)
              [403 "Metabot is not enabled."]))
  ([metabot]
   (api/check (llm.settings/ai-features-enabled?)
              [403 "AI features are not enabled."])
   (if (= (:entity_id metabot) embedded-metabot-id)
     (api/check (metabot.settings/embedded-metabot-enabled?)
                [403 "Embedded Metabot is not enabled."])
     (api/check (metabot.settings/metabot-enabled?)
                [403 "Metabot is not enabled."]))))

(defn embedded-request?
  "Whether `request` comes from an embed: an `<iframe>` (`X-Metabase-Embedded`) or the SDK or modular embedding
  (`X-Metabase-Client`). Matches the frontend's choice between `embedded-metabot-enabled?` and `metabot-enabled?`.
  The headers are set by the client, so this picks a product switch and is not a security boundary."
  [request]
  (boolean (and request
                (or (request/embedded? request)
                    (embedding.util/is-modular-embedding-request? request)))))

(defn metabot-enabled-for-request?
  "Whether the Metabot switch for the audience of the bound request is on: `embedded-metabot-enabled?` for an embed,
  `metabot-enabled?` otherwise. True when no request is bound, since background work isn't tied to an audience and
  checks its own switch."
  []
  (let [req (request/current-request)]
    (cond
      (nil? req)              true
      (embedded-request? req) (metabot.settings/embedded-metabot-enabled?)
      :else                   (metabot.settings/metabot-enabled?))))

(defn check-metabot-enabled-for-request!
  "Throw a 403 unless the Metabot switch for the bound request's audience is on. See
  [[metabot-enabled-for-request?]]."
  []
  (api/check (metabot-enabled-for-request?)
             [403 "Metabot is not enabled."]))

(defn metabot-id->profile-id
  "Return the configured profile ID for a Metabot entity ID, or nil."
  [metabot-id]
  (get {internal-metabot-id "internal"
        embedded-metabot-id "embedding_next"}
       metabot-id))

(defn resolve-dynamic-metabot-id
  "Resolve an explicit ID, the configured ID, or the internal Metabot entity ID.

  Maps UUIDs in [[legacy-metabot-ids]] to their entity IDs."
  [metabot-id]
  (let [metabot-id (or metabot-id
                       (metabot.settings/metabot-id)
                       internal-metabot-id)]
    (get legacy-metabot-ids metabot-id metabot-id)))

(defn find-metabot
  "Return the Metabot row for an entity ID, a legacy UUID, or a numeric primary key, or nil.

  A nil ID uses the configured or internal Metabot."
  [metabot-id]
  (if (integer? metabot-id)
    (metabot.db/metabot metabot-id)
    (metabot.db/metabot-by-entity-id (resolve-dynamic-metabot-id metabot-id))))

(defn resolve-metabot
  "Return the Metabot row for an entity ID, a legacy UUID, or a numeric primary key.

  A nil ID uses the configured or internal Metabot. Throws a 400 if the ID matches no Metabot."
  [metabot-id]
  (let [metabot (find-metabot metabot-id)]
    (api/check metabot [400 "Unknown Metabot."])
    metabot))

(defn resolve-dynamic-profile-id
  "Resolve the profile ID: explicit profile-id > metabot-id->profile-id > embedding_next.
   Throws a 400 for retired profiles without a replacement."
  ([profile-id]
   (resolve-dynamic-profile-id profile-id (resolve-dynamic-metabot-id nil)))
  ([profile-id metabot-id]
   (let [profile-id (or profile-id
                        (metabot-id->profile-id metabot-id)
                        "embedding_next")]
     (api/check (not= (some-> profile-id name) "transforms_codegen")
                [400 "Transform code generation is no longer supported."])
     profile-id)))
