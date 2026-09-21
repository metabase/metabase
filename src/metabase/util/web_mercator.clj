(ns metabase.util.web-mercator
  "Web Mercator projection math, shared by the live pin-tile renderer ([[metabase.tiles.api]]) and the
  static map renderer ([[metabase.channel.render.maps]]).")

(set! *warn-on-reflection* true)

(def ^:const tile-size
  "Standard Web Mercator tile size, in pixels."
  256)

(defn latlon->world-px
  "Project `lat`/`lon` to global Web Mercator pixel coordinates (origin top-left) at integer `zoom`,
  returning `[x y]` doubles. Latitudes are clamped just short of the poles, where the projection
  diverges."
  [^double lat ^double lon ^long zoom]
  (let [world   (double (* tile-size (bit-shift-left 1 zoom)))
        x       (* world (/ (+ lon 180.0) 360.0))
        sin-lat (-> lat
                    Math/toRadians
                    Math/sin
                    (Math/max -0.9999)
                    (Math/min 0.9999))
        y       (* world (- 0.5 (/ (Math/log (/ (+ 1.0 sin-lat)
                                                (- 1.0 sin-lat)))
                                   (* 4.0 Math/PI))))]
    [x y]))
