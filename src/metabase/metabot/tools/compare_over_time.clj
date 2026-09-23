(ns metabase.metabot.tools.compare-over-time
  "Hackathon 2026: re-run a saved question broken out by time, so a subscription report can talk about trends even
  for cards that only show a single number. The card's own aggregations are kept; its breakouts and time filters
  are replaced by one time breakout plus a 'last N periods' window."
  (:require
   [clojure.string :as str]
   [metabase.lib.core :as lib]
   [metabase.lib.types.isa :as lib.types.isa]
   [metabase.metabot.scope :as scope]
   [metabase.metabot.tools.util :as metabot.tools.u]
   [metabase.query-processor :as qp]
   [metabase.util.malli :as mu]))

(set! *warn-on-reflection* true)

(def ^:private max-periods 60)

(defn- col-label [col]
  (or (:display-name col) (:name col)))

(defn- temporal-columns [query]
  (filter lib.types.isa/temporal? (lib/breakoutable-columns query)))

(defn- filter-column-names
  "Names of the columns the query already filters on."
  [query]
  (into #{} (keep #(some-> (lib/filter-parts query %) :column :name)) (lib/filters query)))

(defn- pick-time-column
  "The card's time axis: the column the caller named, else a temporal column the card already filters on, else a
  `created_at`-ish column, else the first temporal column."
  [query column-name]
  (let [cols     (temporal-columns query)
        filtered (filter-column-names query)
        matches  (fn [s col] (= (str/lower-case s) (str/lower-case (col-label col))))]
    (or (when-not (str/blank? column-name) (first (filter #(matches column-name %) cols)))
        (first (filter #(filtered (:name %)) cols))
        (first (filter #(str/includes? (str/lower-case (:name %)) "created") cols))
        (first cols))))

(defn- strip-time-filters
  "Drop the card's filters on `col` (e.g. 'this quarter') so the trend window can replace them."
  [query col]
  (reduce (fn [q f]
            (if (= (:name (:column (lib/filter-parts q f))) (:name col))
              (lib/remove-clause q f)
              q))
          query
          (lib/filters query)))

(defn- strip-breakouts
  "Drop the card's breakouts (and the order-bys that depend on them) so the result is one row per period."
  [query]
  (reduce lib/remove-clause query (lib/breakouts query)))

(defn- trend-query
  [query col unit periods]
  (let [unit-kw (keyword unit)
        q       (-> query
                    (strip-time-filters col)
                    strip-breakouts)
        q       (if (seq (lib/aggregations q)) q (lib/aggregate q (lib/count)))]
    (-> q
        (lib/filter (lib/or (lib/time-interval col (- periods) unit-kw)
                            (lib/time-interval col :current unit-kw)))
        (lib/breakout (lib/with-temporal-bucket col unit-kw)))))

(defn- fmt [v]
  (cond
    (nil? v)     ""
    (ratio? v)   (str (double v))
    (float? v)   (format "%.2f" (double v))
    :else        (str v)))

(defn- pct-change [prev cur]
  (when (and (number? prev) (number? cur) (not (zero? prev)))
    (format "%+.1f%%" (* 100.0 (/ (- cur prev) (double prev))))))

(defn- latest-vs-previous
  "One line per metric column: latest period vs the one before it."
  [cols rows]
  (when (<= 2 (count rows))
    (let [[prev cur] (take-last 2 rows)]
      (->> (map-indexed vector cols)
           (drop 1) ; first column is the period
           (keep (fn [[i col]]
                   (let [p (nth prev i) c (nth cur i)]
                     (when (and (number? p) (number? c))
                       (str "- " (col-label col) ": " (fmt c) " now vs " (fmt p) " previous period"
                            (some->> (pct-change p c) (str " (") (#(str % ")"))))))))
           (str/join "\n")))))

(defn- run-and-format
  [card col unit periods]
  (let [result (qp/process-query (trend-query (metabot.tools.u/card-query (:id card)) col unit periods))
        cols   (get-in result [:data :cols])
        rows   (get-in result [:data :rows])]
    (when (not= :completed (:status result))
      (throw (ex-info (str "Query failed: " (:error result)) {:agent-error? true})))
    (str "\"" (:name card) "\" by " unit ", last " periods " " unit "s including the current one, "
         "time column \"" (col-label col) "\". Oldest first.\n"
         (str/join " | " (map col-label cols)) "\n"
         (str/join "\n" (map #(str/join " | " (map fmt %)) rows))
         "\n\nLatest vs previous:\n" (or (latest-vs-previous cols rows) "- fewer than two periods of data")
         "\n\nNote: the current period is usually incomplete; compare it with care.")))

(mu/defn ^{:tool-name "compare_card_over_time"
           :scope     scope/agent-question-execute}
  compare-card-over-time-tool
  "Re-run a dashboard card broken out by time to see its trend: one row per period for the last N periods, with a
  latest-vs-previous line per metric. Use it for cards that show a single number or a non-time breakdown, when you
  need to say whether something went up or down. `unit` should normally be the report's schedule unit. Does not work
  on SQL questions or cards without a date column."
  [{:keys [card_id unit periods time_column]} :- [:map {:closed true}
                                                  [:card_id :int]
                                                  [:unit {:optional true} [:maybe [:enum "hour" "day" "week" "month" "quarter" "year"]]]
                                                  [:periods {:optional true} [:maybe :int]]
                                                  [:time_column {:optional true} [:maybe :string]]]]
  (try
    (let [card    (metabot.tools.u/get-card card_id)
          unit    (or unit "day")
          periods (-> (or periods 8) (max 2) (min max-periods))
          query   (metabot.tools.u/card-query card_id)]
      (cond
        (nil? card)
        {:output (str "No card with id " card_id ".")}

        (= :mbql.stage/native (:lib/type (first (:stages query))))
        {:output (str "\"" (:name card) "\" is a SQL question; it cannot be re-run over time. Use only its current result.")}

        :else
        (if-let [col (pick-time-column query time_column)]
          {:output (run-and-format card col unit periods)}
          {:output (str "\"" (:name card) "\" has no date column to break out by. Use only its current result.")})))
    (catch Exception e
      (metabot.tools.u/handle-agent-error e))))
