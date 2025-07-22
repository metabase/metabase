(ns metabase-enterprise.action-v2.describe
  (:require
   [metabase.api.common :as api]
   [metabase.util :as u]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [toucan2.core :as t2]))

(mr/def ::describe-param
  [:map #_{:closed true}
   [:id                                :string]
   [:display_name                      :string]
   [:field_id         {:optional true} pos-int?]
   [:input_type                        [:enum "dropdown" "textarea" "date" "datetime" "text"]]
   [:semantic_type    {:optional true} :keyword]
   [:optional                          :boolean]
   [:nullable                          :boolean]
   [:readonly                          :boolean]
   [:database_default {:optional true} :any]
   ;; value can be nil, so this is optional to avoid confusion
   [:value            {:optional true} :any]
   [:value_options    {:optional true} [:sequential :any]]
   ;; is it more useful if we have field_id instead of this?
   [:human_readable_field_id {:optional true} pos-int?]])

(mr/def ::action-description
  [:map {:closed true}
   [:title :string]
   [:parameters [:sequential ::describe-param]]])

(defn- field-input-type
  [field field-values]
  (case (:type field-values)
    (:list :auto-list :search) "dropdown"
    (condp #(isa? %2 %1) (:semantic_type field)
      :type/Description "textarea"
      :type/Category    "dropdown"
      :type/FK          "dropdown"
      (condp #(isa? %2 %1) (:base_type field)
        :type/Date     "date"
        :type/DateTime "datetime"
        "text"))))

(defn- describe-table-action
  [{:keys [action-kw
           table-id
           param-map
           dashcard-viz
           row-data]}]
  (when-not table-id
    (throw (ex-info "Must provide table-id" {:status-code 400})))
  (let [table                       (api/read-check (t2/select-one :model/Table :id table-id :active true))
        fields                      (-> (t2/select :model/Field :table_id table-id :active true {:order-by [[:position]]})
                                        (t2/hydrate :dimensions
                                                    :has_field_values
                                                    :values))
        ;; it's a huge assumption that there's always dashcard-viz
        ;; TODO: this should live in our configuration
        dashcard-column-editable?   (or (some-> dashcard-viz :table.editableColumns set)
                                        ;; columns are assumed editable if no dashcard-viz specialisation
                                        (constantly true))
        dashcard-sort               (zipmap (map :name (:table.columns dashcard-viz)) (range))
        field-name->dashcard-column (u/index-by :name (:table.columns dashcard-viz))
        field-sort                  (zipmap (map :name fields) (range))
        sort-key                    (fn [{:keys [name]}]
                                      (or (dashcard-sort name) ; prefer user defined sort in the dashcard
                                          (+ (inc (count dashcard-sort))
                                             (field-sort name))))]
    {:title      (format "%s: %s" (:display_name table) (u/capitalize-en (name action-kw)))
     :parameters (->> (for [field (sort-by sort-key fields)
                            :let [{field-values :values} field
                                  pk                     (= :type/PK (:semantic_type field))
                                  param-setting          (get param-map (keyword (:name field)))
                                  dashcard-column        (field-name->dashcard-column (:name field))]
                            :when (case action-kw
                                    ;; create does not take pk cols if auto increment, todo generated cols?
                                    (:table.row/create :data-grid.row/create) (not (:database_is_auto_increment field))
                                    ;; delete only requires pk cols
                                    (:table.row/delete :data-grid.row/delete) pk
                                    ;; update takes both the pk and field (if not a row action)
                                    (:table.row/update
                                     :data-grid.row/update) true)
                            ;; row-actions can explicitly hide parameters
                            :when (not= "hidden" (:visibility param-setting))
                            ;; dashcard column context can hide parameters (if defined)
                            :when (:enabled dashcard-column true)
                            :let [required (or pk (:database_required field))]]
                        (u/remove-nils
                         ;; TODO yet another comment about how field id would be a better key, due to case issues
                         {:id                      (:name field)
                          :display_name            (:display_name field)
                          :semantic_type           (:semantic_type field)
                          :input_type              (field-input-type field field-values)
                          :field_id                (:id field)
                          :human_readable_field_id (-> field :dimensions first :human_readable_field_id)
                          :optional                (not required)

                          :nullable                (:database_is_nullable field
                                                                          ;; can the remove the default "false"
                                                                          ;; value once #60263 is merged
                                                                          false)
                          :database_default        (:database_default field)
                          :readonly                (or (= "readonly" (:visibility param-setting))
                                                       (not (dashcard-column-editable? (:name field))))
                          ;; TODO oh dear, we need to worry about case sensitivity issue now (e.g. in tests)
                          ;; it would be much better if our mappings were based on field ids.
                          ;; probably not an issue in practice, because FE is writing the config AND calling execute-form
                          ;; with likely the same names for fields (fingers crossed)
                          :value                   (get row-data (:sourceValueTarget param-setting))}))
                      vec)}))

(mu/defn describe-unified-action :- ::action-description
  "Describe parameters of an unified action."
  [action-def scope row-data partial-input]
  (cond
    (:action-id action-def)
    (throw (ex-info "We do not currently support execution of Model Actions" {:status-code 400}))

    ;; TODO remove assumption that all primitives are table actions
    (:action-kw action-def)
    (describe-table-action
     {:action-kw    (:action-kw action-def)
      :table-id     (:table-id partial-input)
      :param-map    (:param-map action-def)
      ;; TODO see how to remove
      ;; tried commenting it out and no tests failed, so will leave this here as reference for now
      ;; (also don't see any code that could ever populate this tho)
      :dashcard-viz nil})
    :else
    (throw (ex-info "Not able to execute given action yet" {:status-code 500 :scope scope :action-def action-def}))))
