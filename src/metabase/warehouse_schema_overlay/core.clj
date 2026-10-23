(ns metabase.warehouse-schema-overlay.core
  "Sources for queries over Fields and Tables: [[field-query]] and [[table-query]] merge each row with the values
  in its user-settings table. `metabase_field_user_settings` holds human values and, for the columns of
  [[field-ai-columns]], accepted AI values too."
  (:require
   [metabase.premium-features.defenterprise :refer [defenterprise]]
   [metabase.util :as u]
   [metabase.util.malli :as mu]
   [toucan2.core :as t2]))

(def user-settable-field-columns
  "The Field columns users can set. Their user values live in `metabase_field_user_settings`, never in `metabase_field`."
  #{:semantic_type :description :display_name :visibility_type :has_field_values :effective_type :coercion_strategy
    :fk_target_field_id :caveats :points_of_interest :nfc_path :json_unfolding :settings :data_sensitivity
    :custom_position})

(def field-user-settings-flags
  "The user-settable Field columns a machine also writes, mapped to the flag that says the user set the column, NULL
  included."
  {:description        :description_set
   :semantic_type      :semantic_type_set
   :fk_target_field_id :fk_target_field_id_set
   :data_sensitivity   :data_sensitivity_set})

(def field-ai-columns
  "The user-settable Field columns that can have an accepted AI value, mapped to the `metabase_field_user_settings`
  column that holds it. Users see the human value when its flag is set, else the AI value, else the Field's."
  {:semantic_type    :ai_semantic_type
   :description      :ai_description
   :data_sensitivity :ai_data_sensitivity})

(def field-columns
  "Every column of `metabase_field`. Spelled out rather than read from `:metabase.warehouse-schema.schema/field`,
  which lives in a module above this one; `metabase.warehouse-schema-overlay.core-test` fails if the two drift."
  #{:active :base_type :caveats :coercion_strategy :created_at :custom_position :data_sensitivity :database_default
    :database_indexed :database_is_auto_increment :database_is_generated :database_is_nullable :database_is_pk
    :database_partitioned :database_position :database_required :database_type :description
    :dimension_interestingness :display_name :effective_type :fingerprint :fingerprint_version :fk_target_field_id
    :has_field_values :id :is_defective_duplicate :json_unfolding :last_analyzed :name :nfc_path :parent_id
    :points_of_interest :position :preview_display :semantic_type :settings :table_id :unique_field_helper
    :updated_at :visibility_type})

(def ^:private sync-owned-field-columns
  "The columns of `metabase_field` users cannot set."
  (sort (remove user-settable-field-columns field-columns)))

(mu/defn- field-user-settings-join
  "The `:left-join` entries joining `metabase_field_user_settings` as `settings-alias` to the Field table aliased
  `field-alias`; see [[field-user-settings-column]]."
  [field-alias    :- :keyword
   settings-alias :- :keyword]
  [[(t2/table-name :model/FieldUserSettings) settings-alias]
   [:= (u/qualified-key settings-alias :field_id) (u/qualified-key field-alias :id)]])

(mu/defn- field-user-set-condition
  "Honey SQL test for whether the user set `column`, or nil when a non-NULL value says so itself."
  [column         :- (into [:enum] user-settable-field-columns)
   settings-alias :- :keyword]
  (if-let [flag (field-user-settings-flags column)]
    [:= (u/qualified-key settings-alias flag) true]
    (when (= column :coercion_strategy)
      [:not= (u/qualified-key settings-alias :effective_type) nil])))

(mu/defn- field-user-settings-column
  "Honey SQL expression for `column` as users see it: the user value when set, else the accepted AI value (see
  [[field-ai-columns]]), else the Field's."
  [column         :- (into [:enum] user-settable-field-columns)
   field-alias    :- :keyword
   settings-alias :- :keyword]
  (let [field-column    (u/qualified-key field-alias column)
        settings-column (u/qualified-key settings-alias column)
        fallback        (if-let [ai-column (field-ai-columns column)]
                          [:coalesce (u/qualified-key settings-alias ai-column) field-column]
                          field-column)]
    (if-let [condition (field-user-set-condition column settings-alias)]
      [:case condition settings-column :else fallback]
      (if (= column :json_unfolding)
        [:case [:= [:coalesce settings-column field-column] true] true :else false]
        [:coalesce settings-column field-column]))))

(mu/defn field-layered-condition
  "Honey SQL test for whether readers see a human or accepted AI value of `column`, a key of [[field-ai-columns]],
  over the Field's own value. `settings-alias` names the joined `metabase_field_user_settings`."
  [column         :- (into [:enum] (keys field-ai-columns))
   settings-alias :- :keyword]
  [:or
   (field-user-set-condition column settings-alias)
   [:not= (u/qualified-key settings-alias (field-ai-columns column)) nil]])

