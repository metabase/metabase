(ns metabase-enterprise.data-editing.describe
  (:require
   [metabase.actions.core :as actions]
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
        fields                      (-> (t2/select :model/Field :table_id table-id {:order-by [[:position]]})
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
                                    (:table.row/update :data-grid.row/update :table.row/create-or-update) true)
                            ;; row-actions can explicitly hide parameters
                            :when (not= "hidden" (:visibility param-setting))
                            ;; dashcard column context can hide parameters (if defined)
                            :when (:enabled dashcard-column true)
                            :let [required (or pk (:database_required field))]]
                        (u/remove-nils
                         {:id                      (:name field) ;; TODO we shouldn't use field name as id I think, what if we have 1 field that maps to 2 params?
                          :display_name            (:display_name field)
                          :semantic_type           (:semantic_type field)
                          :input_type              (field-input-type field field-values)
                          :field_id                (:id field)
                          :human_readable_field_id (-> field :dimensions first :human_readable_field_id)
                          :optional                (not required)
                          :nullable                (:database_is_nullable field)
                          :database_default        (:database_default field)
                          :readonly                (or (= "readonly" (:visibility param-setting))
                                                       (not (dashcard-column-editable? (:name field))))
                          ;; TODO oh dear, we need to worry about case sensitivity issue now (e.g. in tests)
                          ;; it would be much better if our mappings were based on field ids.
                          ;; probably not an issue in practice, because FE is writing the config AND calling tmp-modal
                          ;; with likely the same names for fields (fingers crossed)
                          :value                   (get row-data (:sourceValueTarget param-setting))}))
                      vec)}))

(defn- saved-param-base-type
  [param-type viz-field]
  (case param-type
    :string/= :type/Text
    :number/= :type/Number
    :date/single (case (:inputType viz-field)
                   ;; formatting needs thought
                   "datetime" :type/DateTime
                   :type/Date)
    (if (= "type" (namespace param-type))
      param-type
      (throw
       (ex-info "Unsupported query action parameter type"
                {:status-code 500
                 :param-type  param-type})))))

(defn- saved-param-input-type
  [param-type viz-field]
  (cond
    ;; we could distinguish between inline-select and dropdown (which are both options for model action params)
    (seq (:valueOptions viz-field))
    "dropdown"

    (= "text" (:inputType viz-field))
    "textarea"

    :else
    (condp #(isa? %2 %1) (saved-param-base-type param-type viz-field)
      :type/Date     "date"
      :type/DateTime "datetime"
      "text")))

(defn- describe-saved-action
  [{:keys [action-id param-map row-data]}]
  (let [action              (-> (actions/select-action :id action-id
                                                       :archived false
                                                       {:where [:not [:= nil :model_id]]})
                                api/read-check
                                api/check-404)
        param-id->viz-field (-> action :visualization_settings (:fields {}))]
    ;; TODO: this assumes this is a query action, we need to handle implicit actions as well
    {:title      (:name action)
     :parameters (->> (for [param (:parameters action)
                            ;; query type actions store most stuff in viz settings rather than the
                            ;; parameter
                            :let [viz-field     (param-id->viz-field (:id param))
                                  param-mapping (get param-map (keyword (:id param)))]
                            :when (and (not (:hidden viz-field))
                                       (not= "hidden" (:visibility param-mapping)))]
                        (u/remove-nils
                         {:id            (:id param)
                          :display_name  (or (:display-name param) (:name param))
                          :input_type    (saved-param-input-type (:type param) viz-field)
                          :optional      (and (not (:required param)) (not (:required viz-field)))
                          ;; TODO Ngoc: is there a way to know this?
                          ;;      Chris: well the param would need to tell us.
                          ;;             for now let's guess that anything required is not nullabe
                          :nullable      (not (:required param))
                          :readonly      (= "readonly" (:visibility param-mapping))
                          :value         (get row-data (:sourceValueTarget param-mapping))
                          :value_options (:valueOptions viz-field)}))
                      vec)}))

(mu/defn describe-unified-action :- ::action-description
  "Describe parameters of an unified action."
  [unified scope row-data partial-input]
  ;; TODO: we didn't handle dashboard-action (i.e. dashboard buttons)
  (cond
    ;; saved action
    ;; hmm, having checked like this makes me insecure, what makes having an action-id enforces that this
    ;; is an saved question? what if put an aciton-id on a row action for some reasons?
    (:action-id unified)
    (describe-saved-action {:action-id (:action-id unified)})

    ;; table action
    ;; TODO remove assumption that all primitives are table actions
    (:action-kw unified)
    (describe-table-action
     {:action-kw    (:action-kw unified)
      :table-id     (:table-id partial-input)
      :param-map    (:param-map unified)
      ;; tried commenting it out and no tests failed, so will leave this here as reference for now
      ;; (also don't see any code that could ever populate this tho)
      :dashcard-viz nil #_(:dashcard-viz (:dashcard-viz unified))})
    (:inner-action unified)
    (let [inner        (:inner-action unified)
          param-map    (:param-map unified)
          dashcard-id  (:dashcard-id unified)
          dashcard-viz (or (:dashcard-viz unified)
                           ;; TODO we shouldn't need this fallback, fetch-unified-action should have fetched this for us
                           (t2/select-one-fn :visualization_settings :model/DashboardCard dashcard-id))
          saved-id    (:action-id inner)
          action-kw   (:action-kw inner)
          table-id    (:table-id partial-input)]
      (cond
        saved-id
        (describe-saved-action {:action-id              saved-id
                                :row-action-dashcard-id dashcard-id
                                :param-map              param-map
                                :row-data               row-data})
        action-kw
        ;; TODO remove assumption that all primitives are table actions
        (describe-table-action {:action-kw    action-kw
                                :table-id     table-id
                                :param-map    param-map
                                :dashcard-viz dashcard-viz
                                :row-data     row-data})
        :else (ex-info "Not a supported row action" {:status-code 500 :scope scope :unified unified})))
    :else
    (throw (ex-info "Not able to execute given action yet" {:status-code 500 :scope scope :unified unified}))))
