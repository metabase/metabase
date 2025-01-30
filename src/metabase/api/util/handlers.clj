(ns metabase.api.util.handlers
  "TODO -- consider renaming this to [[metabase.api.handlers]]."
  (:require
   [clojure.string :as str]
   [compojure.core :as compojure]
   [medley.core :as m]
   [metabase.api.macros :as api.macros]
   [metabase.api.open-api :as open-api]
   [metabase.plugins.classloader :as classloader]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]))

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
          (open-api/open-api-spec handler (str prefix next-prefix))))
   m/deep-merge
   (sorted-map)
   route-map))

(mu/defn lazy-ns-handler :- ::api.macros/handler
  "Lazily create an [[ns-handler]] for the namespace named by [[ns-symb]]. Namespace is loaded the first time the
  handler is used. Use this in combination with [[route-map-handler]] to create a true lazy-loading API.

    (lazy-ns-handler 'metabase.api.action)"
  [ns-symb :- simple-symbol?]
  (let [dlay (delay
               (log/debugf "LAZY LOAD %s" ns-symb)
               (classloader/require ns-symb)
               ;; make sure we're not using `lazy-ns-handler` in namespaces that explicitly define a `routes` var... 99%
               ;; chance we meant to use `lazy-handler` instead.
               (when (ns-resolve ns-symb 'routes)
                 (throw (ex-info (format "%s has a routes var, did you mean to use %s instead of %s?"
                                         ns-symb
                                         `lazy-handler
                                         `lazy-ns-handler)
                                 {:namespace ns-symb})))
               (api.macros/ns-handler ns-symb))]
    (open-api/handler-with-open-api-spec
     (fn handler [request respond raise]
       (@dlay request respond raise))
     (fn [prefix]
       (open-api/open-api-spec @dlay prefix)))))

(mu/defn lazy-handler :- ::api.macros/handler
  "Like [[lazy-ns-handler]] but resolves a handler var at runtime the first time the handler is used."
  [handler-symb :- qualified-symbol?]
  (let [dlay (delay
               (log/debugf "LAZY LOAD %s" handler-symb)
               (or (requiring-resolve handler-symb)
                   (throw (ex-info (format "Failed to resolve %s" handler-symb)
                                   {:handler handler-symb}))))]
    (open-api/handler-with-open-api-spec
     (fn handler [request respond raise]
       (@dlay request respond raise))
     (fn [prefix]
       (open-api/open-api-spec @dlay prefix)))))

(declare route-map-handler)

(defn- prepare-route-map [route-map]
  (update-vals route-map (fn [v]
                           (cond-> v
                             (map? v)              route-map-handler
                             (simple-symbol? v)    lazy-ns-handler
                             (qualified-symbol? v) lazy-handler))))

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
