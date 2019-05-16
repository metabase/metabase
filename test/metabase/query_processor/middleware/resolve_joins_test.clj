(ns metabase.query-processor.middleware.resolve-joins-test
  (:require [metabase.query-processor.middleware.resolve-joins :as resolve-joins]
            [expectations :refer [expect]]))

;; Does the middleware function if the query has no joins?
(expect
  {}
  (#'resolve-joins/resolve-joins* {}))

;; Does joining the same table twice without an explicit alias give both joins unique aliases?
