(ns hooks.clojure.test
  (:require [clj-kondo.hooks-api :as hooks]))

(def disallowed-parallel-forms
  '#{with-redefs
     clojure.core/with-redefs
     metabase.test/with-temporary-setting-values
     mt/with-temporary-setting-values})

(defn- warn-about-disallowed-parallel-forms [form]
  (letfn [(f [form]
            (when-let [sexpr (when (hooks/token-node? form)
                               (hooks/sexpr form))]
              (when (disallowed-parallel-forms sexpr)
                (hooks/reg-finding! (assoc (meta form)
                                           :message (format "%s is not allowed inside a ^:parallel test" sexpr)
                                           :type :metabase/validate-deftest)))))
          (walk [form]
            (f form)
            (doseq [child (:children form)]
              (walk child)))]
    (walk form)))

(defn- deftest-check-parallel
  "1. Check if test is marked ^:parallel / ^:synchronized correctly
   2. Make sure disallowed forms are not used in ^:parallel tests"
  [{[_ test-name & body] :children, :as _node}]
  (let [test-metadata     (:meta test-name)
        metadata-sexprs   (map hooks/sexpr test-metadata)
        combined-metadata (transduce
                           (map (fn [x]
                                  (if (map? x)
                                    x
                                    {x true})))
                           (completing merge)
                           {}
                           metadata-sexprs)
        parallel?     (:parallel combined-metadata)
        synchronized? (:synchronized combined-metadata)]
    (when (and parallel? synchronized?)
      (hooks/reg-finding! (assoc (meta test-name)
                                 :message "Test should not be marked both ^:parallel and ^:synchronized"
                                 :type :metabase/validate-deftest)))
    ;; only when the custom `:metabase/deftest-not-marked-parallel` is enabled: complain if tests are not explicitly
    ;; marked `^:parallel` or `^:synchronized`. This is mostly to encourage people to mark everything `^:parallel` in
    ;; places like `metabase.lib` tests unless there is a really good reason not to.
    (when-not (or parallel? synchronized?)
      (hooks/reg-finding!
       (assoc (meta test-name)
              :message "Test should be marked either ^:parallel or ^:synchronized"
              :type :metabase/deftest-not-marked-parallel-or-synchronized)))
    (when parallel?
      (doseq [form body]
        (warn-about-disallowed-parallel-forms form)))))

(defn deftest [{:keys [node cljc lang]}]
  ;; run [[deftest-check-parallel]] only once... if this is a `.cljc` file only run it for the `:clj` analysis, no point
  ;; in running it twice.
  (when (or (not cljc)
            (= lang :clj))
    (deftest-check-parallel node))
  {:node node})

;;; this is a hacky way to determine whether these namespaces are required in the `ns` form or not... basically `:ns`
;;; will come back as `nil` if they are not.
(defn- approximately-equal-ns-required? []
  (= (:ns (hooks/resolve {:name 'metabase.test-runner.assert-exprs.approximately-equal/=?-report}))
     'metabase.test-runner.assert-exprs.approximately-equal))

(defn- malli-equals-ns-required? []
  (= (:ns (hooks/resolve {:name 'metabase.test-runner.assert-exprs.malli-equals/malli=-report}))
     'metabase.test-runner.assert-exprs.malli-equals))

(defn- warn-about-missing-test-expr-requires-in-cljs [{:keys [children], :as _is-node}]
  (let [[_is assertion-node] children]
    (when (hooks/list-node? assertion-node)
      (let [[assertion-symb-node] (:children assertion-node)]
        (when (hooks/token-node? assertion-symb-node)
          (let [assertion-symb-token (hooks/sexpr assertion-symb-node)
                warn!                (fn [ns-to-require]
                                       (hooks/reg-finding!
                                        (assoc (meta assertion-symb-node)
                                               :message (format "You must require %s to use %s in ClojureScript"
                                                                ns-to-require
                                                                assertion-symb-token)
                                               :type :metabase/missing-test-expr-requires-in-cljs)))]
            (condp = assertion-symb-token
              '=?
              (when-not (approximately-equal-ns-required?)
                (warn! 'metabase.test-runner.assert-exprs.approximately-equal))

              'malli=
              (when-not (malli-equals-ns-required?)
                (warn! 'metabase.test-runner.assert-exprs.malli-equals))

              nil)))))))

(defn is [{:keys [node lang]}]
  (when (= lang :cljs)
    (warn-about-missing-test-expr-requires-in-cljs node))
  {:node node})
