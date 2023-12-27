(ns hooks.clojure.core
  (:require
   [clj-kondo.hooks-api :as hooks]
   [clojure.string :as str]))

(defn- node->qualified-symbol [node]
  (try
    (when (hooks/token-node? node)
      (let [sexpr (hooks/sexpr node)]
        (when (symbol? sexpr)
          (when-let [resolved (hooks/resolve {:name sexpr})]
            (symbol (name (:ns resolved)) (name (:name resolved)))))))
    ;; some symbols like `*count/Integer` aren't resolvable.
    (catch Exception _
      nil)))

(def ^:private white-card-symbols
  '#{;; these toucan methods might actually set global values if it's used outside of a transaction,
     ;; but since mt/with-temp runs in a transaction, so we'll ignore them in this case.
     toucan2.core/delete!
     toucan2.core/update!
     toucan2.core/insert!})

(defn- end-with-exclamation?
  [s]
  (str/ends-with? s "!"))

(defn- unsafe-forms-should-end-with-exclamation*
  [{[defn-or-defmacro form-name] :children, :as node}]
  (when-not (end-with-exclamation? (:string-value form-name))
    (letfn [(walk [f form]
              (f form)
              (doseq [child (:children form)]
                (walk f child)))]
      (walk (fn [form]
              (when-let [qualified-symbol (node->qualified-symbol form)]
                (when (and (not (contains? white-card-symbols qualified-symbol))
                           (end-with-exclamation? qualified-symbol))
                  (hooks/reg-finding! (assoc (meta form-name)
                                             :message (format "The name of this %s should end with `!` because it contains calls to not thread safe form `%s`."
                                                              (:string-value defn-or-defmacro) qualified-symbol)
                                             :type :metabase/defmacro-in-test-contains-unthread-safe-functions)))))
            node))
    node))

(defn unsafe-forms-should-end-with-exclamation
  "Used to ensure defn and defmacro in test namespace to have name ending with `!` if it's not thread-safe.

  A function or a macro can be defined as 'not thread safe' when their funciton name ends with a `!`."
  [{:keys [node cljc lang]}]
  (when (or (not cljc)
            (= lang :clj))
    (unsafe-forms-should-end-with-exclamation* node))
  {:node node})

(comment
 (require '[clj-kondo.core :as clj-kondo])
 (def form (str '(defmacro a
                   [x]
                   `(fun-call x))))

 (def form "(defmacro a
           [x]
           `(some! ~x))")
 (str (hooks/parse-string form))
 (hooks/sexpr (hooks/parse-string form))
 (binding [hooks/*reload* true]
    (-> form
        (with-in-str (clj-kondo/run! {:lint ["-"]}))
        :findings))
 (do (unsafe-forms-should-end-with-exclamation* (hooks/parse-string form))
     nil))
