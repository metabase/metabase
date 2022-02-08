(ns metabase.pulse.render.test-util)

(def test-card
  {:visualization_settings
   {:graph.metrics ["NumPurchased"]
    :graph.dimensions ["Price"]
    :table.column_formatting [{:columns       ["a"]
                               :type          :single
                               :operator      ">"
                               :value         5
                               :color         "#ff0000"
                               :highlight_row true}
                              {:columns       ["c"]
                               :type          "range"
                               :min_type      "custom"
                               :min_value     3
                               :max_type      "custom"
                               :max_value     9
                               :colors        ["#00ff00" "#0000ff"]}]}})

(def test-combo-card
  {:visualization_settings
   {:graph.metrics ["NumPurchased", "NumKazoos"]
    :graph.dimensions ["Price"]}})

(def test-stack-card
  {:visualization_settings
   {:graph.metrics ["NumPurchased", "NumKazoos"]
    :graph.dimensions ["Price"]
    :stackable.stack_type "stack"}})

(def test-combo-card-multi-x
  {:visualization_settings
   {:graph.metrics ["NumKazoos"]
    :graph.dimensions ["Price" "NumPurchased"]}})
