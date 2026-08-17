(ns metabase.users.schema
  (:require
   [clojure.string :as str]
   [metabase.util.i18n :refer [deferred-tru]]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]))

(def LoginAttributes
  "Login attributes, currently not collected for LDAP or Google Auth. Will ultimately be stored as JSON."
  [:and
   [:map-of
    (mu/with-api-error-message
     ms/KeywordOrString
     (deferred-tru "login attribute keys must be a keyword or string"))
    :any]
   ;; checked over the whole map rather than as part of the key schema: a key that fails the key schema is stripped
   ;; from the request, which would drop the attribute silently instead of telling the caller.
   (mu/with-api-error-message
    [:fn (fn [attributes]
           (not-any? #(str/starts-with? (name %) "@") (keys attributes)))]
    (deferred-tru "login attribute keys must not start with `@`"))])

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

(mr/def ::user-group-membership
  "Group Membership info of a User.
  In which :is_group_manager is only included if `advanced-permissions` is enabled."
  [:map
   [:id ms/PositiveInt]
   [:is_group_manager
    {:optional true, :description "Only relevant if `advanced-permissions` is enabled. If it is, you should always include this key."}
    :boolean]])

(def InviteTarget
  "The dashboard or question an invite points at, as `{:type :id :name}`. Drives the post-signup
  landing redirect and the scoped invite email. Not an access grant; collection permissions still apply."
  [:map
   [:type [:enum "dashboard" "question"]]
   [:id   ms/PositiveInt]
   [:name ms/NonBlankString]])
