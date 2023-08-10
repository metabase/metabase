(ns metabase.lib.join.metadata
  (:require
   [metabase.lib.card :as lib.card]
   [metabase.lib.equality :as lib.equality]
   [metabase.lib.join.alias :as lib.join.alias]
   [metabase.lib.join.common :as lib.join.common]
   [metabase.lib.join.conditions :as lib.join.conditions]
   [metabase.lib.join.fields :as lib.join.fields]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.metadata.calculation :as lib.metadata.calculation]
   [metabase.lib.options :as lib.options]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.lib.util :as lib.util]
   [metabase.shared.util.i18n :as i18n]
   [metabase.util :as u]
   [metabase.util.malli :as mu]))

(defmethod lib.metadata.calculation/display-name-method :mbql/join
  [query _stage-number {[{:keys [source-table source-card], :as _first-stage}] :stages, :as _join} _style]
  (or
   (when source-table
     (:display-name (lib.metadata/table query source-table)))
   (when source-card
     (lib.card/fallback-display-name source-card))
   (i18n/tru "Native Query")))

(defmethod lib.metadata.calculation/display-info-method :mbql/join
  [query stage-number join]
  (let [display-name (lib.metadata.calculation/display-name query stage-number join)]
    {:name (or (:alias join) display-name), :display-name display-name}))

(defmethod lib.metadata.calculation/metadata-method :mbql/join
  [_query _stage-number _query]
  ;; not i18n'ed because this shouldn't be developer-facing.
  (throw (ex-info "You can't calculate a metadata map for a join! Use lib.metadata.calculation/returned-columns-method instead."
                  {})))

(mu/defn ^:private column-from-join-fields :- lib.metadata.calculation/ColumnMetadataWithSource
  "For a column that comes from a join `:fields` list, add or update metadata as needed, e.g. include join name in the
  display name."
  [query           :- ::lib.schema/query
   stage-number    :- :int
   column-metadata :- lib.metadata/ColumnMetadata
   join-alias      :- ::lib.schema.common/non-blank-string]
  (let [column-metadata (assoc column-metadata :source-alias join-alias)
        col             (-> (assoc column-metadata
                                   :display-name (lib.metadata.calculation/display-name query stage-number column-metadata)
                                   :lib/source   :source/joins)
                            (lib.join.alias/with-join-alias join-alias))]
    (assert (= (lib.join.alias/current-join-alias col) join-alias))
    col))

(defmethod lib.metadata.calculation/display-name-method :option/join.strategy
  [_query _stage-number {:keys [strategy]} _style]
  (case strategy
    :left-join  (i18n/tru "Left outer join")
    :right-join (i18n/tru "Right outer join")
    :inner-join (i18n/tru "Inner join")
    :full-join  (i18n/tru "Full outer join")))

(defmethod lib.metadata.calculation/display-info-method :option/join.strategy
  [query stage-number {:keys [strategy default], :as option}]
  (cond-> {:short-name   (u/qualified-name strategy)
           :display-name (lib.metadata.calculation/display-name query stage-number option)}
    default (assoc :default true)))

(mu/defn ^:private add-source-and-desired-aliases :- [:map
                                                      [:lib/source-column-alias  ::lib.schema.common/non-blank-string]
                                                      [:lib/desired-column-alias ::lib.schema.common/non-blank-string]]
  "Add `:lib/source-column-alias` and `:lib/desired-column-alias` to column metadata. For metadata calculation."
  [join           :- [:map
                      [:alias
                       {:error/message "Join must have an alias to determine column aliases!"}
                       ::lib.schema.common/non-blank-string]]
   unique-name-fn :- fn?
   col            :- :map]
  (assoc col
         :lib/source-column-alias  ((some-fn :lib/source-column-alias :name) col)
         :lib/desired-column-alias (unique-name-fn (lib.join.alias/joined-field-desired-alias
                                                    (:alias join)
                                                    ((some-fn :lib/source-column-alias :name) col)))))

