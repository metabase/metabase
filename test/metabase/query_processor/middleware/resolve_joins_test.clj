(ns metabase.query-processor.middleware.resolve-joins-test
  (:require [expectations :refer [expect]]
            [metabase.query-processor.middleware.resolve-joins :as resolve-joins]))

;; Does the middleware function if the query has no joins?
(expect
  {}
  (#'resolve-joins/resolve-joins* {}))

;; TODO - Does joining the same table twice without an explicit alias give both joins unique aliases?
