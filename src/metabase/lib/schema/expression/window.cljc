(ns metabase.lib.schema.expression.window
  "Window functions.

  `:offset` (added 0.50.0) is an aggregation whose window comes from the stage's breakouts and order-by.

  `:window` is an expression whose window is stated in the clause:

    [:window {:lib/uuid \"...\", :frame {:mode :rows, :start :unbounded-preceding, :end [:preceding 1]}}
     [:min {} <expr>]
     [:partition-by {} <expr> ...]
     [:order-by {} [:desc {} <expr>] ...]]

  It goes in the `:expressions` of a stage that has no aggregation or breakout. The stage's filters apply before the
  window, as in SQL, so a filter on a window's result belongs in the next stage."
  (:refer-clojure :exclude [some])
  (:require
   [metabase.lib.schema.aggregation]
   [metabase.lib.schema.common :as common]
   [metabase.lib.schema.expression :as expression]
   [metabase.lib.schema.mbql-clause :as mbql-clause]
   [metabase.lib.schema.order-by]
   [metabase.util.malli.registry :as mr]
   [metabase.util.performance :refer [some]]))

(comment metabase.lib.schema.aggregation/keep-me
         metabase.lib.schema.order-by/keep-me)

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

;;;; `:window`

;;; Functions that are only meaningful over a window. They are clauses so that walkers see their arguments, but they
;;; compile only as the function of a `:window`.

(mbql-clause/define-tuple-mbql-clause :row-number :- :type/Integer)

(doseq [tag [:lag :lead]]
  (mbql-clause/define-catn-mbql-clause tag
    [:expr    [:schema [:ref ::expression/expression]]]
    [:n       [:schema [:int {:min 0}]]]
    [:default [:? [:schema [:ref ::expression/expression]]]]))

(defmethod expression/type-of-method :lag  [[_tag _opts expr]] (expression/type-of expr))
(defmethod expression/type-of-method :lead [[_tag _opts expr]] (expression/type-of expr))

(def window-function-tags
  "The clauses a `:window` can compute. `:min`, `:max`, `:sum` and `:count` are the aggregation clauses; over a window
  they are computed per row."
  #{:row-number :lag :lead :min :max :sum :count})

(mr/def ::window-function
  [:and
   [:ref :metabase.lib.schema.mbql-clause/clause]
   [:fn
    {:error/message (str "a window function: one of " (pr-str (sort window-function-tags)))}
    #(and (vector? %) (contains? window-function-tags (first %)))]])

(mbql-clause/define-catn-mbql-clause :partition-by
  [:exprs [:* [:schema [:ref ::expression/expression]]]])

(mbql-clause/define-catn-mbql-clause :order-by
  [:order-bys [:* [:schema [:ref :metabase.lib.schema.order-by/order-by]]]])

(defn- normalize-bound [x]
  (cond
    (string? x)     (keyword x)
    (sequential? x) (let [[k n] x] [(keyword k) n])
    :else           x))

(mr/def ::frame.bound
  "A frame boundary. `[:preceding n]` and `[:following n]` count rows from the current one."
  [:or
   {:decode/normalize normalize-bound}
   [:enum :unbounded-preceding :current-row :unbounded-following]
   [:tuple [:enum :preceding :following] [:int {:min 0}]]])

(mr/def ::frame
  [:and
   [:map
    {:closed true, :decode/normalize common/normalize-map}
    [:mode  [:enum {:decode/normalize common/normalize-keyword} :rows]]
    [:start [:ref ::frame.bound]]
    [:end   [:ref ::frame.bound]]]
   [:fn
    {:error/message "a frame starts before it ends: not at :unbounded-following, and doesn't end at :unbounded-preceding"}
    (fn [{:keys [start end]}]
      (and (not= start :unbounded-following)
           (not= end :unbounded-preceding)))]])

(mr/def ::window.options
  [:merge
   [:ref ::common/options]
   [:map
    [:frame {:optional true} [:ref ::frame]]]])

(defn- normalize-window
  "Like the other clauses: a vector, with an options map."
  [x]
  (when (sequential? x)
    (let [x (vec x)]
      (if ((some-fn map? nil?) (second x))
        x
        (into [(first x) {:lib/uuid (str (random-uuid))}] (rest x))))))

(mbql-clause/define-mbql-clause :window
  [:schema
   [:catn
    {:error/message    "Valid :window clause"
     :decode/normalize normalize-window}
    [:tag          [:= {:decode/normalize common/normalize-keyword} :window]]
    [:options      [:schema [:ref ::window.options]]]
    [:function     [:schema [:ref ::window-function]]]
    [:partition-by [:schema [:ref :mbql.clause/partition-by]]]
    [:order-by     [:schema [:ref :mbql.clause/order-by]]]]])

(defmethod expression/type-of-method :window
  [[_tag _opts window-function]]
  (expression/type-of window-function))

(defn- contains-window?
  [x]
  (and (vector? x)
       (or (= (first x) :window)
           (some contains-window? (rest x)))))

(defn- window-expression-names [stage]
  (into #{}
        (keep (fn [[_tag opts :as expression]]
                (when (contains-window? expression)
                  (:lib/expression-name opts))))
        (:expressions stage)))

(def ^:private window-only-tags #{:row-number :lag :lead})

(defn- bare-window-function?
  "Whether `x` uses `:row-number`, `:lag` or `:lead` other than as the function of a `:window`."
  [x]
  (cond
    (map? x)        (some bare-window-function? (vals x))
    (vector? x)     (cond
                      (window-only-tags (first x)) true
                      (= (first x) :window)        (let [[_tag _opts [_fn-tag _fn-opts & fn-args] & more] x]
                                                     (some bare-window-function? (concat fn-args more)))
                      :else                        (some bare-window-function? x))
    (sequential? x) (some bare-window-function? x)
    :else           false))

(defn- stage-window-error
  "An error message if a stage uses `:window` where SQL can't compute it."
  [stage]
  (let [windows (window-expression-names stage)]
    (cond
      (bare-window-function? (dissoc stage :lib/stage-metadata))
      ":row-number, :lag and :lead are only allowed as the function of a :window"

      (and (seq windows) (or (seq (:aggregation stage)) (seq (:breakout stage))))
      "A stage with :window expressions can't have an aggregation or a breakout; summarize in the next stage"

      (some (fn [a-filter]
              (or (contains-window? a-filter)
                  (some (fn [x]
                          (and (vector? x) (= (first x) :expression) (windows (nth x 2 nil))))
                        (tree-seq vector? seq a-filter))))
            (:filters stage))
      "A stage's filters apply before its :window expressions; filter on a window in the next stage")))

(mr/def ::stage.valid-windows
  [:fn
   {:error/message "Window expressions only in stages without aggregation, breakout, or filters on the window"
    :error/fn      (fn [{stage :value} _]
                     (stage-window-error stage))}
   (complement #'stage-window-error)])
