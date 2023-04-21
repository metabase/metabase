(ns hooks.methodical.macros
  (:refer-clojure :exclude [defmulti defmethod])
  (:require
   [clj-kondo.hooks-api :as hooks]))

;;; The code below is basically simulating the spec for parsing defmethod args without using spec. It uses a basic
;;; backtracking algorithm to achieve a similar result. Parsing defmethod args is kinda complicated.
;;;
;;; Unfortunately this is hardcoded to `:before`, `:after`, and `:around` as the only allowed qualifiers for now... at
;;; some point in the future we'll have to figure out how to fix this and support other qualifiers too.

(defn- bindings-vector? [x]
  (and (hooks/vector-node? x)
       (every? (some-fn hooks/token-node?
                        hooks/map-node?
                        hooks/vector-node?)
               (:children x))))

(defn- single-arity-fn-tail? [args]
  (bindings-vector? (first args)))

(defn- n-arity-fn-tail? [args]
  (and (seq args)
       (every? (fn [x]
                 (and (hooks/list-node? x)
                      (single-arity-fn-tail? (:children x))))
               args)))

(defn- fn-tail? [args]
  (or (single-arity-fn-tail? args)
      (n-arity-fn-tail? args)))

(defn- qualifier? [x]
  (and (hooks/keyword-node? x)
       (#{:before :after :around} (hooks/sexpr x))))

(defn- dispatch-value?
  "A dispatch value can be anything except for qualifier keyword or a list that looks like part of a n-arity function tail
  e.g. `([x] x)`."
  [x]
  (and (not (qualifier? x))
       (or (not (hooks/list-node? x))
           (not (single-arity-fn-tail? (:children x))))))

(defonce ^:private backtrack (Exception.))

(defn- parse-defmethod-args
  ([unparsed]
   (let [parses (atom [])]
     (try
       (parse-defmethod-args parses {} unparsed)
       (catch Exception _
         (when (zero? (count @parses))
           (throw (ex-info (format "Unable to parse defmethod args: %s" (pr-str (mapv hooks/sexpr unparsed)))
                           {:args (mapv hooks/sexpr unparsed)})))
         (when (> (count @parses) 1)
           (throw (ex-info (format "Ambiguous defmethod args: %s" (pr-str (mapv hooks/sexpr unparsed)))
                           {:args (mapv hooks/sexpr unparsed)
                            :parses @parses})))
         (first @parses)))))

  ([parses parsed unparsed]
   (cond
     (and (not (contains? parsed :qualifier))
          (qualifier? (first unparsed)))
     (try
       (parse-defmethod-args parses (assoc parsed :qualifier (first unparsed)) (rest unparsed))
       (catch Exception _
         (parse-defmethod-args parses (assoc parsed :qualifier nil) unparsed)))

     (and (not (contains? parsed :dispatch-value))
          (dispatch-value? (first unparsed)))
     (parse-defmethod-args parses (assoc parsed :dispatch-value (first unparsed)) (rest unparsed))

     (not (contains? parsed :dispatch-value))
     (throw backtrack)

     (and (not (contains? parsed :unique-key))
          (:qualifier parsed)           ; can only have unique keys for aux methods
          (not (hooks/string-node? (first unparsed)))
          (not (hooks/list-node? (first unparsed)))
          (not (hooks/vector-node? (first unparsed))))
     (try
       (parse-defmethod-args parses (assoc parsed :unique-key (first unparsed)) (rest unparsed))
       (catch Exception _
         (parse-defmethod-args parses (assoc parsed :unique-key nil) unparsed)))

     (and (not (contains? parsed :docstring))
          (hooks/string-node? (first unparsed)))
     (try
       (parse-defmethod-args parses (assoc parsed :docstring (first unparsed)) (rest unparsed))
       (catch Exception _
         (parse-defmethod-args parses (assoc parsed :docstring nil) unparsed)))

     (fn-tail? unparsed)
     (do
       (swap! parses conj (assoc parsed :fn-tail unparsed))
       (throw backtrack))

     :else
     (throw backtrack))))

(defn defmethod
  [{{[_ multimethod & args] :children, :as node} :node}]
  (#_println)
  #_(clojure.pprint/pprint (hooks/sexpr node))
  (let [parsed (parse-defmethod-args args)]
    #_(doseq [[k v] parsed]
        (println \newline k '=> (pr-str (some-> v hooks/sexpr))))
    (let [fn-tail     (:fn-tail parsed)
          other-stuff (dissoc parsed :fn-tail)
          result      (hooks/list-node
                       (concat
                        [(hooks/token-node 'do)
                         multimethod]
                        (filter some? (vals other-stuff))
                        [(-> (hooks/list-node
                              (list*
                               (hooks/token-node 'fn)
                               (hooks/token-node (if (contains? #{nil :around} (some-> (:qualifier parsed) hooks/sexpr))
                                                   'next-method
                                                   '__FN__NAME__THAT__YOU__CANNOT__REFER__TO__))
                               fn-tail))
                             (vary-meta update :clj-kondo/ignore conj :redundant-fn-wrapper))]))]
      #_(println "=>")
      #_(clojure.pprint/pprint (hooks/sexpr result))
      {:node result})))

;;; this stuff is for debugging things to make sure we didn't do something dumb
(comment
  (defn defmethod* [form]
    (binding [*print-meta* true]
      (clojure.pprint/pprint
       (hooks/sexpr (:node (defmethod {:node (hooks/parse-string (str form))}))))))

  (defmethod* '(defmethod mf :second [& _] 2))

  (defmethod* '(m/defmethod multi-arity :k
                 ([x]
                  {:x x})
                 ([x y]
                  {:x x, :y y})))

  (defmethod* '(m/defmethod mf1 :docstring
                 "Docstring"
                 [_x]))

  (defmethod* '(m/defmethod mf1 :around :dispatch-value
                 "Docstring"
                 [x]
                 (next-method x))))

(defn defmulti
  [{{[_ multimethod-name & args] :children, :as node} :node}]
  #_(clojure.pprint/pprint (hooks/sexpr node))
  (let [[docstring & args]         (if (hooks/string-node? (first args))
                                     args
                                     (cons nil args))
        [attribute-map & args]     (if (hooks/map-node? (first args))
                                     args
                                     (cons nil args))
        ;; if there wasn't a positional dispatch function arg passed just use (constantly nil) so Kondo won't complain
        [dispatch-fn & kv-options] (if (odd? (count args))
                                     args
                                     (cons (hooks/list-node
                                            (list
                                             (hooks/token-node 'clojure.core/constantly)
                                             (hooks/token-node 'nil)))
                                           args))]
    (let [defmulti-form (hooks/list-node
                         (filter
                          some?
                          [(hooks/token-node 'clojure.core/defmulti)
                           multimethod-name
                           docstring
                           attribute-map
                           dispatch-fn]))
          result   (hooks/list-node
                    (list*
                     (hooks/token-node 'do)
                     defmulti-form
                     kv-options))]
      #_(println "=>")
      #_(clojure.pprint/pprint (hooks/sexpr result))
      {:node result})))
