(ns metabase.metabot.api.dictation
  "Authenticated internal Metabot dictation routes."
  (:require
   [clojure.java.io :as io]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.metabot.config :as metabot.config]
   [metabase.metabot.dictation :as dictation]
   [metabase.metabot.scope :as scope]
   [metabase.util.malli.schema :as ms])
  (:import
   (java.io File)))

(set! *warn-on-reflection* true)

(defn- check-access!
  []
  (metabot.config/check-metabot-enabled! metabot.config/internal-metabot-id)
  (api/check-403 (or api/*is-superuser?*
                     (nil? (scope/missing-permission
                            (scope/resolve-user-permissions api/*current-user-id*) nil)))))

(api.macros/defendpoint :get "/" :- [:map {:closed true} [:enabled :boolean]]
  "Whether an OpenAI connection is available for dictation."
  []
  (check-access!)
  {:enabled (boolean (dictation/connection))})

(api.macros/defendpoint :post "/" :- [:map {:closed true} [:text :string]]
  "Transcribe an audio recording using an existing OpenAI connection."
  {:multipart {:max-file-size dictation/max-recording-bytes :max-file-count 1}}
  [_route-params
   _query-params
   {:keys [file]} :- [:map {:closed true}
                      [:file [:map {:closed true}
                              [:filename :string]
                              [:content-type :string]
                              [:size {:optional true} nat-int?]
                              [:tempfile (ms/InstanceOfClass File)]]]]]
  (try
    (check-access!)
    (dictation/transcribe! file)
    (finally (io/delete-file (:tempfile file) :silently))))

(def ^{:arglists '([request respond raise])} routes
  "Dictation routes."
  (api.macros/ns-handler *ns* +auth))
