(ns metabase.store-api.schema
  (:require
   [metabase.util.malli.registry :as mr]))

(mr/def ::Plan
  [:map
   [:id pos-int?]
   [:name :string]
   [:description :string]
   [:alias :string]
   [:product :string] ; product id
   [:can_purchase :boolean]
   [:billing_period_months [:enum 1 12]]
   [:trial_days pos-int?]
   [:users_included pos-int?]
   [:per_user_price :string]
   [:price :string]
   [:hosting_features [:sequential :string]]
   [:token_features [:sequential :string]]
   [:addon_price {:optional true} :string]
   [:base_price {:optional true} :string]])

(mr/def ::Addon
  [:map
   [:id pos-int?]
   [:name :string]
   [:short_name :string]
   [:description [:maybe :string]]
   [:alias :string]
   [:product_type :string] ; the actual add-on
   [:deployment :string]
   [:billing_period_months [:enum 1 12]]
   [:active :boolean]
   [:self_service :boolean]
   [:hosting_features [:sequential :string]]
   [:token_features [:sequential :string]]
   [:trialup_to_product_id [:maybe :string]]
   [:invoiceable_counterpart [:maybe :string]]
   [:trial_days [:maybe number?]]
   [:is_metered [:maybe :boolean]]
   [:default_total_units number?]
   [:default_included_units number?]
   [:default_prepaid_units number?]
   [:default_price_per_unit number?]
   [:default_base_fee number?]])
