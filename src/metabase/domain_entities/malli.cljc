(ns metabase.domain-entities.malli
  (:refer-clojure :exclude [defn])
  (:require
    [malli.core :as mc]
    [malli.util :as mut]
    #?@(:clj  ([metabase.util.malli :as mu]
               [net.cgrand.macrovich :as macros])
        :cljs ([malli.instrument]
               [metabase.domain-entities.converters])))
  #?(:cljs (:require-macros [metabase.domain-entities.malli])))

;; Experimental JS->CLJS bridge
;; - Pass vanilla JS objects to functions written with a defn macro
;; - It wraps mu/defn and uses the Malli schemas to determine which arguments need conversion with `cljs-bean`.
;;   - Use recursive beaning, or something like it, for all Clojure-side access and usage.

;; I think this is the most practical and TS-native approach. Clojure is a lot more flexible, with macros and dynamic
;; typing, so it should be the one jumping through the hoops. Of course performance is a question but there's still
;; hope. We can assume (deep) immutability so there's lots of room for caching of eg. key conversion.

#?(:clj
   (defmacro defn
     "In Clojure this is simply [[mu/defn]].

     That breaks CLJS advanced compilation since it returns a `let` and not a `defn`.
     So in CLJS this is just [[clojure.core/defn]]."
     [sym _ return-schema docs args & body]
     (macros/case
       :clj  `(mu/defn ~sym :- ~return-schema ~docs ~args ~@body)
       :cljs `(clojure.core/defn ~sym ~docs ~(mapv first (partition 3 args)) ~@body))))

(clojure.core/defn schema-for-path
  "Given a schema and a *value path* (as opposed to a *schema path*), finds the schema for that
  path. Throws if there are multiple such paths and those paths have different schemas."
  [schema path]
  (let [paths (-> schema mc/schema (mut/in->paths path))]
    (cond
      (empty? paths)      (throw (ex-info "Path does not match schema" {:schema schema :path path}))
      (= (count paths) 1) (mut/get-in schema (first paths))
      :else (let [child-schemas (map #(mut/get-in schema %) paths)]
              (if (apply = child-schemas)
                (first child-schemas)
                (throw (ex-info "Value path has multiple schema paths, with different schemas"
                                {:schema        schema
                                 :paths         paths
                                 :child-schemas child-schemas})))))))

#?(:clj
   (defmacro def-getters-and-setters
     "Generates an accessor (`get-in`) and updater (`assoc-in`) for each specified path.

     For example:
     ```
     (def-getters-and-setters Question
       dataset-query [:card :dataset-query]
       cache-ttl     [:card :cache-ttl])
     ```
     will generate:
     ```
     (mu/defn ^:export dataset-query :- DatasetQuery
       \"Accessor for [:card :dataset-query].\"
       [obj :- Question]
       (get-in obj [:card :dataset-query]))

     (mu/defn ^:export with-dataset-query :- Question
       \"Updater for [:card :dataset-query].\"
       [obj :- Question new-value :- DatasetQuery]
       (assoc-in obj [:card :dataset-query] new-value))

     (mu/defn ^:export cache-ttl :- [:maybe number?]
       \"Accessor for [:card :cache-ttl].\"
       [obj :- Question]
       (get-in obj [:card :cache-ttl]))

     (mu/defn ^:export with-cache-ttl :- Question
       \"Updater for [:card :cache-ttl].\"
       [obj :- Question new-value :- number?]
       (assoc-in obj [:card :cache-ttl] new-value))
     ```

     You provide the schema for the parent object; the macro will examine that schema to
     determine the schema for the field being fetched or updated.

     The updater's name gets prefixed with `with-`."
     [schema & specs]
     (let [parts        (partition 2 specs)]
       `(do
          ~@(mapcat (fn [[sym path]]
                      (let [in-sym  (vary-meta (symbol (str "->" (name sym)))
                                               assoc :private true)
                            out-sym (vary-meta (symbol (str (name sym) "->"))
                                               assoc :private true)]
                        [;; Getter
                         `(clojure.core/defn
                            ~(vary-meta sym assoc :export true)
                            ~(str "Accessor for `" path "`.")
                            [obj#]
                            (get-in obj# ~path))

                         ;; Incoming converter for the replacement value.
                         `(def ~in-sym
                            ~(macros/case
                               :cljs (macros/case
                                       :cljs `(-> ~schema
                                                  (metabase.domain-entities.malli/schema-for-path ~path)
                                                  metabase.domain-entities.converters/incoming)
                                       :clj  `identity)))

                         ;; Setter
                         `(clojure.core/defn
                            ~(vary-meta (symbol (str "with-" (name sym)))
                                        assoc :export true)
                            ~(str "Updater for `" path "`.")
                            [obj# new-value#]
                            (assoc-in obj# ~path (~in-sym new-value#)))

                         ;; JS converter
                         (macros/case :cljs
                           `(def ~out-sym
                              (metabase.domain-entities.converters/outgoing
                                (metabase.domain-entities.malli/schema-for-path ~schema ~path))))

                         ;; JS-returning getter
                         (macros/case :cljs
                           `(clojure.core/defn
                              ~(vary-meta (symbol (str (name sym) "-js"))
                                          assoc :export true)
                              ~(str "Fetches `" path "` and converts it to plain JS.")
                              [obj#]
                              (~out-sym (~sym obj#))))]))
                    parts)))))