(defenterprise field-ai-proposal
  "Honey SQL for the pending AI proposal of `attribute`, a key of [[field-ai-columns]], for the Field aliased
  `field-alias`, with the proposal table aliased `proposal-alias`: a map of `:join`, a `:left-join` pair that adds at
  most one row per Field, and the `:value`, `:reasoning` and `:confidence` expressions, NULL when there is no pending
  proposal. The proposals live in an EE table. Without the `:data-sensitivity` feature this returns nil, and
  `{:ai-proposals? true}` reads the same as the default."
  metabase-enterprise.data-sensitivity.overlay
  [_field-alias _proposal-alias _attribute]
  nil)

(defn- ai-proposal-column
  [attribute suffix]
  (keyword (str "ai_proposal_" (name attribute) suffix)))

(defn- field-ai-proposals
  "Per attribute of [[field-ai-columns]] in `merged`, the Honey SQL of [[field-ai-proposal]] for its pending AI
  proposal."
  [merged]
  (into {}
        (keep (fn [attribute]
                (let [proposal-alias (keyword (str "p_" (name attribute)))]
                  (when-let [proposal (field-ai-proposal :f proposal-alias attribute)]
                    [attribute proposal]))))
        (sort (filter (set merged) (keys field-ai-columns)))))

(defn- field-ai-proposal-select
  "The `:select` entries of the preview read for `attribute`: the proposal, its reasoning and confidence, and whether
  it is over a human value."
  [attribute {:keys [value reasoning confidence]}]
  [[value (ai-proposal-column attribute "")]
   [reasoning (ai-proposal-column attribute "_reasoning")]
   [confidence (ai-proposal-column attribute "_confidence")]
   [[:case [:and [:not= value nil] (field-user-set-condition attribute :u)] true :else false]
    (ai-proposal-column attribute "_conflict")]])

