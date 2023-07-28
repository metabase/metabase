(ns metabase.models.session
  (:require
   [buddy.core.codecs :as codecs]
   [buddy.core.nonce :as nonce]
   [metabase.server.middleware.misc :as mw.misc]
   [metabase.server.request.util :as request.u]
   [methodical.core :as methodical]
   [schema.core :as s]
   [toucan2.core :as t2]))

(s/defn ^:private random-anti-csrf-token :- #"^[0-9a-f]{32}$"
  []
  (codecs/bytes->hex (nonce/random-bytes 16)))

(def Session
  "Used to be the toucan1 model name defined using [[toucan.models/defmodel]], now it's a reference to the toucan2 model name.
  We'll keep this till we replace all the symbols in our codebase."
  :model/Session)

(methodical/defmethod t2/table-name :model/Session [_model] :core_session)

(doto :model/Session
  (derive :metabase/model)
  (derive :hook/created-at-timestamped?))

(t2/define-before-update :model/Session [_]
  (throw (RuntimeException. "You cannot update a Session.")))

(t2/define-before-insert :model/Session
  [session]
  (cond-> session
    (some-> mw.misc/*request* request.u/embedded?) (assoc :anti_csrf_token (random-anti-csrf-token))))

(t2/define-after-insert :model/Session
  [{anti-csrf-token :anti_csrf_token, :as session}]
  (let [session-type (if anti-csrf-token :full-app-embed :normal)]
    (assoc session :type session-type)))
