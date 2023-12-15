(ns metabase.models.api-key
  (:require [crypto.random :as crypto-random]
            [metabase.util.password :as u.password]
            [methodical.core :as methodical]
            [toucan2.core :as t2]))

;; the prefix length, the length of `mb_1234`
(def ^:private prefix-length 7)

;; the total number of bytes of randomness we generate for API keys
(def ^:private bytes-key-length 32)

(methodical/defmethod t2/table-name :model/ApiKey [_model] :api_key)

(doto :model/ApiKey
  (derive :metabase/model)
  (derive :hook/timestamped?))

(defn prefix
  "Given an API key, returns the standardized prefix for that API key."
  [key]
  (apply str (take prefix-length key)))

(defn- add-prefix [{:keys [unhashed_key] :as api-key}]
  (cond-> api-key
    key (assoc :key_prefix (prefix unhashed_key))))

(defn mask
  "Given an API key, returns a string of the same length with all but the prefix masked with `*`s"
  [key]
  (->> (concat (prefix key) (repeat "*"))
       (take (count key))
       (apply str)))

(defn generate-key
  "Generates a new API key - a random base64 string prefixed with `mb_`"
  []
  (str "mb_" (crypto-random/base64 bytes-key-length)))

(defn- add-key
  "Adds the `key` based on the `unhashed_key` passed in."
  [{:keys [unhashed_key] :as api-key}]
  (cond-> api-key
    unhashed_key (assoc :key (u.password/hash-bcrypt unhashed_key))
    true (dissoc :unhashed_key)))

(t2/define-before-insert :model/ApiKey
  [api-key]
  (-> api-key
      add-prefix
      add-key))

(t2/define-before-update :model/ApiKey
  [api-key]
  (-> api-key
      add-prefix
      add-key))
