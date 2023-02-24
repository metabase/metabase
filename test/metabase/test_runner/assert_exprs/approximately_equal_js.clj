(ns metabase.test-runner.assert-exprs.approximately-equal-js)

;; this is only supposed to be a thing when doing macroexpansion FOR ClojureScript, and `cljs.test` isn't available in
;; regular Clojure mode. For some reason I couldn't get Macrovich to do what I wanted here
(try
  (require 'cljs.test)
  #_{:clj-kondo/ignore [:unresolved-namespace]}
  (defmethod cljs.test/assert-expr '=?
    [_env message [_ & form]]
    (let [[expected actual] (case (count form)
                              2 form
                              (throw (ex-info "=? expects exactly 2 arguments" {:form form})))]
      `(cljs.test/do-report (metabase.test-runner.assert-exprs.approximately-equal/=?-report ~message ~expected ~actual))))
  (catch Throwable _))
