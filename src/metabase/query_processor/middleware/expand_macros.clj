(ns metabase.query-processor.middleware.expand-macros
  "Middleware for expanding `METRIC` and `SEGMENT` 'macros' in *unexpanded* MBQL queries."
  (:require [clojure.tools.logging :as log]
            (metabase.query-processor [interface :as i]
                                      [macros :as macros]
                                      [util :as qputil])
            [metabase.util :as u]))

(defn- expand-macros* [query]
  (if-not (qputil/mbql-query? query)
    query
    (u/prog1 (macros/expand-macros query)
      (when (and (not i/*disable-qp-logging*)
                 (not= <> query))
        (log/debug (u/format-color 'cyan "\n\nMACRO/SUBSTITUTED: %s\n%s" (u/emoji "😻") (u/pprint-to-str <>)))))))

(defn expand-macros
  "Middleware that looks for `METRIC` and `SEGMENT` macros in an unexpanded MBQL query and substitute the macros for their contents."
  [qp] (comp qp expand-macros*))
