(ns metabase.channel.render.util)

(defn is-visualizer-dashcard?
  "true if dashcard has visualizer specific viz settings"
  [dashcard]
  (boolean
   (and (some? dashcard)
        (get-in dashcard [:visualization_settings :visualization]))))
