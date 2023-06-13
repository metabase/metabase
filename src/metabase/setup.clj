(ns metabase.setup
  (:require
   [environ.core :as env]
   [metabase.config :as config]
   [metabase.db.connection :as mdb.connection]
   [metabase.models.setting :as setting :refer [defsetting Setting]]
   [metabase.models.user :refer [User]]
   [toucan2.core :as t2])
  (:import
   (java.util UUID)))

(set! *warn-on-reflection* true)

(defsetting setup-token
  "A token used to signify that an instance has permissions to create the initial User. This is created upon the first
  launch of Metabase, by the first instance; once used, it is cleared out, never to be used again."
  :visibility :public
  :setter     :none)

(defn token-match?
  "Function for checking if the supplied string matches our setup token.
   Returns boolean `true` if supplied token matches the setup token, `false` otherwise."
  [token]
  {:pre [(string? token)]}
  (= token (setup-token)))

(defn create-token!
  "Create and set a new setup token, if one has not already been created. Returns the newly created token."
  []
  ;; fetch the value directly from the DB; *do not* rely on cached value, in case a different instance came along and
  ;; already created it
  ;;
  ;; TODO -- 95% sure we can just use [[setup-token]] directly now and not worry about manually fetching the env var
  ;; value or setting DB values and the like
  (or (when-let [mb-setup-token (env/env :mb-setup-token)]
        (setting/set-value-of-type! :string :setup-token mb-setup-token))
      (t2/select-one-fn :value Setting :key "setup-token")
      (setting/set-value-of-type! :string :setup-token (str (UUID/randomUUID)))))


(defsetting has-user-setup
  "A value that is true iff the metabase instance has one or more users registered."
  :visibility :public
  :type       :boolean
  :setter     :none
  ;; Once a User is created it's impossible for this to ever become falsey -- deleting the last User is disallowed.
  ;; After this returns true once the result is cached and it will continue to return true forever without any
  ;; additional DB hits.
  ;;
  ;; This is keyed by the unique identifier for the application database, to support resetting it in tests or swapping
  ;; it out in the REPL
  :getter     (let [app-db-id->user-exists? (atom {})]
                (fn []
                  (or (get @app-db-id->user-exists? (mdb.connection/unique-identifier))
                      (let [exists? (t2/exists? User {:where [:not= :id config/internal-mb-user-id]})]
                        (swap! app-db-id->user-exists? assoc (mdb.connection/unique-identifier) exists?)
                        exists?))))
  :doc        false)
