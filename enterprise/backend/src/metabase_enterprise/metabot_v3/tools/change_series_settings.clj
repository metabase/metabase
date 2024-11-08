(ns metabase-enterprise.metabot-v3.tools.change-series-settings
  (:require [metabase-enterprise.metabot-v3.tools.registry :refer [deftool]]))

(deftool change-series-settings
  "Change visualization settings for series on cartesian charts. Make sure that the visualization type is `line`, `bar`, `area`, or `combo` before calling this tool."
  [[:series_settings {:description "Settings for series. Only include for series which you want to change. Every object in the array should have a key property that matches the series key in series_settings map. You must not include properties that should not be changed."}
    [:vector [:map {}
              [:key {:description "The series key in series_settings map."} :string]
              [:title {:description "The title of the series."
                       :optional true}
               [:maybe :string]]
              [:color {:description "The color of the series. Use colors from the color palette only, selecting the closest match if a specific color is requested. Use different colors for multiple series."
                       :optional true}
               [:maybe :string]]
              [:show_series_values {:description "Whether to show the series values."
                                    :optional true}
               [:maybe :boolean]]
              [:axis {:description "Set the Y-axis of the series to left or right."
                      :optional true}
               [:maybe [:enum ["left" "right"]]]]
              [:line.size {:description "Set the thickness of a line series."
                           :optional true}
               [:maybe [:enum ["S" "M" "L"]]]]
              [:line.style {:description "Set the style of the line."
                            :optional true}
               [:maybe [:enum ["solid" "dashed" "dotted"]]]]
              [:line.interpolate {:description "Set the interpolation method for lines and areas only."
                                  :optional true}
               [:maybe [:enum ["linear" "cardinal" "step-after"]]]]
              [:line.marker_enabled {:description "Set whether to show the marker on the line and area series."
                                     :optional true}
               [:maybe :boolean]]
              [:line.missing {:description "Set the value to handle missing data points."
                              :optional true}
               [:maybe [:enum ["none" "zero" "interpolate"]]]]]]]]
  :applicable? #(contains? #{"line" "bar" "area" "combo"}
                           (some-> % :current_visualization_settings :current_display_type)))
