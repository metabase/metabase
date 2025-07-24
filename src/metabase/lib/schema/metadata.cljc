(ns metabase.lib.schema.metadata
  (:require
   [clojure.string :as str]
   [medley.core :as m]
   [metabase.lib.schema.binning :as lib.schema.binning]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.lib.schema.join :as lib.schema.join]
   [metabase.lib.schema.metadata.fingerprint :as lib.schema.metadata.fingerprint]
   [metabase.lib.schema.temporal-bucketing :as lib.schema.temporal-bucketing]
   [metabase.util.malli.registry :as mr]))

(defn- kebab-cased-key? [k]
  (and (keyword? k)
       (or (contains? lib.schema.common/HORRIBLE-keys k)
           ;; apparently `str/includes?` doesn't work on keywords in ClojureScript ??
           (not (str/includes? (str k) "_")))))

(defn- kebab-cased-map? [m]
  (and (map? m)
       (every? kebab-cased-key? (keys m))))

(mr/def ::kebab-cased-map
  [:fn
   {:error/message "map with all kebab-cased keys"
    :error/fn      (fn [{:keys [value]} _]
                     (if-not (map? value)
                       "map with all kebab-cased keys"
                       (str "map with all kebab-cased keys, got: " (pr-str (remove kebab-cased-key? (keys value))))))}
   kebab-cased-map?])

;;; Column vs Field?
;;;
;;; Lately I've been using `Field` to only mean a something that lives in the application database, i.e. something
;;; that is associated with row in the `Field` table and has an `:id`. I'm using `Column` as a more generic term that
;;; includes not only `Field`s but also the columns returned by a stage of a query, e.g. `SELECT count(*) AS count`
;;; returns a `Column` called `count`, but it's not a `Field` because it's not associated with an actual Field in the
;;; application database.
;;;
;;; Column = any column returned by a query or stage of a query
;;; Field  = a Column that is associated with a capital-F Field in the application database, i.e. has an `:id`
;;;
;;; All Fields are Columns, but not all Columns are Fields.
;;;
;;; Also worth a mention: we also have `Dimension`s, associated with the `dimension` table in the application
;;; database, which can act like psuedo-Fields or affect how we treat normal Fields. For example, Dimensions are used
;;; to implement column remapping, e.g. the GUI might display values of `categories.name` when it presents filter
;;; options for `venues.category_id` -- you can remap a meaningless integer FK column to something more helpful.
;;; 'Human readable values' like these can also be entered manually from the GUI, for example for enum columns. How
;;; will this affect what MLv2 needs to know or does? Not clear at this point, but we'll probably want to abstract
;;; away dealing with Dimensions in the future so the FE QB GUI doesn't need to special case them.

