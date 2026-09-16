(ns metabase.transform-testing.expectations.report
  "Turning warehouse values into something a failure report can carry.

  Shared by every expectation type, so it sits below them rather than in the front door."
  (:import
   (java.math BigDecimal)))

(set! *warn-on-reflection* true)

(def row-cap
  "How many rows of any one failure list are reported. The rest are counted as truncated."
  50)

(defn cell
  "`v` as something JSON can carry.

  A BigDecimal keeps its scale: when scale is the difference between expected and actual,
  normalizing it away makes the report deny the very thing it is reporting."
  [v]
  (cond
    (nil? v)                 nil
    (instance? BigDecimal v) (.toPlainString ^BigDecimal v)
    (number? v)              v
    (boolean? v)             v
    (string? v)              v
    :else                    (str v)))

(defn capped
  "`[first-n dropped]` — `rows` cut to [[row-cap]], and how many that lost."
  [rows]
  [(vec (take row-cap rows)) (max 0 (- (count rows) row-cap))])
