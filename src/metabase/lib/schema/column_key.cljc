(ns metabase.lib.schema.column-key
  "Unique-by-construction keys for all columns in a query. Useful for \"renaming\" approaches like turning a model into
  a transform, and updating all its (transitive) dependents to reference the transform's output table instead.

  **NOTE:** These are unique *within any column list* at all stages of a query. They are not unique across the entire
  query, so don't try to use them as keys globally. The weak link here is native columns; identifying them by a card
  ID is not possible in general, so their names can be reused in different parts of the query."
  (:require
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.util.malli.registry :as mr]))

;; Column keys are maps with `:lib/type :column/key` and one or more other namespaced keys that declare the salient
;; details of this key. Column keys are recursive! Several flavours of column keys embed other column keys.

;; It is vital that these keys be unique by construction. They mirror the path of how the column got into the query in
;; the first place: from the source table or card, an explicit or implicit join, an expression, aggregation or breakout.
;; Note that breakouts are considered distinct columns from their inputs!

;; On the other hand, these are not globally unique, only unique within any list of columns. This simplifies the logic
;; considerably! Native columns only need their own names, not the context of the card they came from or anything else.
;; As long as the column names are unique in the SQL query - and Metabase contrives that even if the user's query has
;; duplicated names in it! - any single source will have unique column names. When multiple sources come together all
;; but one will be wrapped with a join.

;; Note that stage boundaries mean nothing to a column key, though card boundaries do. Especially because model
;; overrides can be applied at the card boundary, but also because a card boundary implies a level of nesting, which
;; has an impact on aliasing and so on.

(mr/def ::by-field-id
  "Fields directly from the table are keyed by the field ID."
  [:map {:decode/normalize lib.schema.common/normalize-map}
   [:lib/type [:= :column/key]]
   [:column.field/id ::lib.schema.id/field]])

(mr/def ::explicitly-joined
  "Explicitly joined columns refer to the join clause by UUID, and embed the column's key within the join's subtree."
  [:map {:decode/normalize lib.schema.common/normalize-map}
   [:lib/type [:= :column/key]]
   [:column.joined/join-uuid [:ref ::lib.schema.common/uuid]]
   [:column.joined/inner-column [:ref ::column-key]]])

;; Implicit join: a pair of column keys, for the FK column and the target column.
;; Generally the target column is `::by-field-id`, but it doesn't have to be.
(mr/def ::implicitly-joined
  "Implicit joins are specified by the target column's key in the foreign table, *plus* the key of the FK used for
  the join.

  The target column is usually `::by-field-id` but it doesn't have to be."
  [:map {:decode/normalize lib.schema.common/normalize-map}
   [:lib/type [:= :column/key]]
   [:column.implicit/fk-column     [:ref ::column-key]]
   [:column.implicit/target-column [:ref ::column-key]]])

;; See above regarding native columns and unique names.
(mr/def ::native
  "Native columns coming straight from SQL or a Mongo query are identified only by their (unique) column name.

  Note that Metabase contrives to give all the columns unique names in the metadata, even if the SQL query itself has
  duplicated names. This is a possible source of dangling or sneakily-changed references if the user edits the native
  query, but there's no way around that.

  Note that these names might not be unique across the entirety of a complex query, but they don't need to be. They're
  unique within any given stage, since whenever multiple sources come together all but one is wrapped in a join. So
  these still serve the purpose of being unique keys within a stage.

  **DO NOT** try to use column keys as e.g. a map key for all columns or refs across an entire query; there can be
  collisions in different parts of the query. (It's too bad, because being unique across a query would be useful!)"
  [:map {:decode/normalize lib.schema.common/normalize-map}
   [:lib/type [:= :column/key]]
   [:column.native/unique-name :string]])

(mr/def ::opaque-card
  "A leaf column key for a column coming from a `:source-card`. Cards are treated as opaque in the lib, and the columns
  are given aliases that are unique on the card. The `card-id` + `alias` pair is unique within the stage, as required
  for column keys.

  When a card's definition gets inlined, these opaque leaf keys can be replaced 1-1 with the *inner* column keys from
  the card's query."
  [:map {:decode/normalize lib.schema.common/normalize-map}
   [:lib/type [:= :column/key]]
   ;; Optional for testing - some queries are analyzed as cards without having an ID.
   [:column.card/card-id {:optional true} ::lib.schema.id/card]
   [:column.card.opaque/column-alias [:ref :metabase.lib.schema.metadata/desired-column-alias]]])

(mr/def ::expression
  "Expressions are *fresh* columns introduced on a stage; they're keyed by UUID."
  [:map {:decode/normalize lib.schema.common/normalize-map}
   [:lib/type [:= :column/key]]
   [:column.expression/uuid [:ref ::lib.schema.common/uuid]]])

(mr/def ::aggregation
  "Aggregations are *fresh* columns introduced on a stage; they're keyed by UUID."
  [:map {:decode/normalize lib.schema.common/normalize-map}
   [:lib/type [:= :column/key]]
   [:column.aggregation/uuid [:ref ::lib.schema.common/uuid]]])

(mr/def ::breakout
  "Breakouts are *fresh* columns introduced on a stage; they're keyed by UUID.


  The UUID for a breakout column is the `:lib/uuid` of the `:field` or `:expression` **ref** that appears in the
  `:breakout` list.

  It is a departure for the lib to treat breakouts as distinct from their input columns, but it matches the semantics
  of breakouts. In particular, two breakouts of the same input column with different temporal units are distinct
  columns, and the `:order-by` logic takes care to distinguish them by matching the binning and temporal units."
  [:map {:decode/normalize lib.schema.common/normalize-map}
   [:lib/type [:= :column/key]]
   [:column.breakout/uuid [:ref ::lib.schema.common/uuid]]])

(mr/def ::column-key
  "A generic column key, any one of the supported flavours of column keys."
  [:or
   {:error/message "A valid :lib/column-key"}
   ::by-field-id
   ::explicitly-joined
   ::implicitly-joined
   ::native
   ::opaque-card
   ::expression
   ::aggregation
   ::breakout])
