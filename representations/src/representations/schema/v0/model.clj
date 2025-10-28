(ns representations.schema.v0.model
  (:require
   [representations.read.impl :as read-impl]
   [representations.schema.representation :as representation]
   [representations.schema.v0.column :as column]
   [representations.schema.v0.common :as common]
   [representations.util.malli.registry :as mr]))

(mr/def ::column-settings
  [:map
   {:closed true
    :description "User-editable column settings for formatting and display"}
   [:column_title {:optional true} [:maybe :string]]
   [:text_align {:optional true} [:maybe [:enum "left" "right" "middle"]]]
   [:text_wrapping {:optional true} [:maybe :boolean]]
   [:view_as {:optional true} [:maybe [:enum "link" "email_link" "image" "auto"]]]
   [:link_text {:optional true} [:maybe :string]]
   [:link_url {:optional true} [:maybe :string]]
   [:show_mini_bar {:optional true} [:maybe :boolean]]
   [:number_style {:optional true} [:maybe [:enum "decimal" "percent" "scientific" "currency"]]]
   [:currency {:optional true} [:maybe :string]]
   [:currency_style {:optional true} [:maybe :string]]
   [:date_style {:optional true} [:maybe :string]]
   [:date_separator {:optional true} [:maybe [:enum "/" "-" "."]]]
   [:date_abbreviate {:optional true} [:maybe :boolean]]
   [:time_enabled {:optional true} [:maybe [:enum "minutes" "seconds" "milliseconds"]]]
   [:time_style {:optional true} [:maybe :string]]])

(mr/def ::model-column
  [:map
   {:closed true
    :description "Column metadata definition with model-specific fields"}
   [:name ::column/column-name]
   [:display_name {:optional true} ::column/display-name]
   [:description {:optional true} ::column/column-description]
   [:base_type {:optional true} ::column/base-type]
   [:effective_type {:optional true} ::column/effective-type]
   [:semantic_type {:optional true} ::column/semantic-type]
   [:visibility {:optional true} ::column/visibility]
   [:visibility_type {:optional true} [:maybe :string]]
   [:fk_target_field_id {:optional true} [:maybe :int]]
   [:currency {:optional true} ::column/currency]
   [:settings {:optional true} [:maybe ::column-settings]]])

(mr/def ::model-columns
  [:sequential
   {:description "Array of column metadata definitions for models"}
   ::model-column])

(mr/def ::model
  [:and
   [:merge
    ::representation/representation
    [:map
     {:closed true
      :description "v0 schema for human-writable model representation"}
     [:name {:optional true} ::common/name]
     [:description {:optional true} ::common/description]
     [:database ::common/database]
     [:query {:optional true} ::common/query]
     [:mbql_query {:optional true} ::common/mbql-query]
     [:columns {:optional true} ::model-columns]
     [:collection {:optional true} ::common/collection]]]
   [:fn {:error/message "Must have exactly one of :query or :mbql_query"}
    (fn [{:keys [query mbql_query]}]
      (= 1 (count (filter some? [query mbql_query]))))]])

(defmethod read-impl/representation->schema [:v0 :model] [_] ::model)
