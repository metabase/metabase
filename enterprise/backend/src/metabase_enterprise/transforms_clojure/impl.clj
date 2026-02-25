(ns metabase-enterprise.transforms-clojure.impl
  "Registers :clojure as a runner language. Loaded by transforms-clojure/init.clj for side effects.
  See transforms.interface/register-runner! and transforms.interface/lang-config."
  (:require
   [metabase.transforms.interface :as transforms.i]))

(transforms.i/register-runner! :clojure)

(defmethod transforms.i/lang-config :clojure [_]
  {:runtime "clojure"
   :label "Clojure"
   :timing-key :clojure-execution})