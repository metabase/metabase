(ns metabase.driver.sync.fingerprint
  (:require [metabase.sync.analyze.fingerprint.fingerprinters :as f]
            [redux.core :as redux]
            [metabase.db.metadata-queries :as metadata-queries]
            [metabase.sync.interface :as i]
            [metabase.driver.sync.fingerprint.interface :as driver.f.i]
            [schema.core :as s]))

(defmethod @#'driver.f.i/fingerprint-table! :default [driver table fields]
  (let [rff (fn [_metadata]
              (redux/post-complete
                (f/fingerprint-fields fields)
                (fn [fingerprints]
                  (reduce (fn [count-info [field fingerprint]]
                            (cond
                              (instance? Throwable fingerprint)
                              (update count-info :failed-fingerprints inc)

                              (some-> fingerprint :global :distinct-count zero?)
                              (update count-info :no-data-fingerprints inc)

                              :else
                              (do
                                ;; TODO: don't call this here, just have the multimethod return data (not modify app DB)
                                (save-fingerprint! field fingerprint)
                                (update count-info :updated-fingerprints inc))))
                    (empty-stats-map (count fingerprints))
                    (map vector fields fingerprints)))))]
    (metadata-queries/table-rows-sample table fields rff {:truncation-size truncation-size})))
