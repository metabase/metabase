(ns metabase-enterprise.library-branching.external
  "The check of a checkout in the Metabase JAR, for a CI flow: the check of the lightweight checker, with the typing of
  each query against the manifest in its semantic level. It needs no app DB and no web server.

    java -jar metabase.jar library-branching-check <checkout> [--manifest <file>]"
  (:require
   [metabase-enterprise.library-branching.check :as check]
   [metabase-enterprise.library-branching.typing :as typing]))

(set! *warn-on-reflection* true)

(defn check
  "`check/check` of the tree `files`, `{path bytes}`, with `opts` (`:manifest`, the bytes of a manifest), with
  `typing/semantic` as its semantic check."
  [files opts]
  (check/check files (assoc opts :semantic typing/semantic)))

(defn command!
  "Checks directory `checkout` as [[check]], with the manifest at `(:manifest options)`, or at `manifest/path` in
  `checkout` when that file exists, and prints the report of `check/report`. Returns nil for a green check; throws
  ex-info with `:cmd/exit` for a red check, so that the command exits with code 1."
  [checkout options]
  (when-not (zero? (check/run checkout (:manifest options) {:semantic typing/semantic}))
    (throw (ex-info "The check of the checkout is red." {:cmd/exit true}))))
