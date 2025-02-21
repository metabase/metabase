(ns metabase.api.common.internal
  "Internal functions used by [[metabase.api.common]]."
  (:require
   [clojure.walk :as walk]
   [malli.core :as mc]
   [malli.transform :as mtx]
   [metabase.server.streaming-response]
   [metabase.util :as u]
   [potemkin.types :as p.types])
  (:import
   (metabase.server.streaming_response StreamingResponse)))

(set! *warn-on-reflection* true)

(comment metabase.server.streaming-response/keep-me)

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
  (let [schema      (try #_:clj-kondo/ignore
                     (eval schema)
                         (catch Exception _ #_:clj-kondo/ignore
                                (requiring-resolve-form schema)))
        schema-type (mc/type schema)]
    [schema-type
     (condp = schema-type
       ;; can use any regex directly
       :re       (first (mc/children schema))
       :keyword  #"[\S]+"
       'pos-int? #"[0-9]+"
       :int      #"-?[0-9]+"
       'int?     #"-?[0-9]+"
       :uuid     u/uuid-regex
       'uuid?    u/uuid-regex
       nil)]))

(def defendpoint-transformer
  "Transformer used on values coming over the API via defendpoint."
  (mtx/transformer
   (mtx/string-transformer)
   (mtx/json-transformer)
   (mtx/default-value-transformer)))

(p.types/defprotocol+ EndpointResponse
  "Protocol for transformations that should be done to the value returned by a `defendpoint` form before it
  Compojure/Ring see it."
  (wrap-response-if-needed [this]
    "Transform the value returned by a `defendpoint` form as needed, e.g. by adding `:status` and `:body`."))

(extend-protocol EndpointResponse
  Object
  (wrap-response-if-needed [this]
    {:status 200, :body this})

  nil
  (wrap-response-if-needed [_]
    {:status 204, :body nil})

  StreamingResponse
  (wrap-response-if-needed [this]
    this)

  clojure.lang.IPersistentMap
  (wrap-response-if-needed [m]
    (if (and (:status m) (contains? m :body))
      m
      {:status 200, :body m})))
