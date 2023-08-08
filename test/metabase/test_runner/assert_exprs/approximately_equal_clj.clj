(ns metabase.test-runner.assert-exprs.approximately-equal-clj
  "Method implementations for the Hawk (Clj) version of `=?`."
  (:require
   [clojure.pprint :as pprint]
   [malli.core :as mc]
   [malli.error :as me]
   [mb.hawk.assert-exprs.approximately-equal :as hawk.approx]
   [methodical.core :as methodical]))

(set! *warn-on-reflection* true)

(methodical/defmethod hawk.approx/=?-diff [java.util.regex.Pattern clojure.lang.Symbol]
  [expected-re sym]
  (hawk.approx/=?-diff expected-re (name sym)))

;; TODO -- figure out how to make this work in Cljs as well!

(deftype ^:private Malli [schema])

(defn read-malli [form]
  (->Malli (eval form)))

(defmethod print-method Malli
  [this writer]
  ((get-method print-dup Malli) this writer))

(defmethod print-dup Malli
  [^Malli this ^java.io.Writer writer]
  (.write writer (format "#hawk/malli %s" (pr-str (.schema this)))))

(defmethod pprint/simple-dispatch Malli
  [^Malli this]
  (pprint/pprint-logical-block
   :prefix "#hawk/malli " :suffix nil
   (pprint/write-out (.schema this))))

(methodical/defmethod hawk.approx/=?-diff [Malli :default]
  [^Malli malli value]
  (me/humanize (mc/explain (.schema malli) value)))
