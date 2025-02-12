(ns hooks.clojure.core
  (:require
   [clj-kondo.hooks-api :as hooks]
   [clojure.string :as str]
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

(defn- ns-form-node->require-node [ns-form-node]
  (some (fn [node]
          (when (and (hooks/list-node? node)
                     (let [first-child (first (:children node))]
                       (and (hooks/keyword-node? first-child)
                            (= (hooks/sexpr first-child) :require))))
            node))
        (:children ns-form-node)))

(defn- lint-require-shapes [ns-form-node]
  (doseq [node (-> ns-form-node
                   ns-form-node->require-node
                   :children
                   rest)]
    (cond
      (not (hooks/vector-node? node))
      (hooks/reg-finding! (assoc (meta node)
                                 :message "All :required namespaces should be wrapped in vectors [:metabase/require-shape-checker]"
                                 :type    :metabase/require-shape-checker))

      (hooks/vector-node? (second (:children node)))
      (hooks/reg-finding! (assoc (meta node)
                                 :message "Don't use prefix forms inside :require [:metabase/require-shape-checker]"
                                 :type    :metabase/require-shape-checker)))))

(defn- lint-requires-on-new-lines [ns-form-node]
  (let [[require-keyword first-require] (-> ns-form-node
                                            ns-form-node->require-node
                                            :children)]
    (when-let [require-keyword-line (:row (meta require-keyword))]
      (when-let [first-require-line (:row (meta first-require))]
        (when (= require-keyword-line first-require-line)
          (hooks/reg-finding! (assoc (meta first-require)
                                     :message "Put your requires on a newline from the :require keyword [:metabase/require-shape-checker]"
                                     :type    :metabase/require-shape-checker)))))))

(defn- require-node->namespace-symb-nodes [require-node]
  (let [[_ns & args] (:children require-node)]
    (into []
          ;; prefixed namespace forms are NOT SUPPORTED!!!!!!!!1
          (keep (fn [node]
                  (cond
                    (hooks/vector-node? node)
                    ;; propagate the metadata attached to this vector in case there's a `:clj-kondo/ignore` form.
                    (let [symbol-node (first (:children node))]
                      (hooks.common/merge-ignored-linters symbol-node require-node node))

                    ;; this should also be dead code since we require requires to be vectors
                    (hooks/token-node? node)
                    (hooks.common/merge-ignored-linters node require-node)

                    :else
                    (printf "Don't know how to figure out what namespace is being required in %s\n" (pr-str node)))))
          args)))

(defn- ns-form-node->ns-symb [ns-form-node]
  (some-> (some (fn [node]
                  (when (and (hooks/token-node? node)
                             (not= (hooks/sexpr node) 'ns))
                    node))
                (:children ns-form-node))
          hooks/sexpr))

(defn- module
  "E.g.

    (module 'metabase.qp.middleware.wow) => 'qp
    (module 'metabase-enterprise.whatever.core) => enterprise/whatever"
  [ns-symb]
  (or (some->> (re-find #"^metabase-enterprise\.([^.]+)" (str ns-symb))
               second
               (symbol "enterprise"))
      (some-> (re-find #"^metabase\.([^.]+)" (str ns-symb))
              second
              symbol)))

(defn- ignored-namespace? [ns-symb config]
  (some
   (fn [pattern-str]
     (re-find (re-pattern pattern-str) (str ns-symb)))
   (:ignored-namespace-patterns config)))

(defn- module-api-namespaces
  "Set API namespaces for a given module. `:any` means you can use anything, there are no API namespaces for this
  module (yet). If unspecified, the default is just the `<module>.core` namespace."
  [module config]
  (let [module-config (get-in config [:metabase/modules module :api])]
    (cond
      (= module-config :any)
      nil

      (set? module-config)
      module-config

      :else
      (let [ns-prefix (if (= (namespace module) "enterprise")
                        (str "metabase-enterprise." (name module))
                        (name module))]
        #{(symbol (str ns-prefix ".api"))
          (symbol (str ns-prefix ".core"))
          (symbol (str ns-prefix ".init"))}))))

(defn- lint-modules [ns-form-node config]
  (let [ns-symb (ns-form-node->ns-symb ns-form-node)]
    (when-not (ignored-namespace? ns-symb config)
      (when-let [current-module (module ns-symb)]
        (let [allowed-modules               (get-in config [:metabase/modules current-module :uses])
              required-namespace-symb-nodes (-> ns-form-node
                                                ns-form-node->require-node
                                                require-node->namespace-symb-nodes)]
          (doseq [node  required-namespace-symb-nodes
                  :when (not (contains? (hooks.common/ignored-linters node) :metabase/modules))
                  :let  [required-namespace (hooks/sexpr node)
                         required-module    (module required-namespace)]
                  ;; ignore stuff not in a module i.e. non-Metabase stuff.
                  :when required-module
                  :let  [in-current-module? (= required-module current-module)]
                  :when (not in-current-module?)
                  :let  [allowed-module?           (or (= allowed-modules :any)
                                                       (contains? (set allowed-modules) required-module))
                         module-api-namespaces     (module-api-namespaces required-module config)
                         allowed-module-namespace? (or (empty? module-api-namespaces)
                                                       (contains? module-api-namespaces required-namespace))]]
            (when-let [error (cond
                               (not allowed-module?)
                               (format "Module %s should not be used in the %s module. [:metabase/modules %s :uses]"
                                       required-module
                                       current-module
                                       current-module)

                               (not allowed-module-namespace?)
                               (format "Namespace %s is not an allowed external API namespace for the %s module. [:metabase/modules %s :api]"
                                       required-namespace
                                       required-module
                                       required-module))]
              (hooks/reg-finding! (assoc (meta node)
                                         :message error
                                         :type    :metabase/modules)))))))))

(defn lint-ns [x]
  (doto (:node x)
    lint-require-shapes
    lint-requires-on-new-lines
    (lint-modules (merge (get-in x [:config :linters :metabase/ns-module-checker])
                         (select-keys (:config x) [:metabase/modules]))))
  x)

(defn- check-arglists [report-node arglists]
  (letfn [(reg-bad-arglists! []
            (hooks/reg-finding!
             (assoc (meta report-node)
                    :message ":arglists should be a quoted list of vectors [:metabase/check-defmulti-arglists]"
                    :type :metabase/check-defmulti-arglists)))
          (reg-bad-arg! []
            (hooks/reg-finding!
             (assoc (meta report-node)
                    :message ":arglists should contain actual arg names, not underscore (unused) symbols [:metabase/check-defmulti-arglists]"
                    :type    :metabase/check-defmulti-arglists)))
          (underscore-arg? [arg]
            (and (symbol? arg)
                 (str/starts-with? arg "_")))
          (check-arglist [arglist]
            (cond
              (not (vector? arglist))        (reg-bad-arglists!)
              (some underscore-arg? arglist) (reg-bad-arg!)))]
    (if-not (and (seq? arglists)
                 (= (first arglists) 'quote)
                 (seq (second arglists)))
      (reg-bad-arglists!)
      (let [[_quote arglists] arglists]
        (doseq [arglist arglists]
          (check-arglist arglist))))))

(defn- defmulti-check-for-arglists-metadata
  "Make sure a [[defmulti]] has an attribute map with `:arglists` metadata."
  [node]
  (let [[_defmulti _symb & args] (:children node)
        [_docstring & args]      (if (hooks/string-node? (first args))
                                   args
                                   (cons nil args))
        attr-map                 (when (hooks/map-node? (first args))
                                   (first args))
        arglists                 (some-> attr-map hooks/sexpr :arglists seq)]
    (if (not (seq? arglists))
      (hooks/reg-finding!
       (assoc (meta node)
              :message "All defmultis should have an attribute map with :arglists metadata. [:metabase/check-defmulti-arglists]"
              :type    :metabase/check-defmulti-arglists))
      (check-arglists attr-map arglists))))

(defn lint-defmulti [x]
  (defmulti-check-for-arglists-metadata (:node x))
  x)
