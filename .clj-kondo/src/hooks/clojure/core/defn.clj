(ns hooks.clojure.core.defn
  (:require
   [clj-kondo.hooks-api :as hooks]
   [clojure.string :as str]
   [hooks.clojure.core.def]
   [hooks.common]))

(defn- end-with-exclamation?
  [s]
  (str/ends-with? s "!"))

(defn- explicitly-safe? [config qualified-symbol]
  (contains? (get-in config [:linters :metabase/test-helpers-use-non-thread-safe-functions :explicitly-safe])
             qualified-symbol))

(defn- explicitly-unsafe? [config qualified-symbol]
  (contains? (get-in config [:linters :metabase/validate-deftest :parallel/unsafe]) qualified-symbol))

(defn- unsafe? [config qualified-symbol]
  (and (or (end-with-exclamation? qualified-symbol)
           (explicitly-unsafe? config qualified-symbol))
       (not (explicitly-safe? config qualified-symbol))))

(defn- non-thread-safe-form-should-end-with-exclamation*
  [{[defn-or-defmacro form-name] :children, :as node} config]
  (when-not (and (:string-value form-name)
                 (end-with-exclamation? (:string-value form-name)))
    (letfn [(walk [f form]
              (f form)
              (doseq [child (:children form)]
                (walk f child)))
            (check-node [form]
              (when-let [qualified-symbol (hooks.common/node->qualified-symbol form)]
                (when (unsafe? config qualified-symbol)
                  (hooks/reg-finding!
                   (assoc (meta form-name)
                          :message (format "The name of this %s should end with `!` because it contains calls to non thread safe form `%s`. [:metabase/test-helpers-use-non-thread-safe-functions]"
                                           (:string-value defn-or-defmacro) qualified-symbol)
                          :type :metabase/test-helpers-use-non-thread-safe-functions)))))]
      (walk check-node node))
    node))

(defn non-thread-safe-form-should-end-with-exclamation
  "Used to ensure defn and defmacro in test namespace to have name ending with `!` if it's non-thread-safe.
  A function or a macro can be defined as 'not thread safe' when their funciton name ends with a `!`.

  Only used in tests to identify thread-safe/non-thread-safe test helpers. See #37126"
  [{:keys [node cljc lang config]}]
  (when (or (not cljc)
            (= lang :clj))
    (non-thread-safe-form-should-end-with-exclamation* node config))
  {:node node})

(defn lint-defn [x]
  (non-thread-safe-form-should-end-with-exclamation x)
  (hooks.clojure.core.def/lint-def* x)
  x)

(comment
  (require '[clj-kondo.core :as clj-kondo])
  (def form (str '(defmacro a
                    [x]
                    `(fun-call x))))

  (def form "(defmacro a
           [x]
           `(some! ~x))")

  (def form "(defun f
           [x]
           (let [g! (fn [] 1)]
           (g!)))")

  (str (hooks/parse-string form))
  (hooks/sexpr (hooks/parse-string form))

  (binding [hooks/*reload* true]
    (-> form
        (with-in-str (clj-kondo/run! {:lint ["-"]}))
        :findings))

  (do (non-thread-safe-form-should-end-with-exclamation* (hooks/parse-string form)) nil))