(defmethod lib.metadata.calculation/returned-columns-method :mbql/join
  [query
   stage-number
   {:keys [fields stages], join-alias :alias, :or {fields :none}, :as join}
   {:keys [unique-name-fn], :as options}]
  (when-not (= fields :none)
    (let [ensure-previous-stages-have-metadata (resolve 'metabase.lib.stage/ensure-previous-stages-have-metadata)
          join-query (cond-> (assoc query :stages stages)
                       ensure-previous-stages-have-metadata
                       (ensure-previous-stages-have-metadata -1))
          field-metadatas (if (= fields :all)
                            (lib.metadata.calculation/returned-columns join-query -1 (peek stages) options)
                            (for [field-ref fields
                                  :let [join-field (lib.options/update-options field-ref dissoc :join-alias)]]
                              (lib.metadata.calculation/metadata join-query -1 join-field)))]
      (mapv (fn [field-metadata]
              (->> (column-from-join-fields query stage-number field-metadata join-alias)
                   (add-source-and-desired-aliases join unique-name-fn)))
            field-metadatas))))

(defmethod lib.metadata.calculation/visible-columns-method :mbql/join
  [query stage-number join options]
  (lib.metadata.calculation/returned-columns query stage-number (assoc join :fields :all) options))

(mu/defn all-joins-visible-columns :- lib.metadata.calculation/ColumnsWithUniqueAliases
  "Convenience for calling [[lib.metadata.calculation/visible-columns]] on all of the joins in a query stage."
  [query          :- ::lib.schema/query
   stage-number   :- :int
   unique-name-fn :- fn?]
  (into []
        (mapcat (fn [join]
                  (lib.metadata.calculation/visible-columns query
                                                            stage-number
                                                            join
                                                            {:unique-name-fn               unique-name-fn
                                                             :include-implicitly-joinable? false})))
        (:joins (lib.util/query-stage query stage-number))))

(mu/defn all-joins-expected-columns :- lib.metadata.calculation/ColumnsWithUniqueAliases
  "Convenience for calling [[lib.metadata.calculation/returned-columns-method]] on all the joins in a query stage."
  [query        :- ::lib.schema/query
   stage-number :- :int
   options      :- lib.metadata.calculation/ReturnedColumnsOptions]
  (into []
        (mapcat (fn [join]
                  (lib.metadata.calculation/returned-columns query stage-number join options)))
        (:joins (lib.util/query-stage query stage-number))))

(defn- add-join-alias-to-joinable-columns [cols a-join]
  (let [join-alias     (lib.join.alias/current-join-alias a-join)
        unique-name-fn (lib.util/unique-name-generator)]
    (mapv (fn [col]
            (as-> col col
              (lib.join.alias/with-join-alias col join-alias)
              (add-source-and-desired-aliases a-join unique-name-fn col)))
          cols)))

(defn- mark-selected-joinable-columns
  "Mark the column metadatas in `cols` as `:selected` if they appear in `a-join`'s `:fields`."
  [cols a-join]
  (let [j-fields (lib.join.fields/join-fields a-join)]
    (case j-fields
      :all        (mapv #(assoc % :selected? true)
                        cols)
      (:none nil) (mapv #(assoc % :selected? false)
                        cols)
      (lib.equality/mark-selected-columns cols j-fields))))

(mu/defn joinable-columns :- [:sequential lib.metadata/ColumnMetadata]
  "Return information about the fields that you can pass to [[with-join-fields]] when constructing a join against
  something [[Joinable]] (i.e., a Table or Card) or manipulating an existing join. When passing in a join, currently
  selected columns (those in the join's `:fields`) will include `:selected true` information."
  [query            :- ::lib.schema/query
   stage-number     :- :int
   join-or-joinable :- lib.join.common/JoinOrJoinable]
  (let [a-join   (when (lib.join.common/join? join-or-joinable)
                   join-or-joinable)
        source (if a-join
                 (lib.join.common/joined-thing query join-or-joinable)
                 join-or-joinable)
        cols   (lib.metadata.calculation/returned-columns query stage-number source)]
    (cond-> cols
      a-join (add-join-alias-to-joinable-columns a-join)
      a-join (mark-selected-joinable-columns a-join))))


(defn- join-lhs-display-name-from-condition-lhs
  [query stage-number join-or-joinable condition-lhs-column-or-nil]
  (when-let [condition-lhs-column (or condition-lhs-column-or-nil
                                      (when (lib.join.common/join? join-or-joinable)
                                        (lib.join.conditions/standard-join-condition-lhs (first (lib.join.conditions/join-conditions join-or-joinable)))))]
    (let [display-info (lib.metadata.calculation/display-info query stage-number condition-lhs-column)]
      (get-in display-info [:table :display-name]))))

(defn- first-join?
  "Whether a `join-or-joinable` is (or will be) the first join in a stage of a query.

  If a join is passed, we need to check whether it's the first join in the first stage of a source-table query or
  not.

  New joins get appended after any existing ones, so it would be safe to assume that if there are any other joins in
  the current stage, this **will not** be the first join in the stage."
  [query stage-number join-or-joinable]
  (let [existing-joins (lib.join.common/joins query stage-number)]
    (or
     ;; if there are no existing joins, then this will be the first join regardless of what is passed in.
     (empty? existing-joins)
     ;; otherwise there ARE existing joins, so this is only the first join if it is the same thing as the first join
     ;; in `existing-joins`.
     (when (lib.join.common/join? join-or-joinable)
       (= (:alias join-or-joinable)
          (:alias (first existing-joins)))))))

(defn- join-lhs-display-name-for-first-join-in-first-stage
  [query stage-number join-or-joinable]
  (when (and (zero? (lib.util/canonical-stage-index query stage-number)) ; first stage?
             (first-join? query stage-number join-or-joinable)           ; first join?
             (lib.util/source-table-id query))                           ; query ultimately uses source Table?
    (let [table-id (lib.util/source-table-id query)
          table    (lib.metadata/table query table-id)]
      ;; I think `:default` display name style is okay here, there shouldn't be a difference between `:default` and
      ;; `:long` for a Table anyway
      (lib.metadata.calculation/display-name query stage-number table))))

(mu/defn join-lhs-display-name :- ::lib.schema.common/non-blank-string
  "Get the display name for whatever we are joining. See #32015 and #32764 for screenshot examples.

  The rules, copied from MLv1, are as follows:

  1. If we have the LHS column for the first join condition, we should use display name for wherever it comes from. E.g.
     if the join is

     ```
     JOIN whatever ON orders.whatever_id = whatever.id
     ```

     then we should display the join like this:

    ```
    +--------+   +----------+    +-------------+    +----------+
    | Orders | + | Whatever | on | Orders      | =  | Whatever |
    |        |   |          |    | Whatever ID |    | ID       |
    +--------+   +----------+    +-------------+    +----------+
    ```

    1a. If `join-or-joinable` is a join, we can take the condition LHS column from the join itself, since a join will
        always have a condition. This should only apply to [[standard-join-condition?]] conditions.

    1b. When building a join, you can optionally pass in `condition-lhs-column-or-nil` yourself.

  2. If the condition LHS column is unknown, and this is the first join in the first stage of a query, and the query
     uses a `:source-table`, then use the display name for the source Table.

  3. Otherwise use `Previous results`.

  This function needs to be usable while we are in the process of constructing a join in the context of a given stage,
  but also needs to work for rendering existing joins. Pass a join in for existing joins, or something [[Joinable]]
  for ones we are currently building."
  ([query join-or-joinable]
   (join-lhs-display-name query join-or-joinable nil))

  ([query join-or-joinable condition-lhs-column-or-nil]
   (join-lhs-display-name query -1 join-or-joinable condition-lhs-column-or-nil))

  ([query                       :- ::lib.schema/query
    stage-number                :- :int
    join-or-joinable            :- [:maybe lib.join.common/JoinOrJoinable]
    condition-lhs-column-or-nil :- [:maybe [:or lib.metadata/ColumnMetadata :mbql.clause/field]]]
   (or
    (join-lhs-display-name-from-condition-lhs query stage-number join-or-joinable condition-lhs-column-or-nil)
    (join-lhs-display-name-for-first-join-in-first-stage query stage-number join-or-joinable)
    (i18n/tru "Previous results"))))
