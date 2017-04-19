(ns metabase.query-processor.middleware.parameters
  "Middleware for substituting parameters in queries."
  (:require [clojure.data :as data]
            [clojure.tools.logging :as log]
            (metabase.query-processor [interface :as i]
                                      [parameters :as params])
            [metabase.util :as u]))

(defn- substitute-parameters*
  "If any parameters were supplied then substitute them into the query."
  [query]
  (u/prog1 (params/expand-parameters query)
    (when (and (not i/*disable-qp-logging*)
               (not= <> query))
      (when-let [diff (second (data/diff query <>))]
        (log/debug (u/format-color 'cyan "\n\nPARAMS/SUBSTITUTED: %s\n%s" (u/emoji "😻") (u/pprint-to-str diff)))))))

(defn substitute-parameters
  "Substitute parameters in a "
  [qp]
  (comp qp substitute-parameters*))
