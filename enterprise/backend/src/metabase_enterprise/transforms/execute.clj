(ns metabase-enterprise.transforms.execute)

(defn execute [{:keys [db driver sql output-table overwrite?]}]
  (or output-table (str "transform_" (random-uuid))))
