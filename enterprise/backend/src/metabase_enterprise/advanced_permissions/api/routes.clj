(ns metabase-enterprise.advanced-permissions.api.routes
  "`/advanced-permisisons/sso` Routes.

  Implements the SSO routes needed for SAML and JWT. This namespace primarily provides hooks for those two backends so
  we can have a uniform interface both via the API and code"
  (:require [compojure.core :refer [GET POST]]
            [metabase-enterprise.advanced-permissions.models.permissions.general-permissions :as g-perms]
            [metabase.api.common :as api]))

(api/defendpoint GET "/general/graph"
  "SSO entry-point for an SSO user that has not logged in yet"
  {:as req}
  (g-perms/graph))

(api/defendpoint PUT "/general/graph/"
  "Route the SSO backends call with successful login details"
  {:as req}
  nil)

(api/define-routes)
