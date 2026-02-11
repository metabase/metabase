(ns metabase.lib-metric.operators
  "Unified operator definitions for lib-metric filters.
   Uses lib-metric.hierarchy for category dispatch.

   Operator categories:
   - ::nullary    - no value argument (:is-null, :not-null, :is-empty, :not-empty)
   - ::comparison - single or variadic values (:=, :!=, :<, :<=, :>, :>=)
   - ::string-op  - string-specific operators (:contains, :does-not-contain, :starts-with, :ends-with)
   - ::range      - two boundary values (:between, :inside)
   - ::temporal   - temporal interval operators (:time-interval, :relative-time-interval)
   - ::compound   - logical operators (:and, :or, :not)
   - ::multi-value - multi-value operators (:in, :not-in)

   All categories derive from ::filter-operator for display-info compatibility."
  (:require
   [metabase.lib-metric.hierarchy :as hierarchy]))

;;; -------------------------------------------------- Operator Categories --------------------------------------------------

;; Nullary operators (no value argument)
(doseq [op [:is-null :not-null :is-empty :not-empty]]
  (hierarchy/derive op ::nullary))

;; Comparison operators (single or variadic values)
(doseq [op [:= :!= :< :<= :> :>=]]
  (hierarchy/derive op ::comparison))

;; String-specific operators
(doseq [op [:contains :does-not-contain :starts-with :ends-with]]
  (hierarchy/derive op ::string-op))

;; Range operators (two boundary values)
(doseq [op [:between :inside]]
  (hierarchy/derive op ::range))

;; Temporal interval operators
(doseq [op [:time-interval :relative-time-interval]]
  (hierarchy/derive op ::temporal))

;; Compound logical operators
(doseq [op [:and :or :not]]
  (hierarchy/derive op ::compound))

;; Multi-value operators
(doseq [op [:in :not-in]]
  (hierarchy/derive op ::multi-value))

;; All operator categories are filter operators (for display-info compatibility)
(doseq [cat [::nullary ::comparison ::string-op ::range ::temporal ::compound ::multi-value]]
  (hierarchy/derive cat ::filter-operator))

;;; -------------------------------------------------- Operator Metadata --------------------------------------------------

(def ^:private operator-metadata
  "Metadata for each filter operator."
  {:is-null          {:display-name "is empty"           :arity 0         :ast-node-type :filter/null}
   :not-null         {:display-name "is not empty"       :arity 0         :ast-node-type :filter/null}
   :is-empty         {:display-name "is empty"           :arity 0         :ast-node-type :filter/null}
   :not-empty        {:display-name "is not empty"       :arity 0         :ast-node-type :filter/null}
   :=                {:display-name "is"                 :arity :variadic :ast-node-type :filter/comparison}
   :!=               {:display-name "is not"             :arity :variadic :ast-node-type :filter/comparison}
   :<                {:display-name "is less than"       :arity 1         :ast-node-type :filter/comparison}
   :<=               {:display-name "is at most"         :arity 1         :ast-node-type :filter/comparison}
   :>                {:display-name "is greater than"    :arity 1         :ast-node-type :filter/comparison}
   :>=               {:display-name "is at least"        :arity 1         :ast-node-type :filter/comparison}
   :between          {:display-name "is between"         :arity 2         :ast-node-type :filter/between}
   :inside           {:display-name "is inside"          :arity 4         :ast-node-type :filter/inside}
   :contains         {:display-name "contains"           :arity 1         :ast-node-type :filter/string}
   :does-not-contain {:display-name "does not contain"   :arity 1         :ast-node-type :filter/string}
   :starts-with      {:display-name "starts with"        :arity 1         :ast-node-type :filter/string}
   :ends-with        {:display-name "ends with"          :arity 1         :ast-node-type :filter/string}
   :time-interval    {:display-name "is"                 :arity 2         :ast-node-type :filter/temporal}
   :relative-time-interval {:display-name "is"           :arity 2         :ast-node-type :filter/temporal}
   :in               {:display-name "is"                 :arity :variadic :ast-node-type :filter/in}
   :not-in           {:display-name "is not"             :arity :variadic :ast-node-type :filter/in}
   :and              {:display-name "and"                :arity :variadic :ast-node-type nil}
   :or               {:display-name "or"                 :arity :variadic :ast-node-type nil}
   :not              {:display-name "not"                :arity 1         :ast-node-type nil}})

;;; -------------------------------------------------- Category Predicates --------------------------------------------------

(defn nullary?
  "Returns true if `op` is a nullary operator (no value argument)."
  [op]
  (hierarchy/isa? op ::nullary))

(defn comparison?
  "Returns true if `op` is a comparison operator."
  [op]
  (hierarchy/isa? op ::comparison))

(defn string-op?
  "Returns true if `op` is a string-specific operator."
  [op]
  (hierarchy/isa? op ::string-op))

(defn range?
  "Returns true if `op` is a range operator (two boundary values)."
  [op]
  (hierarchy/isa? op ::range))

(defn temporal?
  "Returns true if `op` is a temporal interval operator."
  [op]
  (hierarchy/isa? op ::temporal))

(defn compound?
  "Returns true if `op` is a compound logical operator."
  [op]
  (hierarchy/isa? op ::compound))

(defn multi-value?
  "Returns true if `op` is a multi-value operator."
  [op]
  (hierarchy/isa? op ::multi-value))

(defn filter-operator?
  "Returns true if `op` is any kind of filter operator."
  [op]
  (hierarchy/isa? op ::filter-operator))

;;; -------------------------------------------------- Query Functions --------------------------------------------------

(defn display-name
  "Get the display name for an operator. Falls back to the operator name if not found."
  [op]
  (get-in operator-metadata [op :display-name] (name op)))

(defn arity
  "Get the arity for an operator. Returns 1 as default if not found."
  [op]
  (get-in operator-metadata [op :arity] 1))

(defn ast-node-type
  "Get the AST node type for an operator."
  [op]
  (get-in operator-metadata [op :ast-node-type]))

;;; -------------------------------------------------- Operators by Dimension Type --------------------------------------------------

(def ^:private operators-by-dimension-type
  "Operators available for each dimension type category."
  {:string     [:is-empty :not-empty := :!= :contains :does-not-contain :starts-with :ends-with]
   :numeric    [:is-null :not-null := :!= :> :>= :< :<= :between]
   :boolean    [:is-null :not-null :=]
   :temporal   [:is-null :not-null := :!= :> :< :between]
   :time       [:is-null :not-null :> :< :between]
   :coordinate [:= :!= :> :>= :< :<= :between :inside]
   :default    [:is-null :not-null]})

(defn operators-for-dimension-type
  "Get operators available for a dimension type category.
   Valid categories: :string, :numeric, :boolean, :temporal, :time, :coordinate.
   Returns :default operators if category not found."
  [dimension-type]
  (get operators-by-dimension-type dimension-type (:default operators-by-dimension-type)))
