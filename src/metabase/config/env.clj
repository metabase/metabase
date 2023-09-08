(ns metabase.config.env
  #_{:clj-kondo/ignore [:discouraged-namespace]}
  (:require [environ.core]))

(def ^:dynamic *env*
  "Map of environment variables and system properties."
  #_{:clj-kondo/ignore [:discouraged-var]}
  environ.core/env)
