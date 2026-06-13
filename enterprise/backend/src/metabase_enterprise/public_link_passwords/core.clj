(ns metabase-enterprise.public-link-passwords.core
  "EE implementation of public-link password management, gated on the `:public-link-passwords` premium token."
  (:require
   [metabase.analytics.core :as analytics]
   [metabase.api.common :as api]
   [metabase.events.core :as events]
   [metabase.premium-features.core :refer [defenterprise]]
   [metabase.util.i18n :refer [tru]]
   [toucan2.core :as t2]))

(def ^:private min-password-length 6)

(defn- validate-password [password]
  (api/check (>= (count password) min-password-length)
             [400 (tru "Password must be at least {0} characters." min-password-length)]))

(defn- model->event-prefix [model]
  (case model
    :model/Card      "card"
    :model/Dashboard "dashboard"))

(defn- track-password-action!
  "Record a password action on both the audit log and Snowplow. Tracking lives on the backend so it captures
  direct API calls, and so every action (set/reveal/delete) is tracked consistently."
  [model id audit-suffix snowplow-event]
  (let [prefix (model->event-prefix model)]
    (events/publish-event! (keyword "event" (str prefix "-public-pwd-" audit-suffix))
                           {:object-id id
                            :user-id   api/*current-user-id*})
    (analytics/track-event! :snowplow/simple_event
                            {:event        snowplow-event
                             :event_detail prefix})))

(defenterprise set-public-link-password!
  "Validate and store a password on a public link. Encryption is handled by the model's
  `:public_link_password` transform, so the plaintext is passed through as-is here. Tracked."
  :feature :public-link-passwords
  [model id password]
  (validate-password password)
  (t2/update! model id {:public_link_password password})
  (track-password-action! model id "set" "public_link_password_set"))

(defenterprise get-public-link-password-existence
  "Return whether a public link has a password set, without exposing the secret. Not tracked, so it
  is safe to call when rendering the sharing UI."
  :feature :public-link-passwords
  [model id]
  {:has_password (some? (t2/select-one-fn :public_link_password model :id id))})

(defenterprise get-public-link-password-value
  "Return the decrypted plaintext password for a public link. Tracked, since reading the secret is the
  \"reveal\" action."
  :feature :public-link-passwords
  [model id]
  (let [password (t2/select-one-fn :public_link_password model :id id)]
    (api/check-404 password)
    (track-password-action! model id "revealed" "public_link_password_revealed")
    {:password password}))

(defenterprise delete-public-link-password!
  "Remove the password from a public link without revoking it. Tracked."
  :feature :public-link-passwords
  [model id]
  (t2/update! model id {:public_link_password nil})
  (track-password-action! model id "deleted" "public_link_password_removed"))
