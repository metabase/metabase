(ns metabase.lib.schema.expression.window
  (:require
   [metabase.lib.hierarchy :as lib.hierarchy]
   [metabase.lib.schema.aggregation :as-alias aggregation]
   [metabase.lib.schema.common :as common]
   [metabase.lib.schema.expression :as expression]
   [metabase.lib.schema.mbql-clause :as mbql-clause]
   [metabase.util.malli.registry :as mr]))

(mr/def ::offset.n
  [:and
   :int
   [:fn
    {:error/message "offset cannot be zero"}
    (some-fn pos-int? neg-int?)]])

;;; added 0.50.0
(mbql-clause/define-tuple-mbql-clause :offset
  #_expr [:ref ::expression/expression]
  #_n    ::offset.n)

(defmethod expression/type-of-method :offset
  [[_tag _opts expr _n]]
  (expression/type-of expr))

;;; A `:window` expression wraps either an aggregate call or a window-only call, together with a window
;;; specification (`:partition-by` / `:order-by` / `:frame` / `:exclude`).
(mbql-clause/define-tuple-mbql-clause :row-number :- :type/Integer)
(mbql-clause/define-tuple-mbql-clause :rank :- :type/Integer)
(mbql-clause/define-tuple-mbql-clause :dense-rank :- :type/Integer)
(mbql-clause/define-tuple-mbql-clause :percent-rank :- :type/Float)
(mbql-clause/define-tuple-mbql-clause :cume-dist :- :type/Float)

(mbql-clause/define-tuple-mbql-clause :ntile :- :type/Integer
  #_n pos-int?)

(mbql-clause/define-catn-mbql-clause :lag
  [:expr    [:schema [:ref ::expression/expression]]]
  [:n       [:? [:schema pos-int?]]]
  [:default [:? [:schema [:ref ::expression/expression]]]])

(mbql-clause/define-catn-mbql-clause :lead
  [:expr    [:schema [:ref ::expression/expression]]]
  [:n       [:? [:schema pos-int?]]]
  [:default [:? [:schema [:ref ::expression/expression]]]])

(mbql-clause/define-tuple-mbql-clause :first-value
  #_expr [:ref ::expression/expression])

(mbql-clause/define-tuple-mbql-clause :last-value
  #_expr [:ref ::expression/expression])

(mbql-clause/define-tuple-mbql-clause :nth-value
  #_expr [:ref ::expression/expression]
  #_n    pos-int?)

;;; Window-only calls — only legal inside `:window`.
(doseq [tag [:row-number :rank :dense-rank :percent-rank :cume-dist
             :ntile :lag :lead :first-value :last-value :nth-value]]
  (lib.hierarchy/derive tag ::window-only-clause-tag))

;;; Result type for the single-expression window-only calls follows the wrapped expression.
(doseq [tag [:lag :lead :first-value :last-value :nth-value]]
  (defmethod expression/type-of-method tag
    [[_tag _opts expr & _]]
    (expression/type-of expr)))

;;; Frame offsets are positive numbers for `:rows` / `:groups` (which count physical rows / peer-groups) and for
;;; numerical `:range` frames. `:range` frames over temporal order keys take an `:interval` MBQL clause as the offset,
;;; e.g. `[:preceding [:interval {} 7 :day]]` for a rolling 7-day window.

(mr/def ::frame-offset
  [:or
   [:and number? [:fn pos?]]
   [:ref :mbql.clause/interval]])

(mr/def ::frame-boundary
  [:or
   [:enum {:decode/normalize common/normalize-keyword}
    :unbounded-preceding :current-row :unbounded-following]
   [:tuple [:enum {:decode/normalize common/normalize-keyword} :preceding :following]
    ::frame-offset]])

(mr/def ::frame
  [:map
   {:closed           true
    :decode/normalize common/normalize-map}
   [:type    [:enum {:decode/normalize common/normalize-keyword} :rows :range :groups]]
   [:start   [:ref ::frame-boundary]]
   [:end     [:ref ::frame-boundary]]
   [:exclude {:optional true}
    [:enum {:decode/normalize common/normalize-keyword}
     :no-others :current-row :group :ties]]])

(mr/def ::window-inner-call
  [:and
   [:ref :metabase.lib.schema.mbql-clause/clause]
   [:fn {:error/message ":window inner call must be an aggregation or window-only function"}
    (fn [[tag]]
      (or (lib.hierarchy/isa? tag ::aggregation/aggregation-clause-tag)
          (lib.hierarchy/isa? tag ::window-only-clause-tag)))]])

(defn- requires-order-by? [[tag]]
  (or (lib.hierarchy/isa? tag ::window-only-clause-tag)
      (contains? #{:cum-sum :cum-count :offset} tag)))

(mr/def ::window-spec
  [:and
   [:map
    {:closed           true
     :decode/normalize common/normalize-map}
    [:partition-by {:optional true} [:sequential [:ref ::expression/expression]]]
    [:order-by     {:optional true}
     [:sequential {:min 1}
      [:tuple [:ref ::expression/expression]
       [:enum {:decode/normalize common/normalize-keyword} :asc :desc]]]]
    [:frame        {:optional true} ::frame]]
   [:fn {:error/message ":frame requires :order-by"}
    (fn [{:keys [frame order-by]}]
      (or (nil? frame) (seq order-by)))]])

(mbql-clause/define-mbql-clause :window
  [:and
   (mbql-clause/tuple-clause-schema
    :window
    #_inner-call  [:schema [:ref ::window-inner-call]]
    #_window-spec [:schema [:ref ::window-spec]])
   [:fn {:error/message "window-only inner calls require :order-by in the window spec"}
    (fn [[_tag _opts inner spec]]
      (or (not (requires-order-by? inner))
          (seq (:order-by spec))))]])

(defmethod expression/type-of-method :window
  [[_tag _opts inner _spec]]
  (expression/type-of inner))

;;; `:window` encapsulates its (possibly-aggregate) inner call. From outside it is a row-shaped expression. Walkers
;;; that look for aggregations inside an expression should stop here.
(lib.hierarchy/derive :window :metabase.lib.schema.aggregation/aggregation-barrier-tag)
