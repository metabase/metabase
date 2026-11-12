(ns metabase.linters.eastwood
  (:require
   [eastwood.lint :as eastwood]
   [metabase.linters.common :as common])
  (:import (java.io File)))

(set! *warn-on-reflection* true)

(def ^:private ignored-faults
  "Linters to skip in a whole namespace, for findings that are deliberate.
  Eastwood can also match a line, but those entries break whenever an unrelated edit moves the code."
  '{:deprecations
    {;; every `Liquibase.update` overload that writes SQL to a `Writer` is deprecated; the replacement is the
     ;; command API
     metabase.app-db.liquibase      true
     ;; `(URL. s)`: `URI` parses differently, and these check URLs that will then be fetched with `URL`'s own parsing
     metabase.driver.mysql          true
     metabase.driver.sqlite         true
     metabase.llm.provider.settings true
     metabase.llm.settings          true
     metabase.server.middleware.ssl true
     metabase.util.http             true
     ;; specmonstah has no replacement for `spec-gen-assoc-relations`
     metabase.test.generate         true}

    :unused-ret-vals-in-try
    {;; `reduce-kv` run for its side effects, chosen for speed
     metabase.util.log true}

    :unused-ret-vals
    {;; a spy that calls the real function for its side effect
     metabase-enterprise.search.semantic.migration-test true
     ;; `Class/forName` to load the JDBC driver class
     metabase.driver.presto-jdbc-test                   true}

    ;; `(is true)` in branches that skip a test, or that follow a call whose only check is that it didn't throw
    :suspicious-test
    {metabase-enterprise.search.entity-retrieval.appdb-mode-test  true
     metabase-enterprise.search.semantic.appdb-pgvector-mode-test true
     ;; `ts/with-db` wraps its body in `testing`, and Eastwood can't see that its value is used
     metabase-enterprise.serialization.v2.metric-dimensions-test  true
     metabase.driver.clickhouse-impersonation-test                true
     metabase.driver.mongo-test                                   true}

    :constant-test
    {metabase-enterprise.search.entity-retrieval.appdb-mode-test  true
     metabase-enterprise.search.semantic.appdb-pgvector-mode-test true
     metabase.driver.clickhouse-impersonation-test                true
     metabase.driver.mongo-test                                   true
     ;; macro tests over literal arguments
     metabase.util-test                                           true
     metabase.util.match-test                                     true}

    :def-in-def
    {;; these tests check `defsetting` itself
     metabase.settings.models.setting-test true}
    ;; this test checks `defsetting` in another namespace
    :wrong-ns-form {metabase.settings.models.setting-test true}})

(def ^:private default-options
  {:config-files   ["test_resources/eastwood_config.clj"]
   :ignored-faults ignored-faults})

(defn eastwood
  "Entrypoint for running Eastwood from the CLI. Adds some programatically-determined config options. See comments in
  `deps.edn` for usage instructions."
  [options]
  (eastwood/eastwood-from-cmdline
   (merge
    default-options
    {:source-paths (common/source-paths)}
    options)))

(defn eastwood-tests
  "Entry-point for the :eastwood/test alias. Derives :source-paths from classpath directories
  whose basename is `test` so we don't have to hardcode the per-driver test paths in deps.edn —
  they're already on the classpath via :drivers-dev's :extra-paths. Excludes `.clj-kondo/test`,
  which is for clj-kondo hook tests and uses a different toolchain."
  [options]
  (eastwood/eastwood-from-cmdline
   (merge
    default-options
    {:source-paths (filterv (fn [^File f]
                              (and (= "test" (.getName f))
                                   (not= ".clj-kondo" (some-> (.getParentFile f) .getName))))
                            (common/source-paths))}
    options)))
