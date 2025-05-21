(ns metabase.lib.schema.ident
  (:require
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.types]
   [metabase.util.malli.registry :as mr]))

;; ## Idents
;; Every column gets a unique identifier. These are vectors but are **not** MBQL clauses!
;; The three root kinds of identifiers are: fields, native columns, and fresh columns.
;; - Fields from the user's DWH get idents like `[:ident/field 12]` where 12 is the `:id` of the Field.
;; - Columns from a native query combine the Card's `:id` and the column's name:
;;   `[:ident/native [:ident/card-id 123] "name_of_the_column"]`
;; - Clauses in MBQL queries that create "fresh" columns (expressions, aggregations, breakouts) get an ident containing
;;   a randomized NanoID: `[:ident/fresh "OpaqueUniqueString"]`.
;;
;; Wrapped around these three kinds of root idents are modifiers, where the last part is a possibly nested inner ident.
;; - `[:ident/join unique-identifier-for-the-join [...]]`
;; - `[:ident/model [:ident/card-id 12] inner-column-ident]`
;; - `[:ident/remapped source-ident target-ident]`

;; ### Pieces of idents
;; An inner ident string, such as the NanoID `:ident` of a join clause.
(mr/def ::ident-slug
  [:ref ::lib.schema.common/non-blank-string])

;; The identifier for a card, used in model and native idents.
(mr/def ::card-by-id
  [:tuple [:= :ident/card-id] ::lib.schema.id/card])

;; Ad hoc native queries need idents, even though they don't have a Card with an ID yet! So they use this placeholder
;; instead. It contains a randomized slug so that even if multiple ad hoc native queries are in play, their idents
;; will be distinct.
;; These are never saved to the appdb, and any ident containing this placeholder should not be saved.
(mr/def ::card-placeholder
  [:tuple [:= :ident/card-placeholder] ::ident-slug])

;; Either of the ways of uniquely identifying a card as part of an ident.
(mr/def ::card-unique-key
  [:or ::card-by-id ::card-placeholder])

;; ### Root idents
;; Fields in the user's data warehouse, which have Field IDs.
(mr/def ::field-ident
  [:tuple [:= :ident/field] ::lib.schema.id/field])

;; Randomized (or backfilled on read, for pre-existing queries) ident strings for columns that are created by a query,
;; by an expression, aggregation, or breakout.
(mr/def ::fresh-ident
  [:tuple [:= :ident/fresh] ::ident-slug])

;; Native queries return an arbitrary list of columns, about which we know little but their name and type.
;; They are uniquely identified by the card and the
(mr/def ::native-ident
  [:tuple
   [:= :ident/native]
   ::card-unique-key
   ;; Name of the field
   :string])

;; ### Idents for joins
;; Joined columns are distinct from those of other joins with the same source, and from the same source as the primary
;; source of the stage.

;; Newly created explicit join clauses get a random NanoID string to identify them, saved to the join clause as its
;; `:ident`.
(mr/def ::join-clause-random-key
  [:tuple [:= :ident/join-clause] ::ident-slug])

;; Pre-existing joins get (when read from appdb) a unique key derived from (1) the card, (2) the stage number,
;; and (3) the index in the `:joins` array.
;; That isn't stable! But when the card gets saved, these generated values will be saved forever,
;; **even if the query was edited so the indexes or stage are now "wrong"**.
;; It doesn't matter that they be reproducible or stable, just unique and permanent.
(mr/def ::join-clause-legacy-key
  [:catn
   [:ident-kind   [:= :ident/join-clause-legacy]]
   [:card         ::card-unique-key]
   [:stage-number :int]
   [:join-index   :int]])

;; Implicit joins get a key derived from the FK column used for the join.
(mr/def ::implicit-join-clause-key
  [:tuple
   [:= :ident/implicit-join-via]
   [:ref ::ident]])

;; Any kind of join clause key.
(mr/def ::join-clause-unique-key
  [:or ::join-clause-random-key ::join-clause-legacy-key ::implicit-join-clause-key])

;; A joined column's ident is a pair of the join's key and the joined column's original ident.
(mr/def ::joined-ident
  [:tuple
   [:= :ident/joined]
   ::join-clause-unique-key
   [:ref ::ident]])

;; ### Models
;; Models are treated as atomic sources, so their columns are distinct from the same underlying column as returned by
;; either a direct query on that table, or a different model.
(mr/def ::model-ident
  [:tuple
   [:= :ident/model]
   ::card-unique-key
   [:ref ::ident]])

;; ### Remapped columns
;; Remapped columns are the extra columns added to the results to provide a human-friendly label for a column that's
;; properly returned by the query. For example, if `venues.category_id` is remapped to `categories.name`, the query
;; would return `venues.category_id` with its normal ident, plus `categories.name` with a wrapped ident:
;; `[:ident/remapped ident-of-venues.category_id ident-of-categories.name]`.
(mr/def ::remapped-ident
  [:catn
   [:ident-kind   [:= :ident/remapped]]
   [:source-ident [:ref ::ident]]
   [:target-ident [:ref ::ident]]])

;; ### General idents
(mr/def ::ident
  [:multi {:dispatch first}
   ;; Three root kinds of idents.
   [:ident/field    ::field-ident]
   [:ident/fresh    ::fresh-ident]
   [:ident/native   ::native-ident]
   ;; Three kinds of nested idents.
   [:ident/joined   ::joined-ident]
   [:ident/model    ::model-ident]
   [:ident/remapped ::remapped-ident]])
