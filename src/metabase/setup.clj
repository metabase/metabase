(ns metabase.setup
  "Functionality used for setting up Metabase on first launch, such as the unique setup token (which authorizes you to
  create the initial User.)"
  (:require [metabase.models.setting :as setting :refer [defsetting Setting]]
            [metabase.util :as u]
            [puppetlabs.i18n.core :refer [trs]]
            [toucan.db :as db]))

(defsetting ^:private setup-token-used?
  "Has the setup token been used to create the initial user?"
  :internal? true
  :type      :boolean)

(defsetting setup-token
  "Token used to authorize the person who first launches this Metabase instance to create the first User. Magic getter
  automatically creates and saves the value the first time this is fetched."
  :internal? true
  :getter  (fn []
             ;; if the setup token has already been used, return `nil` from now on
             (when-not (setup-token-used?)
               ;; ok, double check that this setup token has *DEFINITELY NOT* BEEN USED! Fetch the actual value of the
               ;; `setup-token-used?` setting in the DB, to make sure we're not seeing it as `false` because an old
               ;; value is cached. (We still want it to be a cached Setting, however, because `setup-token` gets
               ;; called on a fairly regular basis, as part of the `session/properties` endpoint ("public Settings"),
               ;; so we would like to avoid the extra DB call.)
               (when-not (db/select-one Setting :key "setup-token-used?", :value "true")
                 (or
                  ;; otherwise, if not 'used', return existing setup token if applicable
                  (setting/get-string "setup-token")
                  ;; if no value is in the DB, create a new value, save it, and return it
                  (u/prog1 (str (java.util.UUID/randomUUID))
                    (setting/set-string! "setup-token" <>))))))
  ;; people shouldn't be changing the setup token themselves; the magic getter will set a value for it when appropriate.
  :setter  (fn [_]
             (throw (Exception. (str (trs "You cannot change setup-token."))))))

(defn token-match?
  "Function for checking if the supplied string matches our setup token.
   Returns boolean `true` if supplied token matches `setup-token`, `false` otherwise."
  [token]
  {:pre [(string? token)]}
  (= token (setup-token)))

(defn mark-setup-token-as-used!
  "Mark the setup token as used; this means it can no longer be used to create Users."
  []
  (setup-token-used? true))
