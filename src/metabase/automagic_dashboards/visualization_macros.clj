(ns metabase.automagic-dashboards.visualization-macros)

(defmulti expand-visualization
  "Expand visualization macro."
  (fn [card _ _]
    (-> card :visualization first)))

(def ^:private ^:const ^Long smart-row-table-threshold 10)

(defmethod expand-visualization "smart-row"
  [card dimensions metrics]
  (let [[display settings] (:visualization card)]
    (-> card
        (assoc :visualization (if (->> dimensions
                                       (keep #(get-in % [:fingerprint :global :distinct-count]))
                                       (apply max 0)
                                       (>= smart-row-table-threshold))
                                ["row" settings]
                                ["table" (merge {:column_settings {(->> metrics
                                                                        first
                                                                        :op
                                                                        (format "[\"name\",\"%s\"]")
                                                                        keyword) {:show_mini_bar true}}}
                                                settings)]))
        (update :order_by #(or % [{(-> card :metrics first) "descending"}])))))

(defmethod expand-visualization :default
  [card _ _]
  card)
