(ns metabase.lib.schema.join
  "Schemas for things related to joins."
  (:require
   [metabase.lib.schema.common :as common]
   [metabase.lib.schema.expression :as expression]
   [metabase.lib.schema.ref :as ref]
   [metabase.shared.util.i18n :as i18n]
   [metabase.util.malli.registry :as mr]))

;;; The Fields to include in the results *if* a top-level `:fields` clause *is not* specified. This can be either
;;; `:none`, `:all`, or a sequence of Field clauses.
;;;
;;; *  `:none`: no Fields from the joined table or nested query are included (unless indirectly included by
;;;    breakouts or other clauses). This is the default, and what is used for automatically-generated joins.
;;;
;;; *  `:all`: will include all of the Fields from the joined table or query
;;;
;;; *  a sequence of Field clauses: include only the Fields specified. Valid clauses are the same as the top-level
;;;    `:fields` clause. This should be non-empty and all elements should be distinct. The normalizer will
;;;    automatically remove duplicate fields for you, and replace empty clauses with `:none`.
;;;
;;; Driver implementations: you can ignore this clause. Relevant fields will be added to top-level `:fields` clause
;;; with appropriate aliases.
(mr/def ::fields
  [:or
   [:enum :all :none]
   ;; TODO -- Pretty sure fields are supposed to be unique, even excluding `:lib/uuid`
   [:sequential {:min 1} [:ref ::ref/ref]]])

;;; The name used to alias the joined table or query. This is usually generated automatically and generally looks
;;; like `table__via__field`. You can specify this yourself if you need to reference a joined field with a
;;; `:join-alias` in the options.
;;;
;;; Driver implementations: This is guaranteed to be present after pre-processing.
(mr/def ::alias
  [:or
   {:gen/fmap #(str % "-" (random-uuid))}
   ::common/non-blank-string])

(mr/def ::conditions
  [:sequential {:min 1} [:ref ::expression/boolean]])

;;; valid values for the optional `:strategy` key in a join. Note that these are only valid if the current Database
;;; supports that specific join type; these match 1:1 with the Database `:features`, e.g. a Database that supports
;;; left joins will support the `:left-join` feature.
;;;
;;; When `:strategy` is not specified, `:left-join` is the default strategy.
(mr/def ::strategy
  [:enum
   :left-join
   :right-join
   :inner-join
   :full-join])

(mr/def ::join
  [:map
   [:lib/type    [:= :mbql/join]]
   [:lib/options ::common/options]
   [:stages      [:ref :metabase.lib.schema/stages]]
   [:conditions  ::conditions]
   [:alias       ::alias]
   [:fields   {:optional true} ::fields]
   [:strategy {:optional true} ::strategy]])

(mr/def ::joins
  [:and
   [:sequential {:min 1} [:ref ::join]]
   [:fn
    {:error/fn (fn [& _]
                 (i18n/tru "Join aliases must be unique at a given stage of a query"))}
    (fn ensure-unique-join-aliases [joins]
      (if-let [aliases (not-empty (filter some? (map :alias joins)))]
        (apply distinct? aliases)
        true))]])
