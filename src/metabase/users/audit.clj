(ns metabase.users.audit
  "What the audit spec of a User needs beyond its columns."
  (:require
   [metabase.util.events :as u.events]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn details
  "The details to store for the User `row` beside its columns: the Groups it belongs to and how it was invited."
  [row _event]
  (select-keys (t2/hydrate row :user_group_memberships)
               [:groups :invite_method :user_group_memberships]))

(defn- api-key-user?
  "Whether the User of `event` is the one that an API key owns, which no page lists."
  [{:keys [object previous-object]}]
  (= "api-key" (some-> (or object previous-object) :type name)))

(defn update-topic
  "The topic to store for the update `event` of a User, nil for that of the User of an API key."
  [event]
  (when-not (api-key-user? event)
    :user-update))

(defn- activation-changed?
  "Whether the update `event` of a User changes whether it is active, other than that of the User of an API key."
  [{:keys [previous-object] :as event}]
  (and (some? previous-object)
       (u.events/changed? event :is_active)
       (not (api-key-user? event))))

(defn reactivated?
  "Whether the `event` of a write of a User makes it active again."
  [{:keys [object] :as event}]
  (and (activation-changed? event)
       (boolean (:is_active object))))

(defn deactivated?
  "Whether the `event` of a write of a User makes it inactive."
  [{:keys [object] :as event}]
  (and (activation-changed? event)
       (not (:is_active object))))
