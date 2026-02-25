(ns metabase-enterprise.transforms-julia.impl
  (:require
   [metabase.transforms.interface :as transforms.i]))

(transforms.i/register-runner! :julia)

(defmethod transforms.i/lang-config :julia [_]
  {:runtime "julia"
   :label "Julia"
   :timing-key :julia-execution})