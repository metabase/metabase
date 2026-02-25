(ns metabase-enterprise.transforms-r.impl
  (:require
   [metabase.transforms.interface :as transforms.i]))

(transforms.i/register-runner! :r)

(defmethod transforms.i/lang-config :r [_]
  {:runtime "r"
   :label "R"
   :timing-key :r-execution})