(defn fold-ai-proposals
  "Move the `ai_proposal_*` columns of a preview read (see [[field-query]]) of `field` into `:ai_proposals`, a map of
  attribute to `{:value :reasoning :confidence :conflict}` for each attribute with a pending proposal. Returns a
  `field` without those columns unchanged."
  [field]
  (let [attributes (filter #(contains? field (ai-proposal-column % "")) (keys field-ai-columns))]
    (if (empty? attributes)
      field
      (reduce (fn [field attribute]
                (let [ks        (mapv #(ai-proposal-column attribute %) ["" "_reasoning" "_confidence" "_conflict"])
                      [value reasoning confidence conflict] (map #(get field %) ks)
                      field     (apply dissoc field ks)]
                  (cond-> field
                    (some? value) (assoc-in [:ai_proposals attribute]
                                            {:value      value
                                             :reasoning  reasoning
                                             :confidence (some-> confidence keyword)
                                             :conflict   (boolean (#{true 1} conflict))}))))
              (assoc field :ai_proposals {})
              attributes))))

(mu/defn field-query :- [:tuple :any :keyword]
  "The source a query over Fields reads from: `metabase_field` merged with the human and accepted AI values.
  `:alias` names it for joins; `{:user-settings? false}` gives sync's own values. `{:deterministic-ai-columns? true}`
  reads the columns of [[field-ai-columns]] from `metabase_field` and merges the rest: the view of the classifiers,
  which write that layer under the human and AI values but must respect the other user settings, such as a coercion.

  `{:ai-proposals? true}` is the preview of Data Studio: each merged column of [[field-ai-columns]] with a pending AI
  proposal reads the proposal, also over a human value, and `ai_proposal_*` columns describe the proposals (see
  [[fold-ai-proposals]]). Queries, Metabot and the query builder never use it."
  ([]
   (field-query nil))

  ([{:keys [alias user-settings? deterministic-ai-columns? ai-proposals?]
     :or   {alias          (t2/table-name :model/Field)
            user-settings? true}} :- [:maybe [:map {:closed true}
                                              [:alias                     {:optional true} :keyword]
                                              [:user-settings?            {:optional true} :boolean]
                                              [:deterministic-ai-columns? {:optional true} :boolean]
                                              [:ai-proposals?             {:optional true} :boolean]]]]
   [(if user-settings?
      (let [from-field (cond-> (vec sync-owned-field-columns)
                         deterministic-ai-columns? (into (sort (keys field-ai-columns))))
            merged     (sort (remove (set from-field) user-settable-field-columns))
            proposals  (when ai-proposals? (field-ai-proposals merged))
            column     (fn [column]
                         (let [expr (field-user-settings-column column :f :u)]
                           [(if-let [{:keys [value]} (get proposals column)]
                              [:case [:not= value nil] value :else expr]
                              expr)
                            column]))]
        (cond-> ^:allow-subquery {:select    (into (mapv #(u/qualified-key :f %) from-field)
                                                   (map column)
                                                   merged)
                                  :from      [[(t2/table-name :model/Field) :f]]
                                  :left-join (field-user-settings-join :f :u)}
          (seq proposals) (-> (update :select into (mapcat (fn [[attribute proposal]]
                                                             (field-ai-proposal-select attribute proposal)))
                                      proposals)
                              (update :left-join into (mapcat :join) (vals proposals)))))
      (t2/table-name :model/Field))
    alias]))

(def user-settable-table-columns
  "The Table columns users can set. Their user values live in `metabase_table_user_settings`, never in
  `metabase_table`."
  #{:display_name :description :entity_type :visibility_type :caveats :points_of_interest :data_layer :data_source
    :owner_email :owner_user_id :field_order :show_in_getting_started :data_authority :is_published :collection_id})

(def table-user-settings-flags
  "The user-settable Table columns a user can clear, mapped to the flag that says the user set the column, NULL
  included."
  {:description        :description_set
   :visibility_type    :visibility_type_set
   :caveats            :caveats_set
   :points_of_interest :points_of_interest_set
   :data_layer         :data_layer_set
   :data_source        :data_source_set})

(def table-columns
  "Every column of `metabase_table`. Spelled out rather than read from `:metabase.warehouse-schema.schema/table`,
  which lives in a module above this one; `metabase.warehouse-schema-overlay.core-test` fails if the two drift."
  #{:active :archived_at :caveats :collection_id :created_at :data_authority :data_layer :data_source
    :database_require_filter :db_id :deactivated_at :description :display_name :entity_type :estimated_row_count
    :field_order :id :initial_sync_status :is_defective_duplicate :is_published :is_upload :is_writable :name
    :owner_email :owner_user_id :points_of_interest :schema :show_in_getting_started :transform_id :transform_target
    :unique_table_helper :updated_at :view_count :visibility_type})

(def ^:private sync-owned-table-columns
  "The columns of `metabase_table` users cannot set."
  (sort (remove user-settable-table-columns table-columns)))

(mu/defn- table-user-settings-join
  "The `:left-join` entries joining `metabase_table_user_settings` as `settings-alias` to the Table table aliased
  `table-alias`; see [[table-user-settings-column]]."
  [table-alias    :- :keyword
   settings-alias :- :keyword]
  [[(t2/table-name :model/TableUserSettings) settings-alias]
   [:= (u/qualified-key settings-alias :table_id) (u/qualified-key table-alias :id)]])

(mu/defn- table-user-set-condition
  "Honey SQL test for whether the user set `column`, or nil when a non-NULL value says so itself; `collection_id`
  follows `is_published`."
  [column         :- (into [:enum] user-settable-table-columns)
   settings-alias :- :keyword]
  (if-let [flag (table-user-settings-flags column)]
    [:= (u/qualified-key settings-alias flag) true]
    (when (= column :collection_id)
      [:not= (u/qualified-key settings-alias :is_published) nil])))

(mu/defn- table-user-settings-column
  "Honey SQL expression for `column` as users see it: the user value when set, else the Table's."
  [column         :- (into [:enum] user-settable-table-columns)
   table-alias    :- :keyword
   settings-alias :- :keyword]
  (let [table-column    (u/qualified-key table-alias column)
        settings-column (u/qualified-key settings-alias column)]
    (if-let [condition (table-user-set-condition column settings-alias)]
      [:case condition settings-column :else table-column]
      (if (#{:show_in_getting_started :is_published} column)
        [:case [:= [:coalesce settings-column table-column] true] true :else false]
        [:coalesce settings-column table-column]))))

(mu/defn table-user-visibility-type
  "Honey SQL expression for the `visibility_type` users see for the Table aliased `table-alias`: the user value
  when set, else the Table's. Reads only `table-alias`'s `id`, so it can filter a query over raw `metabase_table`."
  [table-alias :- :keyword]
  ;; A scalar subquery, not a join, so the caller's rows keep `metabase_table`'s shape. It re-reads the Table so the
  ;; LEFT JOIN always yields one row: a user-set NULL must not fall back to the Table's value.
  ^:allow-subquery
  {:select    [[(table-user-settings-column :visibility_type :vt_t :vt_u)]]
   :from      [[(t2/table-name :model/Table) :vt_t]]
   :left-join (table-user-settings-join :vt_t :vt_u)
   :where     [:= :vt_t.id (u/qualified-key table-alias :id)]})

(mu/defn table-query :- [:tuple :any :keyword]
  "The source a query over Tables reads from: `metabase_table` merged with the user values, with the options of
  [[field-query]]."
  ([]
   (table-query nil))

  ([{:keys [alias user-settings?]
     :or   {alias          (t2/table-name :model/Table)
            user-settings? true}} :- [:maybe [:map {:closed true}
                                              [:alias          {:optional true} :keyword]
                                              [:user-settings? {:optional true} :boolean]]]]
   [(if user-settings?
      ^:allow-subquery
      {:select    (into (mapv #(u/qualified-key :t %) sync-owned-table-columns)
                        (map (fn [column] [(table-user-settings-column column :t :u) column]))
                        (sort user-settable-table-columns))
       :from      [[(t2/table-name :model/Table) :t]]
       :left-join (table-user-settings-join :t :u)}
      (t2/table-name :model/Table))
    alias]))
