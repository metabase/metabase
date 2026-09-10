(ns metabase.lib-be.db
  "Application database queries for the lib backend module. Every function here is a direct Toucan 2 call with no
  additional logic, so no other namespace in the module runs a query itself (model definitions still use `toucan2.core`)."
  (:require
   [honey.sql.helpers :as sql.helpers]
   [metabase.lib.metadata.protocols :as lib.metadata.protocols]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.util :as u]
   [metabase.util.malli :as mu]
   [toucan2.core :as t2]))

;;; ------------------------------------------ Field user settings ------------------------------------------
;;;
;;; The user's values for a Field live in `metabase_field_user_settings`; these helpers apply them in app-DB SQL.

(def user-settable-field-columns
  "The Field columns users can set. Their user values live in `metabase_field_user_settings`, never in `metabase_field`."
  #{:semantic_type :description :display_name :visibility_type :has_field_values :effective_type :coercion_strategy
    :fk_target_field_id :caveats :points_of_interest :nfc_path :json_unfolding :settings :data_sensitivity})

(def field-user-settings-flags
  "The user-settable Field columns that are nullable on the Field and also written by sync, mapped to the
  `metabase_field_user_settings` flag recording that the user made the call: for these a user's NULL beats the sync
  value."
  {:description        :description_set
   :semantic_type      :semantic_type_set
   :fk_target_field_id :fk_target_field_id_set})

(mu/defn field-user-settings-join
  "The `:left-join` entries joining `metabase_field_user_settings` as `settings-alias` to the Field table aliased
  `field-alias`; see [[field-user-settings-column]]."
  [field-alias    :- :keyword
   settings-alias :- :keyword]
  [[(t2/table-name :model/FieldUserSettings) settings-alias]
   [:= (u/qualified-key settings-alias :field_id) (u/qualified-key field-alias :id)]])

(mu/defn field-user-settings-column
  "Honey SQL expression for the user-settable Field column `column` as users see it: the value in
  `metabase_field_user_settings` (aliased `settings-alias`) when the user set it, else the Field's (aliased
  `field-alias`). A user's NULL counts as set for the [[field-user-settings-flags]] when their flag is true, and for
  `coercion_strategy` whenever the user set `effective_type`. Requires [[field-user-settings-join]]."
  [column         :- (into [:enum] user-settable-field-columns)
   field-alias    :- :keyword
   settings-alias :- :keyword]
  (let [field-column    (u/qualified-key field-alias column)
        settings-column (u/qualified-key settings-alias column)
        flag            (field-user-settings-flags column)]
    (cond
      flag
      [:case [:= (u/qualified-key settings-alias flag) true] settings-column :else field-column]

      (= column :coercion_strategy)
      [:case [:not= (u/qualified-key settings-alias :effective_type) nil] settings-column :else field-column]

      ;; a CASE on the boolean gives every app DB a value its JDBC driver reads back as a boolean or a number
      (= column :json_unfolding)
      [:case [:= [:coalesce settings-column field-column] true] true :else false]

      :else
      [:coalesce settings-column field-column])))

(mu/defn field-user-settings-column-where
  "Honey SQL clause `[op column value]` on the user-settable Field column `column` as users see it (see
  [[field-user-settings-column]]), as an `:or` of a branch on the Field's own column and one on the user settings'
  so both stay index-eligible. Requires [[field-user-settings-join]]."
  [column         :- (into [:enum] user-settable-field-columns)
   field-alias    :- :keyword
   settings-alias :- :keyword
   op             :- :keyword
   value          :- :any]
  (let [field-column    (u/qualified-key field-alias column)
        settings-column (u/qualified-key settings-alias column)
        user-set?       (if-let [flag (field-user-settings-flags column)]
                          [:= [:coalesce (u/qualified-key settings-alias flag) false] true]
                          [:not= (u/qualified-key settings-alias (if (= column :coercion_strategy) :effective_type column)) nil])]
    [:or
     [:and [:not user-set?] [op field-column value]]
     [:and user-set? [op settings-column value]]]))

;;; ----------------------------------------- Databases and Cards -----------------------------------------

(mu/defn card-database-ids
  "The `:id`, `:database_id`, and `:card_schema` of the Cards with `card-ids`."
  [card-ids :- [:set ::lib.schema.id/card]]
  (t2/select [:model/Card :id :database_id :card_schema] :id [:in card-ids]))

(mu/defn database
  "The `:metadata/database` with `database-id`, or nil."
  [database-id :- ::lib.schema.id/database]
  (t2/select-one :metadata/database database-id))

;;; ----------------------------------------------- Lib metadata -----------------------------------------------
;;;
;;; Each `:metadata/*` type below is a distinct Toucan 2 model. `metadata-where` is a private helper shared by the
;;; per-type functions; it is never exposed, so callers always pick the model by calling the right function.

(defn- db-id-key [metadata-type]
  (case metadata-type
    :metadata/table                :db_id
    :metadata/column               :table/db_id
    :metadata/card                 :card/database_id
    :metadata/metric               :database_id
    :metadata/segment              :table/db_id
    :metadata/measure              :table/db_id
    :metadata/native-query-snippet nil
    :metadata/transform            nil))

(defn- id-key [metadata-type]
  (case metadata-type
    :metadata/table                :id
    :metadata/column               :field/id
    :metadata/card                 :card/id
    :metadata/metric               :id
    :metadata/segment              :segment/id
    :metadata/measure              :measure/id
    :metadata/native-query-snippet :id
    :metadata/transform            :id))

