(ns metabase.dashboards.schema
  (:require
   [metabase.lib.core :as lib]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.parameters.schema :as parameters.schema]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]))

(mr/def ::dashcard.base
  [:map
   ;;
   [:id                 {:optional true} int?]
   [:size_x             {:optional true} ms/PositiveInt]
   [:size_y             {:optional true} ms/PositiveInt]
   [:row                {:optional true} ms/IntGreaterThanOrEqualToZero]
   [:col                {:optional true} ms/IntGreaterThanOrEqualToZero]
   [:parameter_mappings {:optional true} [:maybe [:sequential [:ref :metabase.parameters.schema/parameter-mapping]]]]
   [:inline_parameters  {:optional true} [:maybe [:sequential ms/NonBlankString]]]])

(mr/def ::dashcard
  "Schema for a (possibly hydrated) Dashboard Card."
  [:merge
   [:ref ::dashcard.base]
   [:map
    ;; these keys can be added by hydration
    [:card   {:optional true} [:maybe [:ref :metabase.queries.schema/card]]]
    ;; TODO -- not sure what the schema for series is supposed to be. Same as a Card?
    [:series {:optional true} [:maybe [:sequential :map]]]]])

(mr/def ::dashcard.update
  "Schema for updates to a DashboardCard.

  `:id` can be negative, it indicates a new card and BE should create them."
  [:merge
   [:ref ::dashcard.base]
   [:map
    [:id {:optional true} int?]]])

(mu/defn normalize-dashcard :- ::dashcard
  "Normalize a DashboardCard."
  [dashcard :- :map]
  (lib/normalize ::dashcard dashcard))

(mr/def ::dashcards
  (ms/maps-with-unique-key [:sequential ::dashcard] :id))

(mr/def ::dashcards.update
  "Schema for a sequence of DashboardCard updates (when updating a Dashboard)."
  (ms/maps-with-unique-key [:sequential ::dashcard.update] :id))

(mr/def ::dashboard-tab
  [:map
   [:id   {:optional true} pos-int?]
   [:name {:optional true} ms/NonBlankString]])

(mr/def ::dashboard-tab.update
  "id can be negative, it indicates a new card and BE should create them."
  [:merge
   [:ref ::dashboard-tab]
   [:map
    [:id {:optional true} int?]]])

(mr/def ::dashboard-tabs
  (ms/maps-with-unique-key [:sequential ::dashboard-tab] :id))

(mr/def ::dashboard-tabs.update
  (ms/maps-with-unique-key [:sequential ::dashboard-tab.update] :id))

(mr/def ::dashboard
  [:map
   [:archived                {:optional true} [:maybe :boolean]]
   [:cache_ttl               {:optional true} [:maybe ms/PositiveInt]]
   [:caveats                 {:optional true} [:maybe :string]]
   [:collection_id           {:optional true} [:maybe ::lib.schema.id/collection]]
   [:collection_position     {:optional true} [:maybe ms/PositiveInt]]
   [:dashcards               {:optional true} [:maybe ::dashcards]]
   [:description             {:optional true} [:maybe :string]]
   [:embedding_params        {:optional true} [:maybe ms/EmbeddingParams]]
   [:enable_embedding        {:optional true} [:maybe :boolean]]
   [:id                      {:optional true} [:maybe ::lib.schema.id/dashboard]]
   [:name                    {:optional true} [:maybe ms/NonBlankString]]
   [:parameters              {:optional true} [:maybe [:sequential ::parameters.schema/parameter]]]
   [:points_of_interest      {:optional true} [:maybe :string]]
   [:position                {:optional true} [:maybe ms/PositiveInt]]
   [:show_in_getting_started {:optional true} [:maybe :boolean]]
   [:tabs                    {:optional true} [:maybe [:ref ::dashboard-tabs]]]
   [:width                   {:optional true} [:enum {:decode/normalize lib.schema.common/normalize-keyword} :fixed :full]]])

(mr/def ::dashboard.update
  [:merge
   [:ref ::dashboard]
   [:map
    [:tabs {:optional true} [:ref ::dashboard-tabs.update]]]])

(mu/defn normalize-dashboard :- :map
  "Normalize a Dashboard using `schema`, default `::dashboard`."
  ([dashboard]
   (normalize-dashboard dashboard ::dashboard))

  ([dashboard :- :map
    schema]
   (lib/normalize schema dashboard)))
