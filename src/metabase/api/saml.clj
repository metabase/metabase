(ns metabase.api.saml
  "/api/saml endpoints"
  (:require
   [clojure.walk :as walk]
   [compojure.core :refer [PUT]]
   [metabase.api.common :as api]
   [metabase.models.setting :as setting]
   [metabase.util.schema :as su]
   [saml20-clj.core :as saml]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

#_{:clj-kondo/ignore [:deprecated-var]}
(api/defendpoint-schema PUT "/settings"
  "Update SAML related settings. You must be a superuser or have `setting` permission to do this."
  [:as {settings :body}]
  {settings su/Map}
  (api/check-superuser)
  (let [results       (saml/has-private-key?
                       (walk/postwalk-replace {:saml-keystore-path :filename
                                               :saml-keystore-password :password
                                               :saml-keystore-alias :alias}
                                              (select-keys settings [:saml-keystore-path
                                                                     :saml-keystore-password
                                                                     :saml-keystore-alias])))]
    (if results
      (t2/with-transaction [_conn]
        (setting/set-many! settings))
      ;; test failed, return result message
      {:status 500
       :body   (str results)})))

(api/define-routes)