(defn- name-key [metadata-type]
  (case metadata-type
    :metadata/table                :name
    :metadata/column               :field/name
    :metadata/card                 :card/name
    :metadata/metric               :name
    :metadata/segment              :segment/name
    :metadata/measure              :measure/name
    :metadata/native-query-snippet :name
    :metadata/transform            :name))

(defn- table-id-key [metadata-type]
  ;; types not in the case statement do not support Table ID
  (case metadata-type
    :metadata/column  :field/table_id
    :metadata/metric  :table_id
    :metadata/segment :segment/table_id
    :metadata/measure :measure/table_id))

(defn- card-id-key [metadata-type]
  ;; types not in the case statement do not support Card ID
  (case metadata-type
    :metadata/metric :source_card_id))

(defn- active-only-where [metadata-type include-sensitive?]
  (case metadata-type
    :metadata/table
    [:and
     [:= :active true]
     [:or
      [:= :visibility_type nil]
      [:not-in :visibility_type ["hidden" "technical" "cruft"]]]]

    :metadata/column
    (let [excluded-visibility-types (cond-> ["retired"]
                                      (not include-sensitive?) (conj "sensitive"))
          visibility-type           (field-user-settings-column :visibility_type :field :settings)]
      [:and
       [:= :field/active true]
       [:or
        [:= visibility-type nil]
        [:not-in visibility-type excluded-visibility-types]]])

    :metadata/card
    [:= :card/archived false]

    :metadata/metric
    [:= :archived false]

    :metadata/segment
    [:= :segment/archived false]

    :metadata/measure
    [:= :measure/archived false]

    #_else
    nil))

(mu/defn- metadata-where
  "The `:where` map picking out the `metadata-type` rows for `database-id`, narrowed by `metadata-spec`'s `:id`,
  `:name`, `:table-ids`, and `:card-ids` (whichever apply to `metadata-type`), or restricted to active/visible
  rows when none of `:id`/`:name` is given (`:include-sensitive?` controlling whether sensitive columns count
  as active). This should match [[metabase.lib.metadata.protocols/default-spec-filter-xform]] as closely as
  possible."
  [metadata-type :- ::lib.metadata.protocols/metadata-type-excluding-database
   database-id   :- ::lib.schema.id/database
   {id-set :id, name-set :name, :keys [table-ids card-ids include-sensitive?]} :- ::lib.metadata.protocols/metadata-spec]
  (let [database-id-key (db-id-key metadata-type)
        active-only?    (not (or id-set name-set))
        metric?         (= metadata-type :metadata/metric)
        where-clauses   (cond-> []
                          database-id-key         (conj [:= database-id-key database-id])
                          id-set                  (conj [:in (id-key metadata-type) id-set])
                          name-set                (conj [:in (name-key metadata-type) name-set])
                          table-ids               (conj [:in (table-id-key metadata-type) table-ids])
                          card-ids                (conj [:in (card-id-key metadata-type) card-ids])
                          active-only?            (conj (active-only-where metadata-type include-sensitive?))
                          metric?                 (conj [:= :type "metric"])
                          (and metric? table-ids) (conj [:= :source_card_id nil]))]
    (reduce sql.helpers/where {} where-clauses)))

(mu/defn tables
  "The `:metadata/table` rows for `database-id` picked out by `metadata-spec`."
  [database-id   :- ::lib.schema.id/database
   metadata-spec :- ::lib.metadata.protocols/metadata-spec]
  (t2/select :metadata/table (metadata-where :metadata/table database-id metadata-spec)))

(mu/defn columns
  "The `:metadata/column` rows for `database-id` picked out by `metadata-spec`."
  [database-id   :- ::lib.schema.id/database
   metadata-spec :- ::lib.metadata.protocols/metadata-spec]
  (t2/select :metadata/column (metadata-where :metadata/column database-id metadata-spec)))

(mu/defn cards
  "The `:metadata/card` rows for `database-id` picked out by `metadata-spec`."
  [database-id   :- ::lib.schema.id/database
   metadata-spec :- ::lib.metadata.protocols/metadata-spec]
  (t2/select :metadata/card (metadata-where :metadata/card database-id metadata-spec)))

(mu/defn metrics
  "The `:metadata/metric` rows for `database-id` picked out by `metadata-spec`."
  [database-id   :- ::lib.schema.id/database
   metadata-spec :- ::lib.metadata.protocols/metadata-spec]
  (t2/select :metadata/metric (metadata-where :metadata/metric database-id metadata-spec)))

(mu/defn segments
  "The `:metadata/segment` rows for `database-id` picked out by `metadata-spec`."
  [database-id   :- ::lib.schema.id/database
   metadata-spec :- ::lib.metadata.protocols/metadata-spec]
  (t2/select :metadata/segment (metadata-where :metadata/segment database-id metadata-spec)))

(mu/defn measures
  "The `:metadata/measure` rows for `database-id` picked out by `metadata-spec`."
  [database-id   :- ::lib.schema.id/database
   metadata-spec :- ::lib.metadata.protocols/metadata-spec]
  (t2/select :metadata/measure (metadata-where :metadata/measure database-id metadata-spec)))

(mu/defn native-query-snippets
  "The `:metadata/native-query-snippet` rows picked out by `metadata-spec`."
  [database-id   :- ::lib.schema.id/database
   metadata-spec :- ::lib.metadata.protocols/metadata-spec]
  (t2/select :metadata/native-query-snippet (metadata-where :metadata/native-query-snippet database-id metadata-spec)))

(mu/defn transforms
  "The `:metadata/transform` rows picked out by `metadata-spec`."
  [database-id   :- ::lib.schema.id/database
   metadata-spec :- ::lib.metadata.protocols/metadata-spec]
  (t2/select :metadata/transform (metadata-where :metadata/transform database-id metadata-spec)))
