(ns metabase.models.login-history
  (:require [metabase.util.i18n :as i18n :refer [tru]]
            [toucan.models :as models]))

(models/defmodel LoginHistory :login_history)

(defn- post-select [{session-id :session_id, :as login-history}]
  ;; session ID is sensitive, so it's better if we don't even return it. Replace it with a more generic `active` key.
  (cond-> login-history
    (contains? login-history :session_id) (assoc :active (boolean session-id))
    true                                  (dissoc :session_id)))

(defn- pre-update [login-history]
  (throw (RuntimeException. (tru "You can''t update a LoginHistory after it has been created."))))

(extend (class LoginHistory)
  models/IModel
  (merge
   models/IModelDefaults
   {:post-select post-select
    :pre-update  pre-update}))
