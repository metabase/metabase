(ns metabase.visualization-settings.dynamic-goal-settings
  "Which goal settings each display draws, shared with the frontend.")

(def display->goal-settings
  "The goal settings each display draws. A display not listed, such as any `custom:*` one, draws none, so running a card
  with it runs none of its goal references."
  {:area      #{:graph.goal_value}
   :bar       #{:graph.goal_value}
   :boxplot   #{:graph.goal_value}
   :combo     #{:graph.goal_value}
   :gauge     #{:gauge.segments}
   :line      #{:graph.goal_value}
   :progress  #{:progress.goal}
   :row       #{:graph.goal_value}
   :scalar    #{:scalar.segments}
   :scatter   #{:graph.goal_value}
   :waterfall #{:graph.goal_value}})

#?(:cljs (def ^:export DYNAMIC_GOAL_SETTINGS_BY_DISPLAY_JSON
           "[[display->goal-settings]] as a json object suitable for the FE"
           (clj->js display->goal-settings)))
