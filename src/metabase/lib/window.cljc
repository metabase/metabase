(ns metabase.lib.window
  (:require
   [metabase.lib.ident :as lib.ident]
   [metabase.lib.metadata.calculation :as lib.metadata.calculation]
   [metabase.lib.options :as lib.options]
   [metabase.lib.schema.window :as lib.schema.window]))

;; TMP: window/mix and window/max for now
(defmethod lib.metadata.calculation/type-of-method ::lib.schema.window/window-clause-tag
  [_query _stage-number _x]
  :type/Number)

;; Should use under field.. -- probably not necessary now
(defmethod lib.metadata.calculation/display-name-method :window-min
  [_query _stage-number _x _y]
  "Window Min")

(defmethod lib.metadata.calculation/display-name-method :window-max
  [_query _stage-number _x _y]
  "Window Max")

(defmethod lib.metadata.calculation/column-name-method :window-min
  [_query _stage-number _x]
  "window_min")

(defmethod lib.metadata.calculation/column-name-method :window-max
  [_query _stage-number _x]
  "window_max")

;; TODO:
(def propagated-keys [:binning-ref-paths :binning-breakout-indices :binning-window-type :binned-breakout-refs])

;; maybe on this "metadata" level lib/source, names should not be present (but higher)
(defmethod lib.metadata.calculation/metadata-method ::lib.schema.window/window-clause-tag
  [query stage-number window]
  (merge
   ((get-method lib.metadata.calculation/metadata-method :default) query stage-number window)
   {:lib/source :source/windows
    :lib/source-uuid (:lib/uuid (second window))
    :effective-type :type/Number
    :ident (lib.ident/random-ident)}
   (select-keys (lib.options/options window) propagated-keys)))
