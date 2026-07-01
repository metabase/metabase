(ns metabase-enterprise.transforms-test.core
  "API namespace for the transform test-run feature."
  (:require
   [metabase-enterprise.transforms-test.chain]
   [potemkin :as p]))

(p/import-vars
 [metabase-enterprise.transforms-test.chain
  run-chain-test!
  subgraph-input-tables
  run-card-chain-test!
  card-subgraph-input-tables])
