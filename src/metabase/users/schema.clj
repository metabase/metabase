(ns metabase.users.schema
  (:require
   [clojure.string :as str]
   [metabase.lib.schema.id :as lib.schema.id]
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

(mr/def ::user
  "A User as selected from the app DB: every column of `:core_user` that the model selects by default, plus `:common_name` added by the model's after-select hook."
  [:map {:closed true}
   [:id              ::lib.schema.id/user]
   [:email           :string]
   [:first_name      [:maybe :string]]
   [:last_name       [:maybe :string]]
   [:date_joined     ms/TemporalInstant]
   [:last_login      [:maybe ms/TemporalInstant]]
   [:is_superuser    :boolean]
   [:is_qbnewb       :boolean]
   [:tenant_id       [:maybe ms/PositiveInt]]
   [:is_data_analyst :boolean]
   [:common_name     {:optional true} [:maybe :string]]])

(mr/def ::user.full
  "A User as selected from the app DB with every column of `:core_user`, not only the default ones, plus `:common_name` added by the model's after-select hook."
  [:map {:closed true}
   [:id                      ::lib.schema.id/user]
   [:email                   :string]
   [:first_name              [:maybe :string]]
   [:last_name               [:maybe :string]]
   [:password                [:maybe :string]]
   [:password_salt           [:maybe :string]]
   [:date_joined             ms/TemporalInstant]
   [:last_login              [:maybe ms/TemporalInstant]]
   [:is_superuser            :boolean]
   [:is_active               :boolean]
   [:reset_token             [:maybe :string]]
   [:reset_triggered         [:maybe :int]]
   [:is_qbnewb               :boolean]
   [:login_attributes        [:maybe [:or :string :map sequential?]]]
   [:updated_at              [:maybe ms/TemporalInstant]]
   [:sso_source              [:maybe [:or :keyword :string]]]
   [:locale                  [:maybe :string]]
   [:is_datasetnewb          :boolean]
   [:settings                [:maybe [:or :string :map sequential?]]]
   [:type                    [:or :keyword :string]]
   [:entity_id               :string]
   [:deactivated_at          [:maybe ms/TemporalInstant]]
   [:tenant_id               [:maybe ms/PositiveInt]]
   [:jwt_attributes          [:maybe [:or :string :map sequential?]]]
   [:deactivated_with_tenant [:maybe :boolean]]
   [:is_data_analyst         :boolean]
   [:common_name             {:optional true} [:maybe :string]]])

(mr/def ::user.update
  "What an update (or insert) of a User accepts: every column of `:core_user` except `id`, all optional."
  [:map {:closed true}
   [:email                   {:optional true} [:maybe :string]]
   [:first_name              {:optional true} [:maybe :string]]
   [:last_name               {:optional true} [:maybe :string]]
   [:password                {:optional true} [:maybe :string]]
   [:password_salt           {:optional true} [:maybe :string]]
   [:date_joined             {:optional true} [:maybe ms/TemporalInstant]]
   [:last_login              {:optional true} [:maybe ms/TemporalInstant]]
   [:is_superuser            {:optional true} [:maybe :boolean]]
   [:is_active               {:optional true} [:maybe :boolean]]
   [:reset_token             {:optional true} [:maybe :string]]
   [:reset_triggered         {:optional true} [:maybe :int]]
   [:is_qbnewb               {:optional true} [:maybe :boolean]]
   [:login_attributes        {:optional true} [:maybe [:or :string :map sequential?]]]
   [:updated_at              {:optional true} [:maybe ms/TemporalInstant]]
   [:sso_source              {:optional true} [:maybe [:or :keyword :string]]]
   [:locale                  {:optional true} [:maybe :string]]
   [:is_datasetnewb          {:optional true} [:maybe :boolean]]
   [:settings                {:optional true} [:maybe [:or :string :map sequential?]]]
   [:type                    {:optional true} [:maybe [:or :keyword :string]]]
   [:entity_id               {:optional true} [:maybe :string]]
   [:deactivated_at          {:optional true} [:maybe ms/TemporalInstant]]
   [:tenant_id               {:optional true} [:maybe ms/PositiveInt]]
   [:jwt_attributes          {:optional true} [:maybe [:or :string :map sequential?]]]
   [:deactivated_with_tenant {:optional true} [:maybe :boolean]]
   [:is_data_analyst         {:optional true} [:maybe :boolean]]])

(mr/def ::user-parameter-value
  "A UserParameterValue as selected from the app DB: every column of `:user_parameter_value`."
  [:map {:closed true}
   [:id           ms/PositiveInt]
   [:user_id      ::lib.schema.id/user]
   [:parameter_id :string]
   [:value        [:maybe [:or :string :map sequential?]]]
   [:dashboard_id [:maybe ::lib.schema.id/dashboard]]])

(mr/def ::user-parameter-value.update
  "What an update (or insert) of a UserParameterValue accepts: every column of `:user_parameter_value` except `id`, all optional."
  [:map {:closed true}
   [:user_id      {:optional true} [:maybe ::lib.schema.id/user]]
   [:parameter_id {:optional true} [:maybe :string]]
   [:value        {:optional true} [:maybe [:or :string :map sequential?]]]
   [:dashboard_id {:optional true} [:maybe ::lib.schema.id/dashboard]]])
