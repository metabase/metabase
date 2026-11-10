(ns metabase.actions.secrets
  "Secrets that HTTP actions fill into their requests, sent only to their allowed hosts."
  (:require
   [clojure.string :as str]
   [medley.core :as m]
   [metabase.actions.db :as actions.db]
   [metabase.actions.schema :as actions.schema]
   [metabase.api.common :as api]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli :as mu]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- normalize-hosts
  "`hosts` trimmed, lower-cased and without duplicates."
  [hosts]
  (into [] (comp (map (comp u/lower-case-en str/trim)) (distinct)) hosts))

(defn- check-name-available
  "Throws a 400 when a secret other than the one with `except-id` has `secret-name`."
  [secret-name except-id]
  (when (actions.db/action-secret-with-name-exists? secret-name except-id)
    (throw (ex-info (tru "A secret named {0} already exists." secret-name) {:status-code 400}))))

(mu/defn secrets :- [:sequential ::actions.schema/action-secret]
  "Every secret with its creator, without its value."
  []
  (t2/hydrate (actions.db/action-secrets) :creator))

(mu/defn secret :- ::actions.schema/action-secret
  "The secret with `secret-id` and its creator, without its value; throws a 404 when there is none."
  [secret-id :- pos-int?]
  (t2/hydrate (api/check-404 (actions.db/action-secret secret-id)) :creator))

(mu/defn create-secret! :- ::actions.schema/action-secret
  "Creates a secret by `creator-id` and returns it without its value."
  [{secret-name :name, :keys [value allowed_hosts]} :- ::actions.schema/action-secret.create-request
   creator-id                                     :- [:maybe pos-int?]]
  (check-name-available secret-name nil)
  (secret (actions.db/insert-action-secret! {:name          secret-name
                                             :value         value
                                             :allowed_hosts (normalize-hosts allowed_hosts)
                                             :creator_id    creator-id})))

(mu/defn update-secret! :- ::actions.schema/action-secret
  "Applies `changes` to the secret with `secret-id`, keeping its value when `changes` has a blank one, and returns it
  without its value."
  [secret-id :- pos-int?
   changes   :- ::actions.schema/action-secret.update-request]
  (api/check-404 (actions.db/action-secret secret-id))
  (when-let [secret-name (:name changes)]
    (check-name-available secret-name secret-id))
  (let [changes (cond-> (dissoc changes :value)
                  (not (str/blank? (:value changes))) (assoc :value (:value changes))
                  (:allowed_hosts changes)            (update :allowed_hosts normalize-hosts))]
    (when (seq changes)
      (actions.db/update-action-secret! secret-id changes))
    (secret secret-id)))

(mu/defn delete-secret! :- :nil
  "Deletes the secret with `secret-id`; throws a 404 when there is none."
  [secret-id :- pos-int?]
  (api/check-404 (actions.db/action-secret secret-id))
  (actions.db/delete-action-secret! secret-id)
  nil)

(mu/defn request-secrets :- [:map-of :string ::actions.schema/action-secret.with-value]
  "The secrets named `secret-names`, by name; throws a 400 naming those that don't exist."
  [secret-names :- [:set :string]]
  (if (empty? secret-names)
    {}
    (let [by-name (m/index-by :name (actions.db/action-secrets-with-values secret-names))
          missing (sort (remove by-name secret-names))]
      (when (seq missing)
        (throw (ex-info (tru "No secret is named {0}." (str/join ", " missing)) {:status-code 400})))
      by-name)))
