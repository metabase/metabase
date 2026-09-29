(ns metabase.t3.api
  (:require [metabase.t3.impl]
            [potemkin :as p]))

(p/import-vars
 [metabase.t3.impl
  require-queries])
