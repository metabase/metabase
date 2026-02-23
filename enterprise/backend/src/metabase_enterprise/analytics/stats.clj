(ns metabase-enterprise.analytics.stats
  (:require
   [java-time.api :as t]
   [metabase-enterprise.advanced-config.settings :as advanced-config.settings]
   [metabase-enterprise.scim.core :as scim]
   [metabase-enterprise.semantic-search.core :as semantic-search]
   [metabase-enterprise.sso.settings :as sso-settings]
   [metabase.driver :as driver]
   [metabase.premium-features.core :as premium-features :refer [defenterprise]]
   [toucan2.core :as t2]))

(defenterprise ee-snowplow-features-data
  "A subset of feature information included in the daily Snowplow stats report. This function only returns information
  about features which require calling EE code; other features are defined in [[metabase.analytics.stats/snowplow-features]]"
  :feature :none
  []
  [{:name      :sso-jwt
    :available (premium-features/enable-sso-jwt?)
    :enabled   (sso-settings/jwt-enabled)}
   {:name      :sso-saml
    :available (premium-features/enable-sso-saml?)
    :enabled   (sso-settings/saml-enabled)}
   {:name      :sso-slack
    :available (premium-features/enable-sso-slack?)
    :enabled   (sso-settings/slack-connect-enabled)}
   {:name      :scim
    :available (premium-features/enable-scim?)
    :enabled   (boolean (scim/scim-enabled))}
   {:name      :sandboxes
    :available (and (premium-features/enable-official-collections?)
                    (t2/exists? :model/Database :engine [:in (descendants driver/hierarchy :sql)]))
    :enabled   (t2/exists? :model/Sandbox)}
   {:name      :email-allow-list
    :available (premium-features/enable-email-allow-list?)
    :enabled   (boolean (some? (advanced-config.settings/subscription-allowed-domains)))}
   {:name      :semantic-search
    :available (premium-features/enable-semantic-search?)
    :enabled   (semantic-search/supported?)}])

(defenterprise ee-transform-metrics
  "Returns transform usage metrics for the Snowplow stats ping."
  :feature :none
  []
  (let [one-day-ago (t/minus (t/offset-date-time) (t/days 1))]
    {:transforms               (t2/count :model/Transform)
     :transform_runs_last_24h  (t2/count :model/TransformRun
                                         :start_time [:>= one-day-ago])}))