(mr/def ::column.source
  "`:lib/source` -- where a column came from with respect to the current stage.

  Traditionally, `:lib/source` meant something slightly different -- it denoted what part of the current stage a
  column came from, and thus included two additional options -- `:source/fields`, for columns used by `:fields`, and
  `:source/breakouts`, for columns used in `:breakout`. This was not really useful information and made `:lib/source`
  itself useless for determining if a column was 'inherited' or not (i.e., whether it came from a previous stage,
  source card, or a join, and should get field name refs instead of field ID refs --
  see [[metabase.lib.field.util/inherited-column?]])."
  [:enum
   {:decode/normalize (fn [k]
                        (when-let [k (lib.schema.common/normalize-keyword k)]
                          ;; TODO (Cam 7/1/25) -- if we wanted, we could use `:source/breakouts` to populate
                          ;; `:lib/breakout?` -- but I think that isn't really necessary since we can
                          ;; recalculate that information anyway.
                          (when-not (#{:source/fields :source/breakouts} k)
                            k)))}
   ;; these are for things from some sort of source other than the current stage;
   ;; they must be referenced with string names rather than Field IDs
   :source/card
   :source/native
   :source/previous-stage
   ;; these are for things that were introduced by the current stage of the query; `:field` references should be
   ;; referenced with Field IDs if available.
   ;;
   ;; default columns returned by the `:source-table` for the current stage.
   :source/table-defaults
   ;; Introduced by `:aggregation`(s) IN THE CURRENT STAGE. Aggregations by definition are always returned.
   :source/aggregations
   ;; introduced by a join, not necessarily ultimately returned.
   :source/joins
   ;; Introduced by `:expressions` IN THE CURRENT STAGE; not necessarily ultimately returned.
   :source/expressions
   ;; Not even introduced, but 'visible' because this column is implicitly joinable.
   :source/implicitly-joinable])

;;; The way FieldValues/remapping works is hella confusing, because it involves the FieldValues table and Dimension
;;; table, and the `has_field_values` column, nobody knows why life is like this TBH. The docstrings
;;; in [[metabase.warehouse-schema.models.field-values]], [[metabase.parameters.chain-filter]],
;;; and [[metabase.query-processor.middleware.add-remaps]] explain this stuff in more detail, read
;;; those and then maybe you will understand what the hell is going on.

(def column-has-field-values-options
  "Possible options for column metadata `:has-field-values`. This is used to determine whether we keep FieldValues for a
  Field (during sync), and which type of widget should be used to pick values of this Field when filtering by it in
  the Query Builder. Not otherwise used by MLv2 (except for [[metabase.lib.field/field-values-search-info]], which is
  a frontend convenience) or QP at the time of this writing. For column remapping purposes in the Query Processor and
  MLv2 we just ignore `has_field_values` and only look for FieldValues/Dimension."
  ;; AUTOMATICALLY-SET VALUES, SET DURING SYNC
  ;;
  ;; `nil` -- means infer which widget to use based on logic in [[metabase.lib.field/infer-has-field-values]]; this
  ;; will either return `:search` or `:none`.
  ;;
  ;; This is the default state for Fields not marked `auto-list`. Admins cannot explicitly mark a Field as
  ;; `has_field_values` `nil`. This value is also subject to automatically change in the future if the values of a
  ;; Field change in such a way that it can now be marked `auto-list`. Fields marked `nil` do *not* have FieldValues
  ;; objects.
  ;;
  #{;; The other automatically-set option. Automatically marked as a 'List' Field based on cardinality and other factors
    ;; during sync. Store a FieldValues object; use the List Widget. If this Field goes over the distinct value
    ;; threshold in a future sync, the Field will get switched back to `has_field_values = nil`.
    ;;
    ;; Note that when this comes back from the REST API or [[metabase.lib.field/field-values-search-info]] we always
    ;; return this as `:list` instead of `:auto-list`; this is done by [[metabase.lib.field/infer-has-field-values]].
    ;; I guess this is because the FE isn't supposed to need to care about whether this is `:auto-list` vs `:list`;
    ;; those distinctions are only important for sync I guess.
    :auto-list
    ;;
    ;; EXPLICITLY-SET VALUES, SET BY AN ADMIN
    ;;
    ;; Admin explicitly marked this as a 'Search' Field, which means we should *not* keep FieldValues, and should use
    ;; Search Widget.
    :search
    ;; Admin explicitly marked this as a 'List' Field, which means we should keep FieldValues, and use the List
    ;; Widget. Unlike `auto-list`, if this Field grows past the normal cardinality constraints in the future, it will
    ;; remain `List` until explicitly marked otherwise.
    :list
    ;; Admin explicitly marked that this Field shall always have a plain-text widget, neither allowing search, nor
    ;; showing a list of possible values. FieldValues not kept.
    :none})

(mr/def ::column.has-field-values
  (into [:enum] (sort column-has-field-values-options)))

