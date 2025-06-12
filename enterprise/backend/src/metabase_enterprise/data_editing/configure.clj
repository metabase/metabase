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
   [:id                                :string]
   ;; omitted if we have visibility != null
   [:sourceType       {:optional true} [:enum "ask-user" "row-data" "const"]]
   ;; omitted if we have visibility != null
   [:sourceValueTarget {:optional true} :string]
   ;; would be much nicer if we have a "visible" option rather than this being optional, but just tracking FE
   [:visibility       {:optional true} [:enum "readonly" "hidden"]]
   ;; should be present if and only if "sourceType" is "const"
   [:value            {:optional true} [:or :string :int :boolean]]])

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
                    :sourceValueTarget (case (:type action)
                                         :query (:slug param)
                                         :implicit (:id param))})}))

;; TODO handle exposing new inputs required by the inner-action
(defn- configuration-for-saved-or-pending-action [{:keys [param-map] :as _action}]
  {:title "TODO, depends on the configuration"
   :parameters (for [[param-id param-settings] param-map]
                 (assoc param-settings :id (name param-id)))})

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
                    :sourceValueTarget (:name field)})}))

(mu/defn configuration :- ::action-configuration
  "Returns configuration needed for a given action."
  [{:keys [action-id action-kw] :as action}
   scope]
  (cond
    ;; eventually will be put inside a nicely typed :configuration key
    (:param-map action)
    (configuration-for-saved-or-pending-action action)

    (pos-int? action-id)
    (configuration-for-saved-action action-id)

    (and action-kw (isa? action-kw :table.row/common))
    ;; TODO eventually we will just get the table-id from having applied the mapping, which supports nesting etc
    (configuration-for-table-action (or (:table-id (:mapping (:inner-action action)))
                                        (:table-id (:mapping action))
                                        (:table-id scope))
                                    action-kw)

    ;; TODO support data-grid.row and model.row actions (not important yet)
    ))
