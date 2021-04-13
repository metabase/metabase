(ns metabase.models.session
  (:require [buddy.core.codecs :as codecs]
            [buddy.core.nonce :as nonce]
            [metabase.server.middleware.misc :as mw.misc]
            [metabase.server.request.util :as request.u]
            [metabase.util :as u]
            [schema.core :as s]
            [toucan.models :as models]))

(s/defn ^:private random-anti-csrf-token :- #"^[0-9a-f]{32}$"
  []
  (codecs/bytes->hex (nonce/random-bytes 16)))

(models/defmodel Session :core_session)

(defn- pre-update [_]
  (throw (RuntimeException. "You cannot update a Session.")))

(defn- pre-insert [session]
  (cond-> (assoc session :created_at :%now)
    (some-> mw.misc/*request* request.u/embedded?) (assoc :anti_csrf_token (random-anti-csrf-token))))

(defn- post-insert [{anti-csrf-token :anti_csrf_token, :as session}]
  (let [session-type (if anti-csrf-token :full-app-embed :normal)]
    (assoc session :type session-type)))

(u/strict-extend (class Session)
  models/IModel
  (merge
   models/IModelDefaults
   {:pre-insert  pre-insert
    :post-insert post-insert
    :pre-update  pre-update}))
