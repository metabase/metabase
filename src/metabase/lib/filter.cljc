(ns metabase.lib.filter
  (:refer-clojure :exclude [=])
  (:require
   [metabase.lib.dispatch :as lib.dispatch]
   [metabase.lib.field :as lib.field]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.metadata.calculation :as lib.metadata.calculation]
   [metabase.lib.options :as lib.options]
   [metabase.lib.schema]
   [metabase.lib.temporal-bucket :as lib.temporal-bucket]
   [metabase.lib.util :as lib.util]
   [metabase.shared.util.i18n :as i18n]
   [metabase.util.humanization :as u.humanization]
   [metabase.util.malli :as mu]))

(comment metabase.lib.schema/keep-me)

(defmethod lib.metadata.calculation/describe-top-level-key :filter
  [query stage-number _key]
  (when-let [filter-clause (:filter (lib.util/query-stage query stage-number))]
    (i18n/tru "Filtered by {0}" (lib.metadata.calculation/display-name query stage-number filter-clause))))

;;; Display names for filter clauses are only really used in generating descriptions for `:case` aggregations or for
;;; generating the suggested name for a query.

(defmethod lib.metadata.calculation/display-name-method :segment
  [query _stage-number [_tag _opts segment-id]]
  (or (when-let [segment-metadata (lib.metadata/segment query segment-id)]
        (:display_name segment-metadata)
        (some->> (:name segment-metadata) (u.humanization/name->human-readable-name :simple)))
      (i18n/tru "[Unknown Segment]")))

(defmethod lib.metadata.calculation/display-name-method :and
  [query stage-number [_tag _opts & subclauses]]
  (lib.util/join-strings-with-conjunction
   (i18n/tru "and")
   (for [clause subclauses]
     (lib.metadata.calculation/display-name query stage-number clause))))

(defmethod lib.metadata.calculation/display-name-method :or
  [query stage-number [_tag _opts & subclauses]]
  (lib.util/join-strings-with-conjunction
   (i18n/tru "and")
   (for [clause subclauses]
     (lib.metadata.calculation/display-name query stage-number clause))))

;;; the rest of the filter clauses should just use the display name for their first argument I guess. At least this is
;;; what MLv1 did. Don't want to think about this too much, we can change it later.

(defmethod lib.metadata.calculation/display-name-method :not
  [query stage-number [_tag _opts expr]]
  ;; TODO -- This description is sorta wack, we should use [[metabase.mbql.util/negate-filter-clause]] to negate
  ;; `expr` and then generate a description. That would require porting that stuff to pMBQL tho.
  (i18n/tru "not {0}" (lib.metadata.calculation/display-name query stage-number expr)))

;;; with > 2 args, `:=` works like SQL `IN`.
(defmethod lib.metadata.calculation/display-name-method :=
  [query stage-number [_tag _opts & exprs]]
  (let [display-names (map (partial lib.metadata.calculation/display-name query stage-number)
                           exprs)]
    (if (clojure.core/= (count exprs) 2)
      (i18n/tru "{0} equals {1}" (first display-names) (second display-names))
      (i18n/tru "{0} equals any of {1}"
                (first display-names)
                (lib.util/join-strings-with-conjunction
                 (i18n/tru "or")
                 (rest display-names))))))

;;; with > 2 args, `:!=` works like SQL `NOT IN`.
(defmethod lib.metadata.calculation/display-name-method :!=
  [query stage-number [_tag _opts & exprs]]
  (let [display-names (map (partial lib.metadata.calculation/display-name query stage-number)
                           exprs)]
    (if (clojure.core/= (count exprs) 2)
      (i18n/tru "{0} does not equal {1}" (first display-names) (second display-names))
      (i18n/tru "{0} does not equal any of {1}"
                (first display-names)
                (lib.util/join-strings-with-conjunction
                 (i18n/tru "or")
                 (rest display-names))))))

(defmethod lib.metadata.calculation/display-name-method :<
  [query stage-number [_tag _opts x y]]
  (i18n/tru "{0} is less than {1}"
            (lib.metadata.calculation/display-name query stage-number x)
            (lib.metadata.calculation/display-name query stage-number y)))

(defmethod lib.metadata.calculation/display-name-method :<=
  [query stage-number [_tag _opts x y]]
  (i18n/tru "{0} is less than or equal to {1}"
            (lib.metadata.calculation/display-name query stage-number x)
            (lib.metadata.calculation/display-name query stage-number y)))

(defmethod lib.metadata.calculation/display-name-method :>
  [query stage-number [_tag _opts x y]]
  (i18n/tru "{0} is greater than {1}"
            (lib.metadata.calculation/display-name query stage-number x)
            (lib.metadata.calculation/display-name query stage-number y)))

