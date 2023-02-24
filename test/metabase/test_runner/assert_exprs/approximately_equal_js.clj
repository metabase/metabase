(ns metabase.test-runner.assert-exprs.approximately-equal-js
  (:require [net.cgrand.macrovich :as macros]))

(macros/case
  :cljs
  (do
    (require 'cljs.test)
    #_{:clj-kondo/ignore [:unresolved-namespace]}
    (defmethod cljs.test/assert-expr '=?
      [_env message [_ & form]]
      (let [[expected actual] (case (count form)
                                2 form
                                (throw (ex-info "=? expects exactly 2 arguments" {:form form})))]
        `(cljs.test/do-report (metabase.test-runner.assert-exprs.approximately-equal/=?-report ~message ~expected ~actual))))))
