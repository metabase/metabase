(ns metabase.setup
  (:require [environ.core :refer [env]]
            [metabase.models.setting :refer [defsetting set-string! Setting]]
            [toucan.db :as db])
  (:import java.util.UUID))

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
  (let [mb-setup-token (env :mb-setup-token)]
    (or (when mb-setup-token (set-string! :setup-token mb-setup-token))
        (db/select-one-field :value Setting :key "setup-token")
        (set-string! :setup-token (str (UUID/randomUUID))))))

(defn clear-token!
  "Clear the setup token if it exists and reset it to `nil`."
  []
  (set-string! :setup-token nil))
