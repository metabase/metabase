(ns metabase-enterprise.data-editing.configure
  (:require
   [metabase.actions.core :as actions]
   [metabase.api.common :as api]
   [metabase.util :as u]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.warehouse-schema.models.table :as table]
   [toucan2.core :as t2]))

(mr/def ::param-configuration
  [:map {:closed true}
   [:id               :string]
   [:sourceType       [:enum "ask-user"]]
   [:sourceTypeTarget :string]])

(mr/def ::action-configuration
  [:map {:closed true}
   [:title      :string]
   [:parameters [:sequential ::param-configuration]]])

(defn- configuration-for-saved-action
  [action-id]
  (let [action (-> (actions/select-action :id action-id
                                          :archived false
                                          {:where [:not [:= nil :model_id]]})
                   api/read-check
                   api/check-404)]
    {:title      (:name action)
     :parameters (for [param (:parameters action)]
                   {:id               (:id param)
                    :sourceType       "ask-user"
                    :sourceTypeTarget (case (:type action)
                                        :query (:slug param)
                                        :implicit (:id param))})}))

(defn- configuration-for-table-action
  [table-id action-kw]
  (let [table          (t2/select-one [:model/Table :display_name :field_order] table-id)
        ordered-fields (table/ordered-fields table-id (:field_order table))]
    {:title      (format "%s: %s" (:display_name table) (u/capitalize-en (name action-kw)))
     :parameters (for [field ordered-fields
                       :when (case action-kw
                               :table.row/create (not (:database_is_auto_increment field))
                               :table.row/update true
                               :table.row/delete (isa? (:semantic_type field) :type/PK))]
                   {:id               (format "field-%s" (:name field))
                    :sourceType       "ask-user"
                    :sourceTypeTarget (:name field)})}))

(mu/defn configuration :- ::action-configuration
  "Returns configuration needed for a given action."
  [{:keys [action-id action-kw] :as unified}
   scope]
  (cond
    (pos-int? action-id)
    (configuration-for-saved-action (:action-id unified))

    (and action-kw (isa? action-kw :table.row/common))
    (configuration-for-table-action (:table-id scope) action-kw)))
