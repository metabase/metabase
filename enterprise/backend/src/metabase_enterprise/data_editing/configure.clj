(ns metabase-enterprise.data-editing.configure
  (:require
   [malli.core :as mc]
   [medley.core :as m]
   [metabase.actions.core :as actions]
   [metabase.api.common :as api]
   [metabase.models.humanization :as humanization]
   [metabase.util :as u]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]
   [metabase.warehouse-schema.models.table :as table]
   [toucan2.core :as t2]))

(defn- merge-option
  [entry-schema new-options]
  (if (= 2 (count entry-schema))
    (let [[k s] entry-schema]
      [k new-options s])
    (let [[k o s] entry-schema]
      [k (merge o new-options) s])))

;; This schema is Order important, as it'll be the order UI elments will be shown.
(mr/def ::param-configuration
  ;; TODO Yeah, gross. This is currently just mirroring the config in the FE.
  ;; They at least have defined it using a nicer dependently typed way! See ConstantRowActionFieldSettings.
  ;; We could do something like that with malli... but once this stuff is opaque to the frontend, we can go wild and
  ;; make the shape more idiomatically Clojure, and maybe we should just wait until we've finalized the shape.
  [:map {:closed true}
   [:id :string]
   [:configure-details {:optional true} [:sequential [:tuple :keyword :map]]]
   ;; omiited if we have visibility != null
   (merge-option [:display-name :string]
                 {:optional      true
                  ::display-name "Field Name"
                  ::input-type   :text})
   (merge-option [:source-type [:enum "ask-user" "row-data" "constant"]]
                 {:optional      true
                  ::display-name "Source Type"
                  ::default      "ask-user"
                  ::input-type   :dropdown
                  ::options      ["ask-user" "row-data" "constant"]})
   ;; omitted if we have visibility != null
   (merge-option [:source-value :string]
                 {:optional      true
                  ::display-name "Pick column"
                  ::default      nil
                  ::visible-if   [:source-type "row-data"]
                  ::input-type   :column-picker})
   (merge-option [:value [:or :string :int :boolean]]
                 {:optional      true
                  ::display-name "Value"
                  ::input-type   :field-filter
                  ::visible-if   [:source-type "constant"]
                  ::default      nil})
   (merge-option [:editable :boolean] ;; only when visible is true
                 {:optional      true
                  ::descripion   "Can you override"
                  ::display-name "Editable"
                  ::input-type   :select
                  ::vislble-if   [[:source-type "ask-user"] [:source-type "constant"]]
                  ::default      nil})
   (merge-option [:required :boolean] ;; only show when the underline fields is nullable
                 {:optional      true
                  ::description  "Whether this field is required" ;; can't turn off if the underlying field is required
                  ::display-name "Required"
                  ::input-type   :select
                  ::vislble-if   [[:source-type "ask-user"] [:source-type "constant"]]
                  ::default      nil})
   (merge-option [:visible :boolean] ;; can't be false if the field is required
                 {:optional      true
                  ::description  "Whether to show this field value in the form"
                  ::display-name "Visible"
                  ::input-type   :select
                  ::default      true})])

(def ^:private default-configuration-detais
  (for [[k p _s] (mc/children (mr/resolve-schema ::param-configuration))
        :let    [namespaced-opts (m/filter-keys namespace p)]
        :when   (seq namespaced-opts)]
    (-> namespaced-opts
        (update-keys (comp keyword name))
        (assoc :id k))))

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
                   {:id                (case (:type action)
                                         :query (:slug param)
                                         :implicit (:id param))
                    :source-type       "ask-user"
                    :configure-details default-configuration-detais})}))

;; TODO handle exposing new inputs required by the inner-action
(defn- configuration-for-pending-action [{:keys [param-map] :as action}]
  ;; TODO Delegate to get this
  {:title      (:name action "TODO - depends on existing configuration if already saved, otherwise from the inner action as the default.")
   :parameters (for [[param-id param-settings] param-map]
                 (-> param-settings
                     (assoc :id (name param-id))
                     (update :displayName #(or % (humanization/name->human-readable-name (name param-id))))))})

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
                   {:id                (:name field)
                    :source            "ask-user"
                    :configure-details default-configuration-detais})}))

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
