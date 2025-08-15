(ns metabase-enterprise.action-v2.execute-form
  (:require
   [metabase.actions.core :as actions]
   [metabase.api.common :as api]
   [metabase.util :as u]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [toucan2.core :as t2]))

(def ^:private strip-namespace-hack (comp keyword name))

(mr/def ::input-type
  ;; TODO this is a clumsy workaround due to the api encoders not being run for some reason
  (mapv
   #(if (keyword? %) (strip-namespace-hack %) %)

   [:enum
    {:encode/api name
     :decode/api #(keyword "input" %)}

    :input/boolean
    :input/date
    :input/datetime
    :input/dropdown
    :input/float
    :input/integer
    :input/text
    :input/textarea
    :input/time]))

(mr/def ::describe-param
  [:map #_{:closed true}
   [:id                                :string]
   [:display_name                      :string]
   [:field_id         {:optional true} pos-int?]
   [:input_type                        ::input-type]
   [:semantic_type    {:optional true} :keyword]
   [:optional                          :boolean]
   ;; TODO in practice this should never be null (and we strip nils current)
   ;;      for table editing actions, this relies on a driver feature that must be implemented for the driver to support
   ;;      data editing, but it could still be NULL in the database when the field metadata was loaded from a serialized
   ;;      definition from an older version.
   [:nullable         {:optional true} :boolean]
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
  (condp #(isa? %2 %1) (:semantic_type field)
    :type/Name        :input/text
    :type/Title       :input/text
    :type/Source      :input/text
    :type/Description :input/textarea
    :type/Category    :input/dropdown
    :type/FK          :input/dropdown
    :type/PK          :input/dropdown
    (condp #(isa? %2 %1) (:base_type field)
      :type/Boolean    :input/boolean
      :type/Integer    :input/integer
      :type/BigInteger :input/integer
      :type/Float      :input/float
      :type/Decimal    :input/float
      :type/Date       :input/date
      :type/DateTime   :input/datetime
      :type/Time       :input/time
      (if (#{:list :auto-list :search} (:type field-values))
        :input/dropdown
        :input/text))))

(defn- describe-table-action
  [{:keys [action-kw
           table-id
           param-map
           row-data]}]
  (when-not table-id
    (throw (ex-info "Must provide table-id" {:status-code 400})))
  (let [table                       (api/read-check (t2/select-one :model/Table :id table-id :active true))
        database                    (t2/select-one :model/Database :id (:db_id table))
        _                           (actions/check-data-editing-enabled-for-database! database)
        fields                      (-> (t2/select :model/Field :table_id table-id :active true {:order-by [[:position]]})
                                        (t2/hydrate :dimensions
                                                    :has_field_values
                                                    :values))
        ;; TODO get this from action configuration, when we add it, or inherit from table configuration
        column-editable?            (constantly true)
        ;; TODO get this from action configuration, when we add it, or inherit from table configuration
        field->sort-idx             {}
        field-sort                  (zipmap (map :name fields) (range))
        sort-key                    (fn [{:keys [name]}]
                                      (or (field->sort-idx name) ; prefer user defined sort in the dashcard
                                          (+ (inc (count field->sort-idx))
                                             (field-sort name))))]
    {:title      (format "%s: %s" (:display_name table) (u/capitalize-en (name action-kw)))
     :parameters (->> (for [field (sort-by sort-key fields)
                            :let [{field-values :values} field
                                  pk?                    (= :type/PK (:semantic_type field))
                                  param-setting          (get param-map (keyword (:name field)))
                                  ;; TODO get this from action configuration, when we add it, or inherit from table conf
                                  column-settings        nil
                                  auto-inc?              (:database_is_auto_increment field pk?)]
                            :when (case action-kw
                                    ;; create does not take pk cols if auto increment, todo generated cols?
                                    (:table.row/create :data-grid.row/create) (not auto-inc?)
                                    ;; delete only requires pk cols
                                    (:table.row/delete :data-grid.row/delete) pk?
                                    ;; update takes both the pk and field (if not a row action)
                                    (:table.row/update
                                     :data-grid.row/update) true)
                            ;; row-actions can explicitly hide parameters
                            :when (not= "hidden" (:visibility param-setting))
                            ;; dashcard column context can hide parameters (if defined)
                            :when (:enabled column-settings true)
                            :let [required (or pk? (:database_required field false))]]

                        (u/remove-nils
                         ;; TODO yet another comment about how field id would be a better key, due to case issues
                         {:id                      (:name field)
                          :display_name            (:display_name field)
                          :semantic_type           (:semantic_type field)
                          ;; TODO we are manually removing the namespace due to an issue with encoder/api not running
                          :input_type              (strip-namespace-hack (field-input-type field field-values))
                          :field_id                (:id field)
                          :human_readable_field_id (-> field :dimensions first :human_readable_field_id)
                          :optional                (not required)
                          :nullable                (:database_is_nullable field)
                          :database_default        (:database_default field)
                          :readonly                (or auto-inc?
                                                       (and pk? (not= "create" (name action-kw)))
                                                       (= "readonly" (:visibility param-setting))
                                                       (not (column-editable? (:name field))))
                          ;; TODO oh dear, we need to worry about case sensitivity issue now (e.g. in tests)
                          ;; it would be much better if our mappings were based on field ids.
                          ;; probably not an issue in practice, because FE is writing the config AND calling execute-form
                          ;; with likely the same names for fields (fingers crossed)
                          :value                   (get row-data (:sourceValueTarget param-setting))}))
                      vec)}))

(mu/defn describe-form :- ::action-description
  "Describe parameters of an unified action."
  [action-def scope partial-input]
  (cond
    (:action-id action-def)
    (throw (ex-info "We do not currently support execution of Model Actions" {:status-code 400}))

    ;; TODO remove assumption that all primitives are table actions
    (:action-kw action-def)
    (describe-table-action
     {:action-kw (:action-kw action-def)
      :table-id  (:table-id partial-input)
      :param-map (:param-map action-def)})
    :else
    (throw (ex-info "Not able to execute given action yet" {:status-code 500 :scope scope :action-def action-def}))))
