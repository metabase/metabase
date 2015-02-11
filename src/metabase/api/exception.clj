(ns metabase.api.exception)

(gen-class :name metabase.api.exception.APIException
           :extends java.lang.Exception
           :prefix "-"
           :state state
           :init init
           :constructors {[Integer String] [String]}
           :methods [[getStatusCode [] Integer]])

(defn -init [^Integer status-code ^String message]
  [[message] status-code])

(defn -getStatusCode [this]
  (.state this))

;; compile this file (generating the class) when it is loaded (this is questionable)
(when-not *compile-files*
  (compile 'metabase.api.exception))
