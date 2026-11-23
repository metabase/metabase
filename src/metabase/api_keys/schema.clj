(ns metabase.api-keys.schema
  (:require
   [clojure.math :as math]
   [clojure.string :as str]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]
   [metabase.util.secret]))

(def prefix-length
  "The prefix length, the length of `mb_1234`"
  7)

(def generated-bytes-key-length
  "The total number of bytes of randomness we generate for API keys."
  32)

(def generated-string-key-length
  "Total length of an unhashed API key `key` string, including the `mb_` prefix."
  (let [num-bits   (* generated-bytes-key-length 8)
        num-unpadded-chars  (/ num-bits 6)              ; base-64 uses one character for every 6 bits
        num-blocks (math/ceil (/ num-unpadded-chars 4)) ; base-64 adds padding so the number of chars is divisible by 4
        num-chars  (* num-blocks 4)]
    (long (+ num-chars 3))))                            ; add 3 characters for the `mb_` prefix

;;; these numbers are taken from the documentation. If you let us make you a key it will
;;; be [[generated-string-key-length]] long, but if you're supplying your own e.g. with EE config files then it has to
;;; fall in this range.
(def ^:private minimum-string-key-length 12)
(def ^:private maximum-string-key-length 254)

(mr/def ::key.raw
  "Unhashed string of the form 'mb_<base-64-bytes>'."
  [:and
   [:string {:min minimum-string-key-length, :max maximum-string-key-length}]
   ;; TODO (cam 8/13/25) -- we could also enforce that this string only uses valid base-64 characters since that is
   ;; technically the rule
   [:fn
    {:error/message "An API token key must start with 'mb_'"}
    (fn [s]
      (and (string? s)
           (str/starts-with? s "mb_")))]])

(mr/def ::key.masked
  "Masked string like 'mb_1234**********'."
  [:and
   [:ref ::key.raw]
   [:re
    {:error/message "Masked key like 'mb_1234**********'"}
    (re-pattern (format "^mb_.*{%d}\\*+$" (- prefix-length 3)))]])

(mr/def ::key.secret
  [:ref :metabase.util.secret/secret])

(mr/def ::key.unhashed-or-secret
  [:or
   [:ref ::key.raw]
   [:ref ::key.secret]])

(mr/def ::key.hashed
  "BCrypt-hashed API key string."
  [:and
   [:string {:min 60, :max 60}] ; bcrypt hashes are 60 characters, at least ours always are.
   [:fn
    {:error/message "A hashed API token key should NOT start with `mb_` (this means it is unhashed)."}
    (fn [s]
      (and (string? s)
           (not (str/starts-with? s "mb_"))))]])

(mr/def ::id
  "An ID of a `:model/ApiKey`."
  ms/PositiveInt)

(mr/def ::prefix
  "Prefix string of an API Key, suitable for passing around unmasked. This must be unique."
  [:string {:min prefix-length, :max prefix-length}])

(mr/def ::name
  [:string {:min 1, :max 254}]) ; min/max are from the app DB being varchar(254)

(mr/def ::scope
  "What a scoped key is for. A `:scim` key authenticates only the SCIM API; a `:workspace-manager` key is
  accepted only on endpoints tagged with the `mb:workspace-manager` scope (403 elsewhere)."
  [:enum :scim :workspace-manager])

(mr/def ::timestamp
  [:or
   (ms/InstanceOfClass java.time.OffsetDateTime)
   (ms/InstanceOfClass java.time.ZonedDateTime)])

(mr/def ::api-key
  "Schema for a `:model/ApiKey`; this is based on the `api_key` table as defined in the application database.

  This schema corresponds to a row as you would get with `SELECT`."
  [:map
   {:closed true}
   [:id                   {::insert.optional true} ::id]
   [:user_id              {:optional true} [:maybe pos-int?]]
   [:key                  [:ref ::key.hashed]]
   [:key_prefix           [:ref ::prefix]]
   [:creator_id           pos-int?]
   [:created_at           {::insert.optional true} [:ref ::timestamp]]
   [:updated_at           {::insert.optional true} [:ref ::timestamp]]
   [:name                 [:ref ::name]]
   [:updated_by_id        pos-int?]
   [:scope                {:optional true} [:maybe [:ref ::scope]]]
   [:single_collection_id {:optional true} [:maybe pos-int?]]
   [:last_used_at         {:optional true} [:maybe [:ref ::timestamp]]]
   ;; added by the model's after-select hook
   [:masked_key           {:optional true} :string]])

(mr/def ::api-key.create
  "What an insert of a ApiKey accepts: every column of `:api_key` except `id`, all optional, plus `:metabase.api-keys.core/unhashed-key` consumed by the model's hooks."
  [:map {:closed true}
   [:user_id                             {:optional true} [:maybe ::lib.schema.id/user]]
   [:key                                 {:optional true} [:maybe :string]]
   [:key_prefix                          {:optional true} [:maybe :string]]
   [:creator_id                          {:optional true} [:maybe ::lib.schema.id/user]]
   [:created_at                          {:optional true} [:maybe ms/TemporalInstant]]
   [:updated_at                          {:optional true} [:maybe ms/TemporalInstant]]
   [:name                                {:optional true} [:maybe :string]]
   [:updated_by_id                       {:optional true} [:maybe ms/PositiveInt]]
   [:scope                               {:optional true} [:maybe [:or :keyword :string]]]
   [:metabase.api-keys.core/unhashed-key {:optional true} ::key.unhashed-or-secret]])

(mr/def ::api-key.update
  "What an update of an ApiKey takes: its `:id` and a new name, the group of the User created for the key under
  `:metabase.api-keys.core/group-id`, or a regenerated key."
  [:map {:closed true}
   [:id                              ::id]
   [:name                           {:optional true} ::name]
   [:metabase.api-keys.core/group-id {:optional true} pos-int?]
   [:key                             {:optional true} [:ref ::key.hashed]]
   [:key_prefix                      {:optional true} [:ref ::prefix]]
   [:updated_by_id                   {:optional true} pos-int?]])

(mr/def ::api-key-usage-log.create
  "What recording one ApiKeyUsageLog takes: the request an API key authenticated, as the usage middleware sees it."
  [:map {:closed true}
   [:api_key_id         [:maybe ::id]]
   [:user_id            [:maybe ::lib.schema.id/user]]
   [:created_by_id      [:maybe ::lib.schema.id/user]]
   [:route_template     :string]
   [:http_method        [:maybe :string]]
   [:status             [:maybe :int]]
   [:duration_ms        [:maybe number?]]
   [:occurred_at        [:ref ::timestamp]]
   [:client_name        [:maybe :string]]
   [:embedding_client   [:maybe :string]]
   [:embedding_hostname [:maybe :string]]
   [:user_agent         {:optional true} [:maybe :string]]
   [:ip_address         {:optional true} [:maybe :string]]])
