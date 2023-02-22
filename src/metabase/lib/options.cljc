(ns metabase.lib.options
  (:require [metabase.lib.dispatch :as lib.dispatch]
            [metabase.shared.util.i18n :as i18n]))

(defn- mbql-clause? [x]
  (and (vector? x)
       (keyword? (first x))))

(defmulti options
  {:arglists '([clause])}
  lib.dispatch/dispatch-value)

(defmethod options :default
  [x]
  (when-not (mbql-clause? x)
    (throw (ex-info (i18n/tru "Don''t know how to get options from {0}" (pr-str x))
                    {:x x})))
  (when (map? (second x))
    (second x)))

(defmulti with-options
  {:arglists '([clause options])}
  (fn [clause _options]
    (lib.dispatch/dispatch-value clause)))

(defmethod with-options :default
  [x options]
  (when-not (mbql-clause? x)
    (throw (ex-info (i18n/tru "Don''t know how to set options for {0}" (pr-str x))
                    {:x x})))
  (if (map? (second x))
    (assoc (vec x) 1 options)
    (into [(first x) options] (rest x))))

(defn update-options [clause f & args]
  (let [current-options (options clause)
        new-options     (apply f current-options args)]
    (with-options clause new-options)))

(defn ensure-uuid [clause]
  (update-options clause (fn [options]
                           (cond-> options
                             (not (:lib/uuid options)) (assoc :lib/uuid (str (random-uuid)))))))
