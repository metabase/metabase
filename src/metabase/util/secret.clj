(ns metabase.util.secret
  (:import (java.io Writer)))

(set! *warn-on-reflection* true)

;; Define a protocol for secrets to make things harder to accidentally expose.
(defprotocol ISecret
  (expose [this] "Expose the secret"))

(defrecord Secret [value-fn]
  ISecret
  (expose [_this] (value-fn))
  Object
  (toString [_this] "<< REDACTED SECRET >>"))

(defmethod print-method Secret
  [^Secret secret ^Writer writer]
  (.write writer (.toString secret)))

(defmethod print-dup Secret
  [^Secret secret ^Writer w]
  (.write w (.toString secret)))

(defn secret
  "Create a `Secret` that can't be accidentally read without calling the `expose` method on it."
  [value]
  (->Secret (constantly value)))
