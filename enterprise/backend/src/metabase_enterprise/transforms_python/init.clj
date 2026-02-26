(ns metabase-enterprise.transforms-python.init
  (:require
   [metabase-enterprise.transforms-python.impl]
   [metabase-enterprise.transforms-runner.models.transform-library :as transform-library]))

(transform-library/ensure-builtin-library! "python")