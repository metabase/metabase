(ns metabase.metabot.config
  (:require
   [metabase.api.common :as api]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.llm.settings :as llm.settings]
   [metabase.metabot.db :as metabot.db]
   [metabase.metabot.schema :as metabot.schema]
   [metabase.metabot.settings :as metabot.settings]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]))

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

(mr/def ::kind-config
  "What a Metabot kind decides. `:enabled?` is the var of the setting that turns the kind on, and `:confined?` keeps
  search inside the Metabot's own collection."
  [:map {:closed true}
   [:entity-id        {:optional true} :string]
   [:profile-id       :string]
   [:enabled?         [:fn var?]]
   [:disabled-message :string]
   [:confined?        :boolean]])

(def ^:private kinds
  "Each Metabot kind and what it decides. A kind with an `:entity-id` is built in. `:custom` covers every other row,
  for example a Metabot imported with serdes."
  {:internal {:entity-id        internal-metabot-id
              :profile-id       "internal"
              :enabled?         #'metabot.settings/metabot-enabled?
              :disabled-message "Metabot is not enabled."
              :confined?        false}
   :embedded {:entity-id        embedded-metabot-id
              :profile-id       "embedding_next"
              :enabled?         #'metabot.settings/embedded-metabot-enabled?
              :disabled-message "Embedded Metabot is not enabled."
              :confined?        true}
   :custom   {:profile-id       "embedding_next"
              :enabled?         #'metabot.settings/metabot-enabled?
              :disabled-message "Metabot is not enabled."
              :confined?        false}})

(when-let [error (mr/explain [:map-of :keyword ::kind-config] kinds)]
  (throw (ex-info "Invalid Metabot kinds" {:error error})))

(mr/def ::kind
  "The role of a Metabot row: a built-in kind, or `:custom`."
  (into [:enum] (keys kinds)))

(mr/def ::resolved-metabot
  "A Metabot row from [[resolve-metabot]]. The columns that decide the scope are required, and `:kind` names the
  role of the row."
  [:merge
   ::metabot.schema/metabot
   [:map {:closed true}
    [:entity_id            :string]
    [:collection_id        [:maybe ::lib.schema.id/collection]]
    [:use_verified_content [:maybe :boolean]]
    [:kind                 ::kind]]])

(mr/def ::metabot-ref
  "How a request names a Metabot: a primary key, an entity ID, or a legacy UUID from [[legacy-metabot-ids]]."
  [:or ms/PositiveInt ms/NonBlankString])

(def ^:private entity-id->kind
  (into {} (keep (fn [[kind {:keys [entity-id]}]] (when entity-id [entity-id kind]))) kinds))

(defn- entity-id-kind
  [entity-id]
  (get entity-id->kind entity-id :custom))

(defn kind-config
  "Return the [[::kind-config]] of a [[::resolved-metabot]]. Throws when the value has no known `:kind`, so a Metabot row
  that did not come from [[resolve-metabot]] cannot select a default."
  [metabot]
  (or (get kinds (:kind metabot))
      (throw (ex-info "Metabot has no known :kind; get it from resolve-metabot."
                      {:kind (:kind metabot), :entity_id (:entity_id metabot)}))))

(defn enabled-builtin-metabot-ids
  "The entity IDs of the built-in Metabots whose setting is on."
  []
  (for [{:keys [entity-id enabled?]} (vals kinds)
        :when (and entity-id (enabled?))]
    entity-id))

(defn any-metabot-enabled?
  "Returns true if at least one of the metabot instances (internal or embedded) is enabled."
  []
  (and (llm.settings/ai-features-enabled?)
       (boolean (some (fn [{:keys [enabled?]}] (enabled?)) (vals kinds)))))

(defn check-metabot-enabled!
  "Throws a 403 if metabot is not enabled. When called with no arguments, checks that at least one metabot instance is
   enabled. When called with a [[::resolved-metabot]], checks the setting of its kind."
  ([]
   (api/check (llm.settings/ai-features-enabled?)
              [403 "AI features are not enabled."])
   (api/check (any-metabot-enabled?)
              [403 "Metabot is not enabled."]))
  ([metabot]
   (let [{:keys [enabled? disabled-message]} (kind-config metabot)]
     (api/check (llm.settings/ai-features-enabled?)
                [403 "AI features are not enabled."])
     (api/check (enabled?)
                [403 disabled-message]))))

(defn resolve-dynamic-metabot-id
  "Resolve an explicit ID, the configured ID, or the internal Metabot entity ID.

  Maps UUIDs in [[legacy-metabot-ids]] to their entity IDs."
  [metabot-id]
  (let [metabot-id (or metabot-id
                       (metabot.settings/metabot-id)
                       internal-metabot-id)]
    (get legacy-metabot-ids metabot-id metabot-id)))

(defn find-metabot
  "Return the [[::resolved-metabot]] for a [[::metabot-ref]], or nil.

  A nil ID uses the configured or internal Metabot."
  [metabot-id]
  (when-let [row (if (integer? metabot-id)
                   (metabot.db/metabot metabot-id)
                   (metabot.db/metabot-by-entity-id (resolve-dynamic-metabot-id metabot-id)))]
    (assoc row :kind (entity-id-kind (:entity_id row)))))

(defn resolve-metabot
  "Return the [[::resolved-metabot]] for a [[::metabot-ref]].

  A nil ID uses the configured or internal Metabot. Throws a 400 if the ID matches no Metabot."
  [metabot-id]
  (or (find-metabot metabot-id)
      (let [setting-id (when (nil? metabot-id) (metabot.settings/metabot-id))]
        (throw (ex-info (if setting-id
                          (tru "The metabot-id setting (MB_METABOT_ID) names no Metabot: {0}" setting-id)
                          (tru "Unknown Metabot."))
                        {:status-code 400})))))

(defn resolve-dynamic-profile-id
  "Resolve the profile ID: explicit profile-id > the profile of the Metabot kind.
   Throws a 400 for retired profiles without a replacement."
  ([profile-id]
   (resolve-dynamic-profile-id profile-id (resolve-dynamic-metabot-id nil)))
  ([profile-id metabot-id]
   (let [profile-id (or profile-id
                        (:profile-id (get kinds (entity-id-kind metabot-id))))]
     (api/check (not= (some-> profile-id name) "transforms_codegen")
                [400 "Transform code generation is no longer supported."])
     profile-id)))
