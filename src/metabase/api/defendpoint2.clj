(ns metabase.api.defendpoint2
  (:require
   [clojure.spec.alpha :as s]
   [clojure.string :as str]
   [compojure.core :as compojure]
   [malli.core :as mc]
   [malli.transform :as mtx]
   [metabase.api.common.internal :as internal]
   [metabase.config :as config]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [metabase.util.malli.schema :as ms]
   [ring.middleware.multipart-params :as mp]
   [metabase.util.malli.describe :as umd]))

;;; almost a copy of malli.experimental.lite, but optional is defined by [:maybe]

(declare make-schema)

(def ^{:dynamic true :private true} *options* nil)
(defn- -entry [[k v]]
  (let [optional (and (vector? v)
                      (= :maybe (first v)))]
    (cond-> [k] optional (conj {:optional true}) :always (conj (make-schema v)))))

(defn make-schema
  "Compile map-based syntax to Malli schema."
  [x]
  (mc/schema (if (map? x)
               (into [:map {:closed config/is-dev?}] (map -entry x))
               x)
             *options*))

;;; Parsing endpoint definition

(s/def ::defendpoint-args
  (s/cat
   :method symbol?
   :route  (some-fn string? sequential?)
   :docstr (s/? string?)
   :args   vector?
   :body   (s/* any?)))

(defn- make-schemas [query-spec]
  (when (map? query-spec)
    (into {} (for [[k v] query-spec
                   :let  [v (dissoc v :as)]]
               (case k
                 :responses [k (update-vals v (fn [v] `(make-schema ~(update-keys v keyword))))]
                 :as        nil
                 [k `(make-schema ~(update-keys v keyword))])))))

(defn- make-bindings [req-sym query-spec]
  (letfn [(walker [m prefix]
            (mapcat (fn [[k v]]
                      (cond
                        (= k :as)   [v (if (seq prefix)
                                         `(get-in ~req-sym ~prefix)
                                         req-sym)]
                        (symbol? k) [k `(get-in ~req-sym ~(conj prefix (keyword k)))]
                        (map? v)    (walker v (conj prefix (keyword k)))))
                    m))]
    (vec (walker query-spec []))))

(comment
  (= (make-bindings 'req1 '{:query-params {collection [:maybe :whatever]
                                           :as        query}
                            :body-params  {:some {:inner {value int?}}}
                            :as req})

     `[~'collection (get-in ~'req1 [:query-params :collection])
       ~'query      (get-in ~'req1 [:query-params])
       ~'value      (get-in ~'req1 [:body-params :some :inner :value])
       ~'req        ~'req1]))

;;; Documentation

(defn- schema-dox [schema]
  (let [opts (when (vector? schema) (second schema))]
    (if (map? opts)
      (str (:mb/doc opts (umd/describe schema))
           (when (:default opts)
             (format " (default: %s)" (:default opts))))
      (umd/describe schema))))

(defn route-dox
  "Prints a markdown route doc for defendpoint2"
  [method route docstr schemas body]
  (let [route-str (#'internal/endpoint-name method route)]
    (apply str
           (format "## `%s`\n\n" route-str)
           (u/add-period docstr)
           (when (#'internal/contains-superuser-check? body)
             "\n\nYou must be a superuser to do this.")
           (for [[k param->schema] schemas]
             (str (case k
                    :query-params "\n\n### Query Parameters\n"
                    :body-params  "\n\n### Body Parameters\n")
                  (str/join "\n"
                            (for [[param schema] param->schema]
                              (format "- **`%s`** - %s"
                                      (name param)
                                      #_{:clj-kondo/ignore [:discouraged-var]}
                                      (schema-dox (eval schema))))))))))

;;; Schema handling

(def ^:private MTX
  (mtx/transformer
   (mtx/key-transformer {:decode keyword})
   internal/defendpoint-transformer
   (mtx/default-value-transformer)
   mtx/strip-extra-keys-transformer))

(defn make-coercer-mw
  "Middleware"
  [schemas]
  (let [coercers (update-vals schemas #(mc/coercer % MTX))]
    (fn [handler]
      (fn
        ([req]
         (try
           (handler (into req (for [[k coercer] coercers]
                                [k (coercer (get req k))])))
           (catch clojure.lang.ExceptionInfo e
             (let [data (ex-data e)]
               (if (= ::mc/invalid-input (:type data))
                 (throw (ex-info (str "Invalid fields: " (->> data :data :explain :errors (map :in) (map name) (str/join ", ")))
                                 {:status-code     400
                                  :errors          (-> data :data :explain)
                                  :specific-errors (-> data :data :explain)}))
                 (throw e))))))
        ([req respond raise]
         ;; TODO: implement
         (comment req respond raise)
         )))))

;;; Macro

(defn- parse-defendpoint-args [args]
  (let [{:keys [method route docstr args body] :as parsed} (s/conform ::defendpoint-args args)]
    (when (= parsed ::s/invalid)
      (throw (ex-info (str "Invalid defendpoint args: " (s/explain-str ::defendpoint-args args))
                      (s/explain-data ::defendpoint-args args))))
    (let [fn-name      (internal/route-fn-name method route)
          orig-schemas (first args)
          schemas      (make-schemas orig-schemas)
          req-sym      (gensym "req")
          bindings     (make-bindings req-sym (first args))
          args         (into [req-sym] (rest args))
          docstr       (route-dox method route docstr orig-schemas body)]
      (when-not docstr
        (log/warn (u/format-color 'red "Warning: endpoint %s/%s does not have a docstring. Go add one."
                                  (ns-name *ns*) fn-name)))
      {:method   method
       :route    route
       :fn-name  fn-name
       :docstr   docstr
       :schemas  schemas
       :args     args
       :bindings bindings
       :body     body})))

(defmacro defendpoint2*
  "Impl macro for [[defendpoint2]]; don't use this directly."
  [{:keys [method route fn-name docstr schemas args bindings body]}]
  (let [method-kw       (#'metabase.api.common/method-symbol->keyword method)
        prep-route      #'compojure/prepare-route
        multipart?      (get (meta method) :multipart false)
        handler-wrapper (if multipart? mp/wrap-multipart-params identity)]
    `(let [coercer-mw# (make-coercer-mw ~schemas)]
       (def ~(vary-meta fn-name
                        assoc
                        :doc          docstr
                        :schemas      schemas
                        :is-endpoint? true)
         ;; The next form is a copy of `compojure/compile-route`, with the sole addition of the call to
         ;; `validate-param-values`. This is because to validate the request body we need to intercept the request
         ;; before the destructuring takes place. I.e., we need to validate the value of `(:body request#)`, and that's
         ;; not available if we called `compile-route` ourselves.
         (compojure/make-route
          ~method-kw
          ~(prep-route route)
          (~handler-wrapper
           (coercer-mw#
            (fn ~args
              (let ~bindings
                ~@body)))))))))

(defmacro defendpoint2
  "wut"
  [& args]
  (let [parsed (parse-defendpoint-args args)]
    `(defendpoint2* ~parsed)))

(comment
  (macroexpand '(defendpoint2 POST "/export"
                 [{:query-parameters {collection       [:maybe [:vector ms/PositiveInt]]
                                      all_collections  [:maybe ms/BooleanValue]
                                      settings         [:maybe ms/BooleanValue]
                                      data_model       [:maybe ms/BooleanValue]
                                      field_values     [:maybe ms/BooleanValue]
                                      database_secrets [:maybe ms/BooleanValue]}}]
                  (prn collection settings)))

  (mc/coerce (make-schema
              {:collection       [:maybe [:vector {:decode/string (fn [x] (cond (vector? x) x x [x]))} ms/PositiveInt]]
               :all_collections  [:and {:default true} ms/BooleanValue]
               :settings         [:and {:default true} ms/BooleanValue]
               :data_model       [:and {:default true} ms/BooleanValue]
               :field_values     [:maybe ms/BooleanValue]
               :database_secrets [:maybe ms/BooleanValue]})
             {"settings" "true"}
             MTX)

  (mc/coerce (schema
              {:collection [:maybe [:vector {:decode/string (fn [x] (cond (vector? x) x x [x]))} ms/PositiveInt]]
               :settings   [:and {:default true} ms/BooleanValue]})
             {:collection "1"
              :settings   "false"}
             MTX))
