(ns metabase-enterprise.transform-testing.expectations.report
  "Turning warehouse values into something a failure report can carry.

  Shared by every expectation type, so it sits below them rather than in the front door."
  (:require
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms])
  (:import
   (java.math BigDecimal)))

(set! *warn-on-reflection* true)

(def row-cap
  "How many rows of any one failure list are reported. The rest are counted as truncated."
  50)

(mu/defn cell :- [:maybe [:or :boolean number? :string]]
  "`v` as something JSON can carry.

  A BigDecimal keeps its scale: when scale is the difference between expected and actual,
  normalizing it away makes the report deny the very thing it is reporting."
  [v :- ms/FieldValue]
  (cond
    (nil? v)                 nil
    (instance? BigDecimal v) (.toPlainString ^BigDecimal v)
    (number? v)              v
    (boolean? v)             v
    (string? v)              v
    :else                    (str v)))

(mu/defn capped :- [:tuple [:vector [:sequential ms/FieldValue]] :int]
  "`[first-n dropped]` — `rows` cut to [[row-cap]], and how many that lost."
  [rows :- [:sequential [:sequential ms/FieldValue]]]
  [(vec (take row-cap rows)) (max 0 (- (count rows) row-cap))])