(mr/def ::column.remapping.external
  "External remapping (Dimension) for a column. From the [[metabase.warehouse-schema.models.dimension]] with `type =
  external` associated with a `Field` in the application database.
  See [[metabase.query-processor.middleware.add-remaps]] for what this means."
  [:map
   [:lib/type [:= {:decode/normalize lib.schema.common/normalize-keyword} :metadata.column.remapping/external]]
   [:id       ::lib.schema.id/dimension]
   ;; from `dimension.name`
   [:name     ::lib.schema.common/non-blank-string]
   ;; `dimension.human_readable_field_id` in the application database. ID of the Field to get human-readable values
   ;; from. e.g. if the column in question is `venues.category-id`, then this would be the ID of `categories.name`
   [:field-id ::lib.schema.id/field]])

(mr/def ::column.remapping.internal
  "Internal remapping (FieldValues) for a column. From [[metabase.warehouse-schema.models.dimension]] with `type =
  internal` and the [[metabase.warehouse-schema.models.field-values]] associated with a `Field` in the application
  database. See [[metabase.query-processor.middleware.add-remaps]] for what this means."
  [:map
   [:lib/type              [:= {:decode/normalize lib.schema.common/normalize-keyword} :metadata.column.remapping/internal]]
   [:id                    ::lib.schema.id/dimension]
   ;; from `dimension.name`
   [:name                  ::lib.schema.common/non-blank-string]
   ;; From `metabase_fieldvalues.values`. Original values
   [:values                [:sequential :any]]
   ;; From `metabase_fieldvalues.human_readable_values`. Human readable remaps for the values at the same indexes in
   ;; `:values`
   [:human-readable-values [:sequential :any]]])

(mr/def ::source-column-alias
  ::lib.schema.common/non-blank-string)

(mr/def ::desired-column-alias
  [:string {:min 1}])

(mr/def ::original-name
  "The original name of the column as it appeared in the very first place it came from (i.e., the physical name of the
  column in the table it appears in). This should be the same as the `:lib/source-column-alias` for the very first
  usage of the column.
  Allowed to be blank because some databases like SQL Server allow blank column names."
  [:maybe :string])

(mr/def ::deduplicated-name
  "The simply-deduplicated name that was historically used in QP results metadata (originally calculated by
  the [[metabase.query-processor.middleware.annotate]] middleware, now calculated
  by [[metabase.lib.middleware.result-metadata]]). This just adds suffixes to column names e.g. `ID` and `ID` become
  `ID` and `ID_2`, respectively. Kept around because many old field refs use this column name."
  [:maybe :string])

(defn- normalize-column [m]
  (when (map? m)
    (-> m
        lib.schema.common/normalize-map
        ;; sometimes column metadata from the FE has the NAME stored as the ID for hacky mystery purposes... ignore
        ;; these busted "IDs"
        (as-> m (cond-> m
                  (and (:id m) (not (pos-int? (:id m))))
                  (dissoc :id)))
        ;; remove deprecated `:ident`
        (dissoc :ident))))

(mr/def ::column.validate-expression-source
  "Only allow `:lib/expression-name` when `:lib/source` is `:source/expressions`. If it's anything else, it probably
  means it's getting incorrectly propagated from a previous stage (QUE-1342)."
  [:fn
   {:error/message ":lib/expression-name should only be set for expressions in the current stage (:lib/source = :source/expressions)"}
   (fn [m]
     (if (:lib/expression-name m)
       (= (:lib/source m) :source/expressions)
       true))])

(mr/def ::column.validate-native-column
  "Certain keys cannot possibly be set when a column comes from directly from native query results, for example
  `:lib/breakout?` or join aliases"
  (let [disallowed-keys [:metabase.lib.join/join-alias ; only things that come from a JOIN should have a join alias.
                         :lib/expression-name]]        ; if it comes from a native query then it can't come from an expression.
    [:fn
     {:error/message "Invalid column metadata for a column with :lib/source :source/native"
      :error/fn      (fn [{m :value} _]
                       (some (fn [k]
                               (when (k m)
                                 (str "Column has :lib/source :source/native but also " k "; this is impossible")))
                             disallowed-keys))}
     (fn [m]
       (if (= (:lib/source m) :source/native)
         (every? (fn [k]
                   (not (k m)))
                 disallowed-keys)
         true))]))

(mr/def ::column.validate-table-defaults-column
  "A column with :lib/source :source/table-defaults cannot possibly have a join alias."
  [:fn
   {:error/message "A column with :lib/source :source/table-defaults cannot possibly have a join alias"}
   (fn [m]
     (if (= (:lib/source m) :source/table-defaults)
       (not (:metabase.lib.join/join-alias m))
       true))])

;;; TODO (Cam 7/1/25) -- disabled for now because of bugs like QUE-1496; once that's fixed we should re-enable this.
#_(mr/def ::column.validate-join-alias
    "`:metabase.lib.join/join-alias` SHOULD ONLY be set when `:lib/source` = `:source/joins`."
    [:fn
     {:error/message "current stage join alias (:metabase.lib.join/join-alias) should only be set for columns whose :lib/source is :source/joins"}
     (fn [m]
       (if (:metabase.lib.join/join-alias m)
         (= (:lib/source m) :source/joins)
         true))])

(def column-visibility-types
  "Possible values for column `:visibility-type`."
  #{:normal       ; Default setting.  field has no visibility restrictions.
    :details-only ; For long blob like columns such as JSON.  field is not shown in some places on the frontend.
    :hidden       ; Lightweight hiding which removes field as a choice in most of the UI.  should still be returned in queries.
    :sensitive    ; Strict removal of field from all places except data model listing.  queries should error if someone attempts to access.
    :retired})    ; For fields that no longer exist in the physical db.  automatically set by Metabase.  QP should error if encountered in a query.

(mr/def ::column.visibility-type
  (into [:enum {:decode/normalize keyword}] column-visibility-types))

(mr/def ::column.legacy-source
  "Possible values for `column.source` -- this is added by [[metabase.lib.metadata.result-metadata]] for historical
  reasons (it is used in a few places in the FE). DO NOT use this in the backend for any purpose, use `:lib/source`
  instead."
  [:enum {:decode/normalize keyword} :aggregation :fields :breakout :native])

(mr/def ::column
  "Malli schema for a valid map of column metadata, which can mean one of two things:

  1. Metadata about a particular Field in the application database. This will always have an `:id`

  2. Results metadata from a column in `data.cols` and/or `data.results_metadata.columns` in a Query Processor
     response, or saved in something like `Card.result_metadata`. These *may* have an `:id`, or may not -- columns
     coming back from native queries or things like `SELECT count(*)` aren't associated with any particular `Field`
     and thus will not have an `:id`.

  Now maybe these should be two different schemas, but `:id` being there or not is the only real difference; besides
  that they are largely compatible. So they're the same for now. We can revisit this in the future if we actually want
  to differentiate between the two versions."
  [:and
   [:map
    {:error/message    "Valid column metadata"
     :decode/normalize normalize-column}
    [:lib/type  [:= {:decode/normalize lib.schema.common/normalize-keyword, :default :metadata/column} :metadata/column]]
    ;;
    ;; TODO (Cam 6/19/25) -- change all these comments to proper `:description`s like we have
    ;; in [[metabase.legacy-mbql.schema]] so we can generate this documentation from this schema or whatever.
    ;;
    ;; column names are allowed to be empty strings in SQL Server :/
    ;;
    ;; In almost EVERY circumstance you should try to avoid using `:name`, because it's not well-defined whether it's
    ;; the `:lib/original-name` or `:lib/deduplicated-name`, and it might be either one depending on where the metadata
    ;; came from. Prefer one of the other name keys instead, only falling back to `:name` if they are not present.
    [:name      :string]
    ;; TODO -- ignore `base_type` and make `effective_type` required; see #29707
    [:base-type ::lib.schema.common/base-type]
    ;; This is nillable because internal remap columns have `:id nil`.
    [:id             {:optional true} [:maybe ::lib.schema.id/field]]
    [:display-name   {:optional true} [:maybe :string]]
    [:effective-type {:optional true} [:maybe ::lib.schema.common/base-type]]
    [:semantic-type  {:optional true} [:maybe ::lib.schema.common/semantic-or-relation-type]]
    ;; type of this column in the data warehouse, e.g. `TEXT` or `INTEGER`
    [:database-type  {:optional true} [:maybe :string]]
    [:active         {:optional true} :boolean]
    [:visibility-type {:optional true} [:maybe ::column.visibility-type]]
    ;; if this is a field from another table (implicit join), this is the field in the current table that should be
    ;; used to perform the implicit join. e.g. if current table is `VENUES` and this field is `CATEGORIES.ID`, then the
    ;; `fk_field_id` would be `VENUES.CATEGORY_ID`. In a `:field` reference this is saved in the options map as
    ;; `:source-field`.
    [:fk-field-id {:optional true} [:maybe ::lib.schema.id/field]]
    ;; if this is a field from another table (implicit join), this is the name of the source field. It can be either a
    ;; `:lib/desired-column-alias` or `:name`, depending on the `:lib/source`. It's set only when the field can be
    ;; referenced by a name, normally when it's coming from a card or a previous query stage.
    [:fk-field-name {:optional true} [:maybe ::lib.schema.common/non-blank-string]]
    ;; if this is a field from another table (implicit join), this is the join alias of the source field.
    [:fk-join-alias {:optional true} [:maybe ::lib.schema.common/non-blank-string]]
    ;; `metabase_field.fk_target_field_id` in the application database; recorded during the sync process. This Field is
    ;; an foreign key, and points to this Field ID. This is mostly used to determine how to add implicit joins by
    ;; the [[metabase.query-processor.middleware.add-implicit-joins]] middleware.
    [:fk-target-field-id {:optional true} [:maybe ::lib.schema.id/field]]
    ;;
    ;; Join alias of the table we're joining against, if any. Not really 100% clear why we would need this on top
    ;; of [[metabase.lib.join/current-join-alias]], which stores the same info under a namespaced key. I think we can
    ;; remove it.
    ;;
    ;; TODO (Cam 6/19/25) -- yes, we should remove this key, I've tried to do so but a few places are still
    ;; setting (AND USING!) it. It actually appears that this gets propagated beyond the current stage where the join
    ;; has happened and has thus taken on a purposes as a 'previous stage join alias' column. We should use
    ;; `:lib/original-join-alias` instead to serve this purpose since `:source-alias` is not set or used correctly.
    ;; Check out experimental https://github.com/metabase/metabase/pull/59772 where I updated this schema to 'ban'
    ;; this key so we can root out anywhere trying to use it. (QUE-1403)
    [:source-alias {:optional true} [:maybe ::lib.schema.common/non-blank-string]]
    ;; Join alias of the table we're joining against, if any. SHOULD ONLY BE SET IF THE JOIN HAPPENED AT THIS STAGE OF
    ;; THE QUERY! (Also ok within a join's conditions for previous joins within the parent stage, because a join is
    ;; allowed to join on the results of something else)
    ;;
    ;; TODO (Cam 6/19/25) -- rename this key to `:lib/join-alias` since we're not really good about only using the
    ;; special getter and setter functions to get at this key
    [:metabase.lib.join/join-alias {:optional true} [:maybe ::lib.schema.join/alias]]
    ;; the initial join alias used when this column was first introduced; should be propagated even if the join was
    ;; from a previous stage.
    ;;
    ;; What about when the column comes from join `X`, but inside `X` itself it comes from join `Y`? I think in this
    ;; case we want the outside world to see `X` since `Y` is not visible outside of `X`.
    ;;
    ;;    original join alias = X
    ;;    column => [join X => join Y]
    ;;
    [:lib/original-join-alias {:optional true} [:maybe ::lib.schema.join/alias]]
    ;; these should only be present if temporal bucketing or binning is done in the current stage of the query; if
    ;; this happened in a previous stage they should get propagated as the keys below instead.
    [:metabase.lib.field/temporal-unit {:optional true} [:maybe ::lib.schema.temporal-bucketing/unit]]
    [:metabase.lib.field/binning       {:optional true} [:maybe ::lib.schema.binning/binning]]
    ;;
    ;; if temporal bucketing or binning happened in the previous stage, respectively, they should get propagated as
    ;; these keys.
    [:inherited-temporal-unit {:optional true} [:maybe ::lib.schema.temporal-bucketing/unit]]
    [:lib/original-binning    {:optional true} [:maybe ::lib.schema.binning/binning]]
    ;; name of the expression where this column metadata came from. Should only be included for expressions introduced
    ;; at THIS STAGE of the query. If it's included elsewhere, that's an error. Thus this is the definitive way to know
    ;; if a column is "custom" in this stage (needs an `:expression` reference) or not.
    [:lib/expression-name {:optional true} [:maybe ::lib.schema.common/non-blank-string]]
    ;;
    ;; the name of the expression where this column came from, if the column came from a previous stage of the query
    [:lib/original-expression-name {:optional true} [:maybe ::lib.schema.common/non-blank-string]]
    ;; where this column came from. See docstring for `::column.source`.
    [:lib/source {:optional true} [:maybe [:ref ::column.source]]]
    ;;
    ;; whether this column metadata occurs in the `:breakout`(s) in the CURRENT STAGE or not. Previously this was
    ;; signified by `:lib/source = :source/breakouts` (which has been removed)
    ;;
    ;; this SHOULD NOT get propagated to subsequent stages!
    [:lib/breakout? {:optional true} [:maybe :boolean]]

    ;; ID of the Card this came from, if this came from Card results metadata. Mostly used for creating column groups.
    [:lib/card-id {:optional true} [:maybe ::lib.schema.id/card]]
    ;;
    ;; this stuff is adapted from [[metabase.query-processor.util.add-alias-info]]. It is included in
    ;; the [[metabase.lib.metadata.calculation/metadata]]
    ;;
    ;; the alias that should be used to this clause on the LHS of a `SELECT <lhs> AS <rhs>` or equivalent, i.e. the
    ;; name of this clause as exported by the previous stage, source table, or join.
    [:lib/source-column-alias {:optional true} [:maybe ::source-column-alias]]
    ;; the name we should export this column as, i.e. the RHS of a `SELECT <lhs> AS <rhs>` or equivalent. This is
    ;; guaranteed to be unique in each stage of the query.
    [:lib/desired-column-alias {:optional true} [:maybe ::desired-column-alias]]
    ;;
    ;; see description in schemas above
    ;;
    [:lib/original-name     {:optional true} ::original-name]
    [:lib/deduplicated-name {:optional true} ::deduplicated-name]
    ;; appears to serve the same purpose as `:lib/original-name` but it's unclear where or why it is
    ;; used. https://metaboat.slack.com/archives/C0645JP1W81/p1749168183509589
    ;;
    ;; TODO (Cam 6/19/25) -- can we remove this entirely?
    [:lib/hack-original-name {:optional true} ::original-name]
    ;;
    ;; the original display name of this column before adding join/temporal bucketing/binning stuff to it. `Join ->
    ;; <whatever>` or `<whatever>: Month` or `<whatever>: Auto-binned`. Should be equal to the very first
    ;; `:display-name` we see when the column comes out of a metadata provider. Usually this is auto-generated with
    ;; humanized names from `:name`, but may differ.
    ;;
    ;; TODO (Cam 6/23/25) -- not super clear if `:lib/original-display-name` and `:lib/model-display-name` should be
    ;; equal or not if a column comes from a model. I think the answer should be YES, but I broke a bunch of stuff
    ;; when I tried to make that change.
    [:lib/original-display-name {:optional true} [:maybe :string]]
    ;;
    ;; If this column came from a Model, the (possibly user-edited) display name for this column in the model.
    ;; Generally model display names should override everything else (including the original display name) except for
    ;; `:lib/ref-display-name`.
    [:lib/model-display-name {:optional true} [:maybe :string]]
    ;;
    ;; If this metadata was resolved from a ref (e.g. a `:field` ref) that contained a `:display-name` in the options,
    ;; this is that display name. `:lib/ref-display-name` should override any display names specified in the metadata.
    [:lib/ref-display-name {:optional true} [:maybe :string]]
    ;;
    ;; when column metadata is returned by certain things
    ;; like [[metabase.lib.aggregation/selected-aggregation-operators]] or [[metabase.lib.field/fieldable-columns]], it
    ;; might include this key, which tells you whether or not that column is currently selected or not already, e.g.
    ;; for [[metabase.lib.field/fieldable-columns]] it means its already present in `:fields`
    [:selected? {:optional true} :boolean]
    ;;
    ;; REMAPPING & FIELD VALUES
    ;;
    ;; See notes above for more info. `:has-field-values` comes from the application database and is used to decide
    ;; whether to sync FieldValues when running sync, and what certain FE QB widgets should
    ;; do. (See [[metabase.lib.field/field-values-search-info]]). Note that all metadata providers may not return this
    ;; column. The JVM provider currently does not, since the QP doesn't need it for anything.
    [:has-field-values {:optional true} [:maybe [:ref ::column.has-field-values]]]
    ;;
    [:fingerprint {:optional true} [:maybe [:ref ::lib.schema.metadata.fingerprint/fingerprint]]]
    ;;
    ;; Added by [[metabase.lib.metadata.result-metadata]] primarily for legacy/backward-compatibility purposes with
    ;; legacy viz settings. This should not be used for anything other than that.
    [:field-ref {:optional true} [:maybe [:ref :metabase.legacy-mbql.schema/Reference]]]
    ;;
    [:source {:optional true} [:maybe [:ref ::column.legacy-source]]]
    ;;
    ;; these next two keys are derived by looking at `FieldValues` and `Dimension` instances associated with a `Field`;
    ;; they are used by the Query Processor to add column remappings to query results. To see how this maps to stuff in
    ;; the application database, look at the implementation for fetching a `:metadata/column`
    ;; in [[metabase.lib-be.metadata.jvm]]. I don't think this is really needed on the FE, at any rate the JS metadata
    ;; provider doesn't add these keys.
    [:lib/external-remap {:optional true} [:maybe [:ref ::column.remapping.external]]]
    [:lib/internal-remap {:optional true} [:maybe [:ref ::column.remapping.internal]]]]
   ;; TODO (Cam 6/13/25) -- go add this to some of the other metadata schemas as well.
   ::kebab-cased-map
   ::column.validate-expression-source
   ::column.validate-native-column
   ::column.validate-table-defaults-column
   #_::column.validate-join-alias])

(mr/def ::persisted-info.definition
  "Definition spec for a cached table."
  [:map
   [:table-name        ::lib.schema.common/non-blank-string]
   [:field-definitions [:maybe [:sequential
                                [:map
                                 [:field-name ::lib.schema.common/non-blank-string]
                                 ;; TODO check (isa? :type/Integer :type/*)
                                 [:base-type  ::lib.schema.common/base-type]]]]]])

(mr/def ::persisted-info
  "Persisted Info = Cached Table (?). See [[metabase.model-persistence.models.persisted-info]]"
  [:map
   [:active     :boolean]
   [:state      ::lib.schema.common/non-blank-string]
   [:table-name ::lib.schema.common/non-blank-string]
   [:definition {:optional true} [:maybe [:ref ::persisted-info.definition]]]
   [:query-hash {:optional true} [:maybe ::lib.schema.common/non-blank-string]]])

(mr/def ::card.type
  [:enum
   :question
   :model
   :metric])

(mr/def ::type
  "TODO -- not convinced we need a separate `:metadata/metric` anymore, it made sense back when Legacy/V1 Metrics were a
  separate table in the app DB, but now that they're a subtype of Card it's probably not important anymore, we can
  probably just use `:metadata/card` here."
  [:enum :metadata/database :metadata/table :metadata/column :metadata/card :metadata/metric
   :metadata/segment])

(mr/def ::lib-or-legacy-column
  "Schema for the maps in card `:result-metadata` and similar. These can be either
  `:metabase.lib.schema.metadata/result-metadata` (i.e., kebab-cased) maps, or map snake_cased as returned by QP
  metadata, but they should NOT be a mixture of both -- if we mixed them somehow there is a bug in our code."
  [:multi
   {:dispatch (fn [col]
                ;; if this has `:lib/type` we know FOR SURE that it's lib-style metadata; but we should also be able
                ;; to infer this fact automatically if it's using `kebab-case` keys. `:base-type` is required for both
                ;; styles so look at that.
                (let [col (lib.schema.common/normalize-map-no-kebab-case col)]
                  (if ((some-fn :lib/type :base-type) col)
                    :lib
                    :legacy)))}
   [:lib
    [:merge
     [:ref ::column]
     [:map
      {:error/message "If a Card result metadata column has :lib/type it MUST be a valid kebab-cased :metabase.lib.schema.metadata/column"}]]]
   [:legacy
    [:ref :metabase.legacy-mbql.schema/legacy-column-metadata]]])

(defn- normalize-card-query [query]
  (when query
    (let [query (lib.schema.common/normalize-map query)]
      ;; we will do more normalization/conversion later.
      (-> query
          (m/update-existing :type keyword)
          (m/update-existing :lib/type keyword)))))

(mr/def ::card.query
  "Saved query. This is possibly still a legacy query, but should already be normalized.
  Call [[metabase.lib.convert/->pMBQL]] on it as needed."
  [:map
   {:decode/normalize normalize-card-query}])

(defn- normalize-card [card]
  (when card
    (let [card (lib.schema.common/normalize-map card)]
      (cond-> card
        (and (not (:database-id card))
             (pos-int? (get-in card [:dataset-query :database])))
        (assoc :database-id (get-in card [:dataset-query :database]))))))

(defn- mock-card
  "Mock coercer for use with the [[metabase.lib.test-util/mock-metadata-provider]]. Add a default name to the Card if
  one was not specified."
  [card]
  (cond-> card
    (and (not (:name card))
         (:id card))
    (assoc :name (str "Card " (:id card)))))

(mr/def ::card
  "Schema for metadata about a specific Saved Question (which may or may not be a Model). More or less the same as
  a [[metabase.queries.models.card]], but with kebab-case keys. Note that the `:dataset-query` is not necessarily
  converted to pMBQL yet. Probably safe to assume it is normalized however. Likewise, `:result-metadata` is probably
  not quite massaged into a sequence of [[::column]] metadata just yet.

  See [[metabase.lib.card/card-metadata-columns]] that converts these as needed."
  [:map
   {:decode/normalize normalize-card
    :decode/mock      mock-card
    :error/message    "Valid Card metadata"}
   [:lib/type    [:= :metadata/card]]
   [:id          ::lib.schema.id/card]
   [:name        ::lib.schema.common/non-blank-string]
   [:database-id ::lib.schema.id/database]
   [:dataset-query   {:optional true} ::card.query]
   ;; vector of column metadata maps; these are ALMOST the correct shape to be [[ColumnMetadata]], but they're
   ;; probably missing `:lib/type` and probably using `:snake_case` keys.
   [:result-metadata {:optional true} [:maybe [:sequential ::lib-or-legacy-column]]]
   ;; what sort of saved query this is, e.g. a normal Saved Question or a Model or a V2 Metric.
   [:type            {:optional true} [:maybe [:ref ::card.type]]]
   ;; Table ID is nullable in the application database, because native queries are not necessarily associated with a
   ;; particular Table (unless they are against MongoDB)... for MBQL queries it should be populated however.
   [:table-id        {:optional true} [:maybe ::lib.schema.id/table]]
   ;;
   ;; PERSISTED INFO: This comes from the [[metabase.model-persistence.models.persisted-info]] model.
   ;;
   [:lib/persisted-info {:optional true} [:maybe [:ref ::persisted-info]]]])

(mr/def ::segment
  "More or less the same as a [[metabase.segments.models.segment]], but with kebab-case keys."
  [:map
   {:error/message "Valid Segment metadata"}
   [:lib/type   [:= :metadata/segment]]
   [:id         ::lib.schema.id/segment]
   [:name       ::lib.schema.common/non-blank-string]
   [:table-id   ::lib.schema.id/table]
   ;; the MBQL snippet defining this Segment; this may still be in legacy
   ;; format. [[metabase.lib.segment/segment-definition]] handles conversion to pMBQL if needed.
   [:definition [:maybe :map]]
   [:description {:optional true} [:maybe ::lib.schema.common/non-blank-string]]])

(mr/def ::metric
  "A V2 Metric! This a special subtype of a Card. Not convinced we really need this as opposed to just using `::card` --
  see my notes on `::type`."
  [:merge
   ::card
   [:map
    [:lib/type [:= :metadata/metric]]
    [:type     [:= :metric]]
    [:metabase.lib.join/join-alias {:optional true} ::lib.schema.common/non-blank-string]]])

(mr/def ::table
  "Schema for metadata about a specific [[metabase.warehouse-schema.models.table]]. More or less the same but with
  kebab-case keys."
  [:map
   {:error/message "Valid Table metadata"}
   [:lib/type [:= :metadata/table]]
   [:id       ::lib.schema.id/table]
   [:name     ::lib.schema.common/non-blank-string]
   [:display-name {:optional true} [:maybe ::lib.schema.common/non-blank-string]]
   [:schema       {:optional true} [:maybe ::lib.schema.common/non-blank-string]]])

(mr/def ::database
  "Malli schema for the DatabaseMetadata as returned by `GET /api/database/:id/metadata` -- what should be available to
  the frontend Query Builder."
  [:map
   {:error/message "Valid Database metadata"}
   [:lib/type [:= :metadata/database]]
   [:id ::lib.schema.id/database]
   ;; TODO -- this should validate against the driver features list in [[metabase.driver/features]] if we're in
   ;; Clj mode
   [:dbms-version    {:optional true} [:maybe :map]]
   [:details         {:optional true} :map]
   [:engine          {:optional true} :keyword]
   [:features        {:optional true} [:set :keyword]]
   [:is-audit        {:optional true} :boolean]
   [:is-attached-dwh {:optional true} :boolean]
   [:settings        {:optional true} [:maybe :map]]])

(mr/def ::metadata-provider
  "Schema for something that satisfies the [[metabase.lib.metadata.protocols/MetadataProvider]] protocol."
  [:ref :metabase.lib.metadata.protocols/metadata-provider])

(mr/def ::metadata-providerable
  "Something that can be used to get a MetadataProvider. Either a MetadataProvider, or a map with a MetadataProvider in
  the key `:lib/metadata` (i.e., a query)."
  [:ref :metabase.lib.metadata.protocols/metadata-providerable])

(mr/def ::stage
  "Metadata about the columns returned by a particular stage of a pMBQL query. For example a single-stage native query
  like

    {:database 1
     :lib/type :mbql/query
     :stages   [{:lib/type :mbql.stage/mbql
                 :native   \"SELECT id, name FROM VENUES;\"}]}

  might have stage metadata like

    {:columns [{:name \"id\", :base-type :type/Integer}
               {:name \"name\", :base-type :type/Text}]}

  associated with the query's lone stage.

  At some point in the near future we will hopefully attach this metadata directly to each stage in a query, so a
  multi-stage query will have `:lib/stage-metadata` for each stage. The main goal is to facilitate things like
  returning lists of visible or filterable columns for a given stage of a query. This is TBD, see #28717 for a WIP
  implementation of this idea.

  This is the same format as the results metadata returned with QP results in `data.results_metadata`. The `:columns`
  portion of this (`data.results_metadata.columns`) is also saved as `Card.result_metadata` for Saved Questions.

  Note that queries currently actually come back with both `data.results_metadata` AND `data.cols`; it looks like the
  Frontend actually *merges* these together -- see `applyMetadataDiff` in
  `frontend/src/metabase/query_builder/selectors.js` -- but this is ridiculous. Let's try to merge anything missing in
  `results_metadata` into `cols` going forward so things don't need to be manually merged in the future."
  [:map
   {:decode/normalize lib.schema.common/normalize-map}
   [:lib/type [:= {:default :metadata/results} :metadata/results]]
   [:columns [:sequential ::column]]])
