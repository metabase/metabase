(ns metabase.users.schema
  (:require
   [metabase.util.i18n :refer [deferred-tru]]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]))

(def LoginAttributes
  "Login attributes, currently not collected for LDAP or Google Auth. Will ultimately be stored as JSON."
  [:map-of
   [:and
    (mu/with-api-error-message
     ms/KeywordOrString
     (deferred-tru "login attribute keys must be a keyword or string"))
    (mu/with-api-error-message
     [:fn (fn [k] (re-matches #"^(?!@).*" (name k)))]
     (deferred-tru "login attribute keys must not start with `@`"))]
   :any])

(def NewUser
  "Required/optionals parameters needed to create a new user (for any backend)"
  [:map
   [:first_name       {:optional true} [:maybe ms/NonBlankString]]
   [:last_name        {:optional true} [:maybe ms/NonBlankString]]
   [:email                             ms/Email]
   [:password         {:optional true} [:maybe ms/NonBlankString]]
   [:login_attributes {:optional true} [:maybe LoginAttributes]]
   [:jwt_attributes   {:optional true} [:maybe LoginAttributes]]
   [:sso_source       {:optional true} [:maybe ms/NonBlankString]]
   [:locale           {:optional true} [:maybe ms/KeywordOrString]]
   [:type             {:optional true} [:maybe ms/KeywordOrString]]
   [:tenant_id        {:optional true} [:maybe ms/PositiveInt]]])
