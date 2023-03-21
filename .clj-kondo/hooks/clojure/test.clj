(ns hooks.clojure.test
  (:require [clj-kondo.hooks-api :as hooks]))

(def disallowed-parallel-forms
  '#{with-redefs
     clojure.core/with-redefs
     metabase.test/with-temporary-setting-values
     mt/with-temporary-setting-values})

(defn warn-about-disallowed-parallel-forms [form]
  (letfn [(f [form]
            (when-let [sexpr (and (hooks/token-node? form)
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

(defn deftest [{{[_ test-name & body] :children, :as node} :node}]
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
        (warn-about-disallowed-parallel-forms form))))
  {:node node})
