(ns metabase.test-runner.assert-exprs.approximately-equal-js)

;; this is only supposed to be a thing when doing macroexpansion FOR ClojureScript, and `cljs.test` isn't available in
;; regular Clojure mode. For some reason I couldn't get Macrovich to do what I wanted here
;;
;; this is done in a preposterous way so that Cloverage doesn't trip up trying to compile it
;; TODO: Try to get this working again. The issue was likely that Macrovich's `case` doesn't work outside `defmacro`.
;; It can't be in a helper function.
(when-let [assert-expr (try
                         (requiring-resolve 'cljs.test/assert-expr)
                         (catch Throwable _))]
  (defmethod (var-get assert-expr) '=?
    [_env message [_ & form]]
    (let [[expected actual] (case (count form)
                              2 form
                              (throw (ex-info "=? expects exactly 2 arguments" {:form form})))]
      `(cljs.test/do-report (metabase.test-runner.assert-exprs.approximately-equal/=?-report ~message ~expected ~actual)))))
