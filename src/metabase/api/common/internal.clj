(ns metabase.api.common.internal
  "Internal functions used by [[metabase.api.common]]."
  (:require
   [clojure.walk :as walk]
   [malli.core :as mc]
   [metabase.util :as u]
   [metabase.util.regex :as u.regex]
   [potemkin.types :as p.types]))

(set! *warn-on-reflection* true)

(defn route-arg-keywords
  "Return a sequence of keywords for URL args in string `route`.

    (route-arg-keywords \"/:id/cards\") -> [:id]"
  [route]
  (->> (re-seq #":([\w-]+)" route)
       (map second)
       (map keyword)))

(defn- requiring-resolve-form [form]
  (walk/postwalk
   (fn [x]
     (if (symbol? x)
       (try @(requiring-resolve x)
            (catch Exception _ x)) x))
   form))

(defn ->matching-regex
  "Note: this is called in a macro context, so it can potentially be passed a symbol that resolves to a schema."
  [schema]
  (let [schema (try
                 #_{:clj-kondo/ignore [:discouraged-var]}
                 (eval schema)
                 (catch Exception _
                   (requiring-resolve-form schema)))]
    (or (:api/regex (mc/properties schema))
        (let [schema-type (mc/type schema)]
          (condp = schema-type
            ;; can use any regex directly
            :re       (first (mc/children schema))
            :keyword  #"[\S]+"
            'pos-int? #"[1-9]\d*"
            :int      #"-?\d+"
            'int?     #"-?\d+"
            :uuid     u/uuid-regex
            'uuid?    u/uuid-regex
            :or       (let [child-regexes (map ->matching-regex (mc/children schema))]
                        (when (every? some? child-regexes)
                          (u.regex/re-or child-regexes)))
            nil)))))

(p.types/defprotocol+ EndpointResponse
  "Protocol for transformations that should be done to the value returned by a `defendpoint` form before it
  Compojure/Ring see it."
  (wrap-response-if-needed [this]
    "Transform the value returned by a `defendpoint` form as needed, e.g. by adding `:status` and `:body`."))

;;; `metabase.server.streaming_response.StreamingResponse` has its own impl in [[metabase.server.streaming-response]]
(extend-protocol EndpointResponse
  Object
  (wrap-response-if-needed [this]
    {:status 200, :body this})

  nil
  (wrap-response-if-needed [_]
    {:status 204, :body nil})

  clojure.lang.IPersistentMap
  (wrap-response-if-needed [m]
    (if (and (:status m) (contains? m :body))
      m
      {:status 200, :body m})))
