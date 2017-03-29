(ns metabase.api.ldap
  "/api/ldap endpoints"
  (:require [compojure.core :refer [PUT]]
            [metabase.api.common :refer :all]
            [metabase.models.setting :as setting]
            [metabase.util.schema :as su]))

(defendpoint PUT "/settings"
  "Update LDAP related settings. You must be a superuser to do this."
  [:as {settings :body}]
  {settings su/Map}
  (check-superuser)
  (setting/set-many! settings)
  {:ok true})

(define-routes)
