(ns metabase.pulse.render.test-util)

(def test-card
  {:visualization_settings
   {"table.column_formatting" [{:columns       ["a"]
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
