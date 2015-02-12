(ns metabase.middleware.strip-fns-from-response
  (:require [medley.core :refer [filter-vals map-vals]]))

(declare strip-fns)

(defn strip-fns-from-response
  "Middleware that recursively strips key -> fn pairs from a response so it doesn't get converted to JSON.
   fns cannot be converted to JSON, so otherwise unhydrated keys in results from `sel` will cause the
   serializer to barf."
  [handler]
  (fn [request]
    (strip-fns (handler request))))

(defn- strip-fns [obj]
  (if-not (coll? obj) obj
          (if-not (map? obj) (map strip-fns obj)
                  (->> obj
                       (filter-vals #(and (not (fn? %))
                                          (not (delay? %))))
                       (map-vals strip-fns)))))