(defmethod lib.metadata.calculation/display-name-method :>=
  [query stage-number [_tag _opts x y]]
  (i18n/tru "{0} is greater than or equal to {1}"
            (lib.metadata.calculation/display-name query stage-number x)
            (lib.metadata.calculation/display-name query stage-number y)))

(defmethod lib.metadata.calculation/display-name-method :between
  [query stage-number [_tag _opts expr x y]]
  (i18n/tru "{0} is between {1} and {2}"
            (lib.metadata.calculation/display-name query stage-number expr)
            (lib.metadata.calculation/display-name query stage-number x)
            (lib.metadata.calculation/display-name query stage-number y)))

(defmethod lib.metadata.calculation/display-name-method :inside
  [query stage-number [_tag opts lat-expr lon-expr lat-max lon-min lat-min lon-max]]
  (lib.metadata.calculation/display-name query stage-number
                                         [:and opts
                                          [:between opts lat-expr lat-min lat-max]
                                          [:between opts lon-expr lon-min lon-max]]))

;;; for whatever reason the descriptions of for `:is-null` and `:not-null` is "is empty" and "is not empty".
(defmethod lib.metadata.calculation/display-name-method :is-null
  [query stage-number [_tag _opts expr]]
  (i18n/tru "{0} is empty" (lib.metadata.calculation/display-name query stage-number expr)))

(defmethod lib.metadata.calculation/display-name-method :not-null
  [query stage-number [_tag _opts expr]]
  (i18n/tru "{0} is not empty" (lib.metadata.calculation/display-name query stage-number expr)))

(defmethod lib.metadata.calculation/display-name-method :is-empty
  [query stage-number [_tag _opts expr]]
  (i18n/tru "{0} is empty" (lib.metadata.calculation/display-name query stage-number expr)))

(defmethod lib.metadata.calculation/display-name-method :not-empty
  [query stage-number [_tag _opts expr]]
  (i18n/tru "{0} is not empty" (lib.metadata.calculation/display-name query stage-number expr)))

(defmethod lib.metadata.calculation/display-name-method :starts-with
  [query stage-number [_tag _opts whole part]]
  (i18n/tru "{0} starts with {1}"
            (lib.metadata.calculation/display-name query stage-number whole)
            (lib.metadata.calculation/display-name query stage-number part)))

(defmethod lib.metadata.calculation/display-name-method :ends-with
  [[query stage-number [_tag _opts whole part]]]
  (i18n/tru "{0} ends with {1}"
            (lib.metadata.calculation/display-name query stage-number whole)
            (lib.metadata.calculation/display-name query stage-number part)))

(defmethod lib.metadata.calculation/display-name-method :contains
  [query stage-number [_tag _opts whole part]]
  (i18n/tru "{0} contains {1}"
            (lib.metadata.calculation/display-name query stage-number whole)
            (lib.metadata.calculation/display-name query stage-number part)))

(defmethod lib.metadata.calculation/display-name-method :does-not-contain
  [query stage-number [_tag _opts whole part]]
  (i18n/tru "{0} does not contain {1}"
            (lib.metadata.calculation/display-name query stage-number whole)
            (lib.metadata.calculation/display-name query stage-number part)))

(defmethod lib.metadata.calculation/display-name-method :time-interval
  [query stage-number [_tag _opts expr n unit]]
  (i18n/tru "{0} is within {1}"
            (lib.metadata.calculation/display-name query stage-number expr)
            (lib.temporal-bucket/interval->i18n n unit)))

(defmulti ^:private ->filter-arg
  {:arglists '([query stage-number x])}
  (fn [_query _stage-number x]
    (lib.dispatch/dispatch-value x)))

(defmethod ->filter-arg :default
  [_query _stage-number x]
  x)

(defmethod ->filter-arg :metadata/field
  [query stage-number field-metadata]
  (lib.field/field query stage-number field-metadata))

(defmethod ->filter-arg :dispatch-type/fn
  [query stage-number f]
  (->filter-arg query stage-number (f query stage-number)))

;;; TODO -- should `=` create a clause, or should we have a `=-clause` function to create the clause, and `=` creates
;;; a clause AND adds it to the query? See https://metaboat.slack.com/archives/C04DN5VRQM6/p1677527357696729 and
;;; https://metaboat.slack.com/archives/C04DN5VRQM6/p1678746120066599
(mu/defn = :- [:or
               fn?
               :mbql.clause/=]
  "Create an `=` filter clause."
  ([x y]
   (fn [query stage-number]
     (= query stage-number x y)))
  ([query stage-number x y & more]
   (-> (into [:=]
             (map (fn [arg]
                    (->filter-arg query stage-number arg)))
             (list* x y more))
       lib.options/ensure-uuid)))
