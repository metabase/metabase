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

(defn- route-prefix
  "The `:route-prefix` for `request` after this route-map level consumed `prefix`.

  The first route-map level seeds the accumulator from `:compojure/route-context` — the route *patterns* of the
  enclosing `compojure.core/context` forms, which is how the leading `/api`
  from [[metabase.server.routes/make-routes]] gets into the template. We use `:compojure/route-context` rather than
  Ring's `:context` because `:context` is sliced out of the request URI and would carry real path-param values for a
  parameterized context; `:compojure/route-context` is always the declared pattern."
  [request prefix]
  (str (or (:route-prefix request) (:compojure/route-context request)) prefix))

(defn- -route-map-handler [route-map]
  (fn [request respond raise]
    (if-let [[prefix rest-of-path] (split-path ((some-fn :path-info :uri) request))]
      (if-let [handler (get route-map prefix)]
        (let [request' (-> request
                           (assoc :path-info rest-of-path)
                           (assoc :route-prefix (route-prefix request prefix)))]
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
  "Create a Ring handler from a map of route prefix => handler.

  As routing descends, each level appends the prefix it consumed to the request's `:route-prefix`, which
  `metabase.api.macros` turns into the matched request's `:route-template` (e.g. `\"/api/card/:id\"`). Only declared
  route patterns are accumulated — never anything from the request URI or query string."
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
   ;; this is the sanctioned routes wrapper itself; it delegates to compojure and adds OpenAPI
   (apply #_{:clj-kondo/ignore [:discouraged-var]} compojure/routes handlers)
   (fn [prefix]
     (routes->open-api-spec handlers prefix))))
