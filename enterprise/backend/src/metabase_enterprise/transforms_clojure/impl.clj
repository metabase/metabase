(ns metabase-enterprise.transforms-clojure.impl
  (:require
   [metabase.transforms.interface :as transforms.i]))

(transforms.i/register-runner! :clojure)

(defmethod transforms.i/lang-config :clojure [_]
  {:runtime "clojure"
   :label "Clojure"
   :timing-key :clojure-execution})