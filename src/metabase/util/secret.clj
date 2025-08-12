(ns metabase.util.secret
  (:require
   [metabase.util.i18n :refer [trs]]
   [metabase.util.malli.registry :as mr]
   [potemkin :as p]
   [pretty.core :as pretty]))

(set! *warn-on-reflection* true)

;; Define a protocol for secrets to make things harder to accidentally expose.
(p/defprotocol+ ISecret
  (expose [this] "Expose the secret"))

(p/deftype+ Secret [value-fn]
  ISecret
  (expose [_this] (value-fn))

  Object
  (toString [_this] (trs "<< REDACTED SECRET >>"))

  pretty/PrettyPrintable
  (pretty [this]
    (.toString this)))

(defn secret
  "Create a `Secret` that can't be accidentally read without calling the `expose` method on it."
  [value]
  (->Secret (constantly value)))

(defn secret?
  "Whether `x` is an instance of a `Secret`."
  [x]
  (instance? metabase.util.secret.ISecret x))

(mr/def ::secret
  [:fn
   {:error/message "An instance of a Secret"}
   #'secret?])
