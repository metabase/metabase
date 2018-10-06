(ns metabase.query-processor.middleware.wrap-value-literals
  (:require [metabase.mbql
             [schema :as mbql.s]
             [util :as mbql.u]]
            [metabase.models.field :refer [Field]]
            [metabase.query-processor.store :as qp.store]
            [metabase.util.date :as du]
            [schema.core :as s]
            [metabase.util :as u]))

;;; --------------------------------------------------- Type Info ----------------------------------------------------

(defmulti ^:private ^{:doc (str "Get information about database, base, and special types for an object. This is passed "
                                "to along to various `->honeysql` method implementations so drivers have the "
                                "information they need to handle raw values like Strings, which may need to be parsed "
                                "as a certain type.")}
  type-info
  mbql.u/dispatch-by-clause-name-or-class)

(defmethod type-info :default [_] nil)

(defmethod type-info (class Field) [this]
  (select-keys this [:base_type :special_type :database_type]))

(defmethod type-info :field-id [[_ field-id]]
  (type-info (qp.store/field field-id)))

(defmethod type-info :fk-> [[_ _ dest-field]]
  (type-info dest-field))

(defmethod type-info :datetime-field [[_ field unit]]
  (assoc (type-info field) :unit unit))


;;; ------------------------------------------------- add-type-info --------------------------------------------------

(defmulti ^:private add-type-info (fn [x info {:keys [parse-datetime-strings?]}]
                                    (if (mbql.u/mbql-clause? x)
                                      ::clause
                                      (class x))))

;; don't add any type info to things that are already MBQL clauses!
(defmethod add-type-info ::clause [this _ _]
  this)

(defmethod add-type-info nil [_ info _]
  [:value nil info])

(defmethod add-type-info Object [this info _]
  [:value this info])

(defmethod add-type-info java.util.Date [this info _]
  [:absolute-datetime (du/->Timestamp this) (or (:unit info) :default)])

(defmethod add-type-info java.sql.Timestamp [this info _]
  [:absolute-datetime this (or (:unit info) :default)])

(defmethod add-type-info String [this info {:keys [parse-datetime-strings?]}]
  (if (and
       (:unit info)
       (du/date-string? this)
       parse-datetime-strings?)
    [:absolute-datetime (du/->Timestamp this) (:unit info)] ; TODO - what about timezone ?!
    [:value this info]))


;;; -------------------------------------------- wrap-literals-in-clause ---------------------------------------------

(defmulti ^:private wrap-literals-in-clause mbql.u/dispatch-by-clause-name-or-class)

(defmethod wrap-literals-in-clause := [[_ field x]]
  [:= field (add-type-info x (type-info field) {:parse-datetime-strings? true})])

(defmethod wrap-literals-in-clause :!= [[_ field x]]
  [:!= field (add-type-info x (type-info field) {:parse-datetime-strings? true})])

(defmethod wrap-literals-in-clause :< [[_ field x]]
  [:< field (add-type-info x (type-info field) {:parse-datetime-strings? true})])

(defmethod wrap-literals-in-clause :> [[_ field x]]
  [:> field (add-type-info x (type-info field) {:parse-datetime-strings? true})])

(defmethod wrap-literals-in-clause :<= [[_ field x]]
  [:<= field (add-type-info x (type-info field) {:parse-datetime-strings? true})])

(defmethod wrap-literals-in-clause :>= [[_ field x]]
  [:>= field (add-type-info x (type-info field) {:parse-datetime-strings? true})])

(defmethod wrap-literals-in-clause :between [[_ field min-val max-val]]
  [:between
   field
   (add-type-info min-val (type-info field) {:parse-datetime-strings? true})
   (add-type-info max-val (type-info field) {:parse-datetime-strings? true})])

(defmethod wrap-literals-in-clause :starts-with [[_ field s options]]
  [:starts-with field (add-type-info s (type-info field) {:parse-datetime-strings? false}) options])

(defmethod wrap-literals-in-clause :ends-with [[_ field s options]]
  [:ends-with field (add-type-info s (type-info field) {:parse-datetime-strings? false}) options])

(defmethod wrap-literals-in-clause :contains [[_ field s options]]
  [:contains field (add-type-info s (type-info field) {:parse-datetime-strings? false}) options])


;;; --------------------------------------------------- middleware ---------------------------------------------------

(s/defn ^:private wrap-value-literals* :- mbql.s/Query
  [query]
  (mbql.u/replace-clauses-in query [:query :filter] #{:= :!= :< :> :<= :>= :between
                                                      :starts-with :ends-with :contains}
    wrap-literals-in-clause))

(defn wrap-value-literals [qp]
  (comp qp wrap-value-literals*))
