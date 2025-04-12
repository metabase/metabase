(ns tsp.trace
  (:require
   [clojure.java.io :as io]))

(set! *warn-on-reflection* true)

(defn- find-nses [^String ns-fragment]
  (->> (all-ns)
       (filter (fn [ns'] (let [^String s (-> ns' ns-name str)]
                           (.contains s ns-fragment))))))

(declare trace-ns* untrace-ns*)

(defn instrument
  [ns-fragment & {:keys [output-file]
                  :or {output-file (str "/tmp/trace." ns-fragment)}}]
  "Find all namespaces that contain `ns-fragment` and add a trace that writes to
  the specified output file (defaults to `tmp/trace.<ns-fragment>`).
  Call `(uninstrument ns-fragment)` to turn it off."
  (let [nses (find-nses ns-fragment)]
    (doseq [n nses]
      (trace-ns* output-file n))))

(defn instrument-multi
  "Find all namespaces that match any of the provided fragments and add traces
  that write to the specified output file. Call `(uninstrument-multi fragments)`
  to turn it off."
  [fragments output-file]
  (let [nses (->> fragments
                  (mapcat find-nses)
                  (distinct))]
    (doseq [n nses]
      (trace-ns* output-file n))))

(defn uninstrument
  [ns-fragment]
  (let [nses (find-nses ns-fragment)]
    (doseq [n nses]
      (untrace-ns* n))))

(defn uninstrument-multi
  "Untrace all namespaces that match any of the provided fragments."
  [fragments]
  (let [nses (->> fragments
                  (mapcat find-nses)
                  (distinct))]
    (doseq [n nses]
      (untrace-ns* n))))

(def ^{:doc "Current stack depth of traced function calls." :private true :dynamic true}
  *trace-depth* 0)

(defn ^{:private true} tracer
  "This function is called by trace. Prints to standard output, but
may be rebound to do anything you like. 'name' is optional."
  [file-path name value]
  (with-open [w (io/writer file-path :append true)]
    (binding [*out* w
              *print-length* 40]
      (println (str "TRACE" (when name (str " " name)) ": " value)))))

(defn ^{:private true} trace-indent
  "Returns an indentation string based on *trace-depth*"
  []
  (apply str (take *trace-depth* (repeat "| "))))

(defn ^{:skip-wiki true} trace-fn-call
  "Traces a single call to a function f with args. 'name' is the
symbol name of the function."
  [file-suffix name f args]
  (let [id (gensym "t")]
    (tracer file-suffix id (str (trace-indent) (pr-str (cons name #_args []))))
    (let [value (binding [*trace-depth* (inc *trace-depth*)]
                  (apply f args))]
      (tracer file-suffix id (str (trace-indent) "=> " (if (instance? clojure.core.Eduction value)
                                                         "<<eduction>>"
                                                         (pr-str value))))
      value)))

(defn ^{:skip-wiki true} trace-var*
  "If the specified Var holds an IFn and is not marked as a macro, its
  contents is replaced with a version wrapped in a tracing call;
  otherwise nothing happens. Can be undone with untrace-var.

  In the unary case, v should be a Var object or a symbol to be
  resolved in the current namespace.

  In the binary case, ns should be a namespace object or a symbol
  naming a namespace and s a symbol to be resolved in that namespace."
  ([file-suffix ns s]
   (trace-var* file-suffix (ns-resolve ns s)))
  ([file-suffix v]
   (let [^clojure.lang.Var v (if (var? v) v (resolve v))
         ns (.ns v)
         s  (.sym v)]
     (if (and (ifn? @v) (-> v meta :macro not) (-> v meta ::traced not))
       (let [f @v
             vname (symbol (str ns "/" s))]
         (doto v
           (alter-var-root #(fn tracing-wrapper [& args]
                              (trace-fn-call file-suffix vname % args)))
           (alter-meta! assoc ::traced f)))))))

(defn ^{:skip-wiki true} untrace-var*
  "Reverses the effect of trace-var / trace-vars / trace-ns for the
  given Var, replacing the traced function with the original, untraced
  version. No-op for non-traced Vars.

  Argument types are the same as those for trace-var."
  ([ns s]
   (untrace-var* (ns-resolve ns s)))
  ([v]
   (let [^clojure.lang.Var v (if (var? v) v (resolve v))
         ns (.ns v)
         s  (.sym v)
         f  ((meta v) ::traced)]
     (when f
       (doto v
         (alter-var-root (constantly ((meta v) ::traced)))
         (alter-meta! dissoc ::traced))))))

(defmacro trace-vars
  "Trace each of the specified Vars.
  The arguments may be Var objects or symbols to be resolved in the current
  namespace."
  [& vs]
  `(do ~@(for [x vs]
           `(if (var? ~x)
              (trace-var* ~x)
              (trace-var* (quote ~x))))))

(defmacro untrace-vars
  "Untrace each of the specified Vars.
  Reverses the effect of trace-var / trace-vars / trace-ns for each
  of the arguments, replacing the traced functions with the original,
  untraced versions."
  [& vs]
  `(do ~@(for [x vs]
           `(if (var? ~x)
              (untrace-var* ~x)
              (untrace-var* (quote ~x))))))

(defn ^{:skip-wiki true} trace-ns*
  "Replaces each function from the given namespace with a version wrapped
  in a tracing call. Can be undone with untrace-ns. ns should be a namespace
  object or a symbol.

  No-op for clojure.core and clojure.tools.trace."
  [file-suffix ns]
  (let [ns (the-ns ns)]
    (when-not ('#{clojure.core clojure.tools.trace} (.name ns))
      (let [ns-fns (->> ns ns-interns vals (filter (comp fn? var-get)))]
        (doseq [f ns-fns]
          (trace-var* file-suffix f))))))

(defn ^{:skip-wiki true} untrace-ns*
  "Reverses the effect of trace-ns* for the given namespace, replacing each traced
  function with its original, untraced version."
  [ns]
  (let [ns (the-ns ns)]
    (when-not ('#{clojure.core clojure.tools.trace} (.name ns))
      (let [ns-fns (->> ns ns-interns vals (filter (comp fn? var-get)))]
        (doseq [f ns-fns]
          (untrace-var* f))))))
