(ns metabase.channel.render.js.color
  "Determines the background colors of pulse table cells by delegating to the shared color-selector javascript (loaded
  into every pooled static-viz context — see `metabase.channel.render.js.pool`). All the colors for a table are
  computed in a single batched JS call, so no context-bound value ever escapes the pool."
  (:require
   [metabase.channel.render.js.engine :as js.engine]
   [metabase.channel.render.js.pool :as js.pool]
   [metabase.formatter.core :as formatter]
   [metabase.util.json :as json]
   [metabase.util.malli :as mu]))

(set! *warn-on-reflection* true)

(def ^:private QueryResults
  "This is a pretty loose schema, more as a safety net as we have a long feedback loop for this being broken as it's
  being handed to the JS color picking code. Currently it just needs column names from `:cols`, and the query results
  from `:rows`"
  [:map
   [:cols [:sequential [:map
                        [:name :string]]]]
   [:rows [:sequential [:sequential :any]]]])

(def ^:private Cell
  "One cell to color: its value (possibly a formatter wrapper), its row index (row-highlight rules read the whole row
  from the `:rows` passed alongside), and its column name."
  [:tuple :any :int [:maybe :string]])

(defn- ->js-number
  "Coerce BigDecimal/BigInteger to primitive double/long so the JSON handed to the JS side carries plain numbers.
   Returns nil when the value would overflow — BigInteger too wide for long, or BigDecimal magnitude beyond Double's
   finite range — since silently truncating would feed wrong values into gradient/comparison logic."
  [v]
  (cond
    (instance? BigDecimal v)
    (let [d (.doubleValue ^BigDecimal v)]
      (when (Double/isFinite d) d))

    (instance? BigInteger v)
    (when (<= (.bitLength ^BigInteger v) 63)
      (.longValue ^BigInteger v))

    :else v))

(defn- ->js-value
  "Unwrap a formatter wrapper to the raw cell value the coloring rules should see."
  [cell]
  (cond
    (formatter/NumericWrapper? cell)
    (->js-number (:num-value cell))

    (formatter/TextWrapper? cell)
    (:original-value cell)

    :else
    (->js-number cell)))

(mu/defn cell-background-colors :- [:sequential [:maybe :string]]
  "Compute the background colors for table `cells` in one batched JS call; returns colors positionally — a CSS color
  string (hex or `rgba()`) or nil for cells no rule matches. The coloring rules come from `:table.column_formatting`
  in `viz-settings` (row-highlight rules are disabled when `:table.pivot` is set)."
  [{:keys [cols rows]} :- QueryResults
   viz-settings
   cells :- [:sequential Cell]]
  (if (or (empty? cells)
          (empty? (or (:table.column_formatting viz-settings)
                      (get viz-settings "table.column_formatting"))))
    (vec (repeat (count cells) nil))
    (js.pool/with-static-viz-context context
      (-> (js.engine/execute-fn-name context "getCellBackgroundColors"
                                     (json/encode rows)
                                     (json/encode cols)
                                     (json/encode viz-settings)
                                     (json/encode (mapv (fn [[value row-index column-name]]
                                                          [(->js-value value) row-index column-name])
                                                        cells)))
          .asString
          json/decode))))
