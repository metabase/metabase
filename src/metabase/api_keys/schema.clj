(ns metabase.api-keys.schema
  (:require
   [clojure.math :as math]
   [clojure.string :as str]
   [malli.core :as mc]
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
  [:enum :scim])

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
   [:single_collection_id {:optional true} [:maybe pos-int?]]])

(defn- insert-schema [map-schema]
  (into [:map]
        (map (fn [[k properties schema]]
               (if properties
                 [k
                  (cond-> properties
                    (::insert.optional properties) (assoc :optional true))
                  schema]
                 [k schema])))
        (mc/children (mr/resolve-schema map-schema))))

(mr/def ::api-key.insert
  (insert-schema ::api-key))

(defn- update-schema [map-schema]
  (into [:map]
        (map (fn [[k properties schema]]
               [k
                (assoc properties :optional true)
                schema]))
        (mc/children (mr/resolve-schema map-schema))))

(mr/def ::api-key.update
  (update-schema ::api-key))
