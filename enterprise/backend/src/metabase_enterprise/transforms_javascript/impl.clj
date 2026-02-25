(ns metabase-enterprise.transforms-javascript.impl
  (:require
   [metabase.transforms.interface :as transforms.i]))

(transforms.i/register-runner! :javascript)

(defmethod transforms.i/lang-config :javascript [_]
  {:runtime "javascript"
   :label "JavaScript"
   :timing-key :javascript-execution})