(ns metabase-enterprise.snowplow
  (:require
   [metabase-enterprise.advanced-config.models.pulse-channel :as advanced-config.models.pulse-channel]
   [metabase-enterprise.scim.api :as scim-api]
   [metabase-enterprise.sso.integrations.sso-settings :as sso-settings]
   [metabase.driver :as driver]
   [metabase.public-settings.premium-features :as premium-features :refer [defenterprise]]
   [toucan2.core :as t2]))

(defenterprise enterprise-snowplow-features
  "A subset of feature information included in the daily Snowplow stats report. This funciton only returns information
  about features which require calling EE code; other features are defined in [[metabase.analytics.stats/snowplow-features]]"
  :feature :none
  []
  [{:key       :sso_jwt
    :available (premium-features/enable-sso-jwt?)
    :enabled   (sso-settings/jwt-enabled)}
   {:key       :sso_saml
    :available (premium-features/enable-sso-saml?)
    :enabled   (sso-settings/saml-enabled)}
   {:key       :scim
    :available (premium-features/enable-scim?)
    :enabled   (boolean (scim-api/scim-enabled))}
   {:key       :sandboxes
    :available (and (premium-features/enable-official-collections?)
                    (t2/exists? :model/Database :engine [:in (descendants driver/hierarchy :sql)]))
    :enabled   (t2/exists? :model/GroupTableAccessPolicy)}
   {:key       :email_allow_list
    :available (premium-features/enable-email-allow-list?)
    :enabled   (boolean (some? (advanced-config.models.pulse-channel/subscription-allowed-domains)))}])
