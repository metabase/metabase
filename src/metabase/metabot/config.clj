(ns metabase.metabot.config
  (:require
   [clojure.string :as str]
   [metabase.api.common :as api]
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

(def audiences
  "Who a one-call AI feature serves, which picks the Metabot setting it needs.
  The `:internal` audience is the Metabase app (`metabot-enabled?`), `:embedded` an embed (`embedded-metabot-enabled?`),
  and `:any` work for no one audience, such as a background job, which needs either setting on."
  #{:internal :embedded :any})

(defn audience-enabled?
  "Whether the Metabot setting for `audience`, one of [[audiences]], is on."
  [audience]
  (case audience
    :internal (metabot.settings/metabot-enabled?)
    :embedded (metabot.settings/embedded-metabot-enabled?)
    :any      (any-metabot-enabled?)))

(defn metabot-audience
  "The audience of `metabot`, a Metabot row: `:embedded` for the embedded Metabot, `:internal` for any other.
  The same rule as [[check-metabot-enabled!]]."
  [metabot]
  (if (= (:entity_id metabot) embedded-metabot-id) :embedded :internal))

(defn request-audience
  "The audience of `request`, for an endpoint that has no Metabot to go by.
  It is `:embedded` when the request comes from an `<iframe>` (`X-Metabase-Embedded`) or sends any
  `X-Metabase-Client`, which the SDK, modular embedding, data apps and MCP apps all do and the Metabase app does only
  inside an `<iframe>`, and `:internal` otherwise.
  Matches the frontend's choice between the two settings.
  The headers come from the client, so this picks a product setting and is not a security boundary."
  [request]
  (if (or (request/embedded? request)
          (not (str/blank? (get-in request [:headers "x-metabase-client"]))))
    :embedded
    :internal))

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
