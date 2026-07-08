(ns metabase.api.common.internal
  "Internal functions used by [[metabase.api.common]]."
  (:require
   [clojure.string :as str]
   [clojure.walk :as walk]
   [malli.core :as mc]
   [metabase.util :as u]
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

(defn- all-non-nil
  [sequence]
  (when (every? some? sequence)
    sequence))

(defn ->matching-regex
  "Note: this is called in a macro context, so it can potentially be passed a symbol that resolves to a schema."
  [schema]
  (let [schema      (try #_:clj-kondo/ignore
                     (eval schema)
                         (catch Exception _ #_:clj-kondo/ignore
                                (requiring-resolve-form schema)))
        schema-type (mc/type schema)
        {regex :api/regex} (mc/properties schema)]
    [schema-type
     (or regex
         (condp = schema-type
           :or       (some->> (map (comp second ->matching-regex) (mc/children schema))
                              all-non-nil
                              (map str)
                              (str/join "|")
                              re-pattern)
           ;; can use any regex directly
           :re       (first (mc/children schema))
           :enum     (some->> (mc/children schema)
                              (map name)
                              all-non-nil
                              (str/join "|")
                              re-pattern)
           :keyword  #"[\S]+"
           'pos-int? #"[0-9]+"
           :int      #"-?[0-9]+"
           'int?     #"-?[0-9]+"
           :uuid     u/uuid-regex
           'uuid?    u/uuid-regex
           nil))]))

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
