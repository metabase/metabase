(ns metabase.api.util.handlers
  "TODO -- consider renaming this to [[metabase.api.handlers]]."
  (:require
   [clojure.string :as str]
   [compojure.core :as compojure]
   [medley.core :as m]
   [metabase.api.macros :as api.macros]
   [metabase.api.open-api :as open-api]))

(set! *warn-on-reflection* true)

(defn- split-path [^String path]
  (when (some-> path (str/starts-with? "/"))
    (if-let [next-slash-index (str/index-of path "/" 1)]
      [(subs path 0 next-slash-index) (subs path next-slash-index (count path))]
      [path "/"])))

(defn- -route-map-handler [route-map]
  (fn [request respond raise]
    (if-let [[prefix rest-of-path] (split-path ((some-fn :path-info :uri) request))]
      (if-let [handler (get route-map prefix)]
        (let [request' (assoc request :path-info rest-of-path)]
          (handler request' respond raise))
        (respond nil))
      (respond nil))))

(defn- route-map->open-api-spec [route-map prefix]
  (transduce
   (map (fn [[next-prefix handler]]
          (try
            (open-api/open-api-spec handler (str prefix next-prefix))
            (catch Throwable e
              (throw (ex-info (format "Error generating dox in %s: %s" (pr-str next-prefix) (ex-message e))
                              {:prefix prefix, :next-prefix next-prefix}
                              e))))))
   m/deep-merge
   (sorted-map)
   route-map))

(declare route-map-handler)

(defn- prepare-route-map [route-map]
  (update-vals route-map (fn [v]
                           (cond-> v
                             (map? v)           route-map-handler
                             (simple-symbol? v) api.macros/ns-handler))))

(defn route-map-handler
  "Create a Ring handler from a map of route prefix => handler."
  [route-map]
  (let [route-map (prepare-route-map route-map)]
    (open-api/handler-with-open-api-spec
     (-route-map-handler route-map)
     (fn [prefix]
       (route-map->open-api-spec route-map prefix)))))

(defn- routes->open-api-spec [handlers prefix]
  (transduce
   (map (fn [handler]
          (open-api/open-api-spec handler prefix)))
   m/deep-merge
   (sorted-map)
   handlers))

(defn routes
  "Replacement for [[compojure.core/routes]] that supports [[open-api-spec]]."
  [& handlers]
  (open-api/handler-with-open-api-spec
   (apply #_{:clj-kondo/ignore [:discouraged-var]} compojure/routes handlers)
   (fn [prefix]
     (routes->open-api-spec handlers prefix))))
