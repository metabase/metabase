(ns metabase-enterprise.transforms-python.impl
  "Registers :python as a runner language. Loaded by transforms-python/init.clj for side effects.
  See transforms.interface/register-runner! and transforms.interface/lang-config."
  (:require
   [metabase.transforms.interface :as transforms.i]))

(transforms.i/register-runner! :python)

(defmethod transforms.i/lang-config :python [_]
  {:runtime "python"
   :label "Python"
   :timing-key :python-execution
   :extension ".py"})
