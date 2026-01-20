(ns metabase.setup.core
  (:require
   [metabase.settings.core :as setting]
   [metabase.setup.settings :as setup.settings]
   [potemkin :as p]))

(p/import-vars
 [setup.settings
  has-user-setup
  setup-token])

(defn token-match?
  "Function for checking if the supplied string matches our setup token.
   Returns boolean `true` if supplied token matches the setup token, `false` otherwise."
  [token]
  {:pre [(string? token)]}
  (= token (setup.settings/setup-token)))

(defn create-token!
  "Create and set a new setup token, if one has not already been created. Returns the newly created token."
  []
  ;; make sure the cache is up-to-date in case another instance came along and already created it
  (setting/restore-cache!)
  (or (setup.settings/setup-token)
      ;; I guess we can't use `setup-token!` because it's marked as `:setter :none` even tho we are literally setting it
      ;; right here. `:setter :none` is meant for settings whose values are programmatically generated -- Cam
      (setting/set-value-of-type! :string :setup-token (str (random-uuid)))))
