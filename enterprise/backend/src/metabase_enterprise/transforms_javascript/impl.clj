(ns metabase-enterprise.transforms-javascript.impl
  "Registers :javascript as a runner language. Loaded by transforms-javascript/init.clj for side effects.
  See transforms.interface/register-runner! and transforms.interface/lang-config."
  (:require
   [metabase.transforms.interface :as transforms.i]))

(transforms.i/register-runner! :javascript)

(defmethod transforms.i/lang-config :javascript [_]
  {:runtime "javascript"
   :label "JavaScript"
   :timing-key :javascript-execution})
