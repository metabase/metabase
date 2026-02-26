(ns metabase-enterprise.transforms-javascript.init
  (:require
   [metabase-enterprise.transforms-javascript.impl]
   [metabase-enterprise.transforms-runner.models.transform-library :as transform-library]))

(transform-library/ensure-builtin-library! "javascript")