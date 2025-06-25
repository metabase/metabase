(ns metabase-enterprise.data-editing.configure
  (:require
   [metabase.actions.core :as actions]
   [metabase.api.common :as api]
   [metabase.util :as u]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]
   [metabase.warehouse-schema.models.table :as table]
   [toucan2.core :as t2]))

(mr/def ::param-configuration
  ;; TODO Yeah, gross. This is currently just mirroring the config in the FE.
  ;; They at least have defined it using a nicer dependently typed way! See ConstantRowActionFieldSettings.
  ;; We could do something like that with malli... but once this stuff is opaque to the frontend, we can go wild and
  ;; make the shape more idiomatically Clojure, and maybe we should just wait until we've finalized the shape.
  [:map {:closed true}
   [:id                                 :string]
   ;; omitted if we have visibility != null
   [:sourceType       {:optional true}  [:enum "ask-user" "row-data" "constant"]]
   ;; omitted if we have visibility != null
   [:sourceValueTarget {:optional true} :string]
   ;; would be much nicer if we have a "visible" option rather than this being optional, but just tracking FE
   [:visibility       {:optional true}  [:enum "readonly" "hidden"]]
   ;; should be present if and only if "sourceType" is "constant"
   [:value            {:optional true}  [:or :string :int :boolean]]])

(mr/def ::action-configuration
  [:map {:closed true}
   [:title      :string]
   [:parameters [:sequential ::param-configuration]]])

(mu/defn- configuration-for-saved-action
  [action-id :- pos-int?]
  (let [action (-> (actions/select-action :id action-id
                                          :archived false
                                          {:where [:not [:= nil :model_id]]})
                   api/read-check
                   api/check-404)]
    {:title      (:name action)
     :parameters (for [param (:parameters action)]
                   {:id         (case (:type action)
                                  :query (:slug param)
                                  :implicit (:id param))
                    :sourceType "ask-user"})}))

;; TODO handle exposing new inputs required by the inner-action
(defn- configuration-for-pending-action [{:keys [param-map] :as _action}]
  ;; TODO Delegate to get this
  {:title "TODO - depends on existing configuration if already saved, otherwise from the inner action as the default."
   :parameters (for [[param-id param-settings] param-map]
                 (assoc param-settings :id (name param-id)))})

(mu/defn- configuration-for-table-action
  [table-id :- pos-int?
   action-kw :- :keyword]
  (let [table          (t2/select-one [:model/Table :display_name :field_order] table-id)
        ordered-fields (table/ordered-fields table-id (:field_order table))]
    {:title      (format "%s: %s" (:display_name table) (u/capitalize-en (name action-kw)))
     :parameters (for [field ordered-fields
                       :when (case action-kw
                               :table.row/create (not (:database_is_auto_increment field))
                               :table.row/update true
                               :table.row/delete (isa? (:semantic_type field) :type/PK))]
                   {:id               (:name field)
                    :sourceType       "ask-user"})}))

(defn- combine-configurations
  [saved-configuration raw-configuration]
  (let [existing-param-ids (set (map :id (:parameters saved-configuration)))]
    {:title      (:title saved-configuration)
     :parameters (concat (:parameters saved-configuration) (remove #(existing-param-ids (:id %)) (:parameters raw-configuration)))}))

(mu/defn configuration :- [:or ::action-configuration [:map [:status ms/PositiveInt]]]
  "Returns configuration needed for a given action."
  [{:keys [action-id action-kw inner-action] :as action}
   scope
   input]
  (if (false? (:configurable action))
    {:status 400, :body "Cannot configure this action"}
    (cond
      ;; Eventually will be put inside a nicely typed :configuration key
      (:param-map action)
      ;; Dynamically incorporate any new options added since we last saved our configuration.
      (combine-configurations (configuration-for-pending-action action)
                              (configuration (dissoc action :param-map) scope input))

      (pos-int? action-id)
      (configuration-for-saved-action action-id)

      (and action-kw (isa? action-kw :table.row/common))
      (configuration-for-table-action (:table-id input (:table-id scope)) action-kw)

      inner-action
      (let [action-id (:action-id inner-action)
            action-kw (:action-kw inner-action)]
        (cond
          (pos-int? action-id)
          (configuration-for-saved-action action-id)
          (and action-kw (isa? action-kw :table.row/common))
          ;; TODO remove assumption that all primitives are table actions
          (configuration-for-table-action (:table-id input (:table-id scope)) action-kw)
          :else (ex-info "Not a supported row action" {:status-code 500 :scope scope :unified action})))

      ;; TODO support data-grid.row and model.row actions (not important yet)
      :else
      (throw (ex-info "Don't know how to handle this action" {:action action, :scope scope})))))
