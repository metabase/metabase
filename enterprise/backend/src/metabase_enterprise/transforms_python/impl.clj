(ns metabase-enterprise.transforms-python.impl
  (:require
   [metabase.transforms.interface :as transforms.i]))

(transforms.i/register-runner! :python)

(defmethod transforms.i/lang-config :python [_]
  {:runtime "python"
   :label "Python"
   :timing-key :python-execution})