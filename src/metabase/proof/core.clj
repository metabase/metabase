(ns metabase.proof.core
  "`proof` module API namespace: proofs, the unforgeable values that a proof-gated model's mutation functions take as
  their only argument. See [[metabase.proof.impl]] for the design."
  (:require
   [metabase.proof.impl]
   [potemkin :as p]))

(comment metabase.proof.impl/keep-me)

(p/import-vars
 [metabase.proof.impl
  authorize-create
  authorize-delete
  authorize-update
  cascade
  cascade-parents
  cascade-write
  proof?
  provisioning
  serdes-load
  subject-kind
  test-only
  verify])
