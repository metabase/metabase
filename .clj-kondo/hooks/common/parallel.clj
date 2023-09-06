(ns hooks.common.parallel
  (:require
   [clj-kondo.hooks-api :as hooks]
   [clojure.set :as set]
   [clojure.string :as str]))

;; TODO -- figure out how to move these to `config.edn`

#_{:clj-kondo/ignore [:metabase/check-for-missing-exclamation-points]}
(def thread-unsafe-forms
  "Things you should not be allowed to use inside parallel tests. Besides these, anything ending in `!` not whitelisted
  in [[allowed-parallel-forms]] is not allowed."
  '#{clojure.core/alter-var-root
     clojure.core/with-redefs
     clojure.core/with-redefs-fn
     clojure.java.io/delete-file
     metabase-enterprise.sandbox.test-util/with-gtaps
     metabase-enterprise.sandbox.test-util/with-gtaps-for-user
     metabase-enterprise.sandbox.test-util/with-user-attributes
     metabase-enterprise.test/with-gtaps
     metabase-enterprise.test/with-gtaps-for-user
     metabase-enterprise.test/with-user-attributes
     metabase.actions.test-util/with-actions
     metabase.actions.test-util/with-actions-disabled
     metabase.actions.test-util/with-actions-enabled
     metabase.actions.test-util/with-actions-test-data
     metabase.actions.test-util/with-actions-test-data-and-actions-enabled
     metabase.actions.test-util/with-actions-test-data-tables
     metabase.email-test/with-expected-messages
     metabase.email-test/with-fake-inbox
     metabase.test.data/with-empty-h2-app-db
     metabase.test.data/with-temp-copy-of-db
     metabase.test.data.users/with-group
     metabase.test.data.users/with-group-for-user
     metabase.test.persistence/with-persistence-enabled
     metabase.test.util.log/with-log-level
     metabase.test.util.log/with-log-messages-for-level
     metabase.test.util.misc/with-single-admin-user
     metabase.test.util.timezone/with-system-timezone-id
     metabase.test.util/discard-setting-changes
     metabase.test.util/throw-if-called
     metabase.test.util/with-column-remappings
     metabase.test.util/with-discard-model-updates
     metabase.test.util/with-discarded-collections-perms-changes
     metabase.test.util/with-env-keys-renamed-by
     metabase.test.util/with-locale
     metabase.test.util/with-non-admin-groups-no-root-collection-for-namespace-perms
     metabase.test.util/with-non-admin-groups-no-root-collection-perms
     metabase.test.util/with-temp-dir
     metabase.test.util/with-temp-env-var-value
     metabase.test.util/with-temp-file
     metabase.test.util/with-temp-vals-in-db
     metabase.test.util/with-temporary-raw-setting-values
     metabase.test.util/with-temporary-setting-values
     metabase.test.util/with-user-in-groups
     metabase.test/discard-setting-changes
     metabase.test/throw-if-called
     metabase.test/with-actions
     metabase.test/with-actions-disabled
     metabase.test/with-actions-enabled
     metabase.test/with-actions-test-data
     metabase.test/with-actions-test-data-and-actions-enabled
     metabase.test/with-actions-test-data-tables
     metabase.test/with-column-remappings
     metabase.test/with-discarded-collections-perms-changes
     metabase.test/with-discard-model-updates
     metabase.test/with-empty-h2-app-db
     metabase.test/with-env-keys-renamed-by
     metabase.test/with-expected-messages
     metabase.test/with-fake-inbox
     metabase.test/with-group
     metabase.test/with-group-for-user
     metabase.test/with-locale
     metabase.test/with-log-level
     metabase.test/with-log-messages-for-level
     metabase.test/with-non-admin-groups-no-root-collection-for-namespace-perms
     metabase.test/with-non-admin-groups-no-root-collection-perms
     metabase.test/with-persistence-enabled
     metabase.test/with-single-admin-user
     metabase.test/with-system-timezone-id
     metabase.test/with-temp
     metabase.test/with-temp-copy-of-db
     metabase.test/with-temp-dir
     metabase.test/with-temp-env-var-value
     metabase.test/with-temp-file
     metabase.test/with-temp-vals-in-db
     metabase.test/with-temporary-raw-setting-values
     metabase.test/with-temporary-setting-values
     metabase.test/with-user-in-groups
     toucan2.tools.with-temp/with-temp
     metabase.test.data.one-off-dbs/with-blank-db
     metabase.test.data.one-off-dbs/with-blueberries-db
     metabase.test.data.users/user-http-request
     metabase.test/user-http-request
     metabase.test.data.users/user-real-request
     metabase.test/user-real-request
     metabase.test.util.misc/object-defaults
     metabase.test/object-defaults
     lambdaisland.glogi/add-handler
     lambdaisland.glogi/set-levels
     lambdaisland.glogi/remove-handler
     metabase.test.sync/sync-survives-crash?
     metabase.test.transforms/with-test-transform-specs
     metabase.test.integrations.ldap/with-ldap-server
     metabase.test.integrations.ldap/with-active-directory-ldap-server
     metabase.test.domain-entities/with-test-domain-entity-specs
     metabase.analytics.snowplow-test/with-fake-snowplow-collector
     metabase.api.card-test/with-cards-in-readable-collection})

(def ^:private thread-safe-forms
  "These fns are destructive, but are probably fine inside ^:parallel tests because it usually means you're doing
  something to an atom or something like that."
  '#{clojure.core/assoc!
     clojure.core/compare-and-set!
     clojure.core/conj!
     clojure.core/disj!
     clojure.core/dissoc!
     clojure.core/persistent!
     clojure.core/pop!
     clojure.core/reset!
     clojure.core/reset-vals!
     clojure.core/run!
     clojure.core/swap!
     clojure.core/swap-vals!
     clojure.core/volatile!
     clojure.core/vreset!
     clojure.core/vswap!
     metabase.query-processor/process-query-and-save-execution!
     metabase.query-processor/process-query-and-save-with-max-results-constraints!
     metabase.query-processor.store/store-database!
     metabase.test.initialize/initialize-if-needed!
     clojure.core.async/close!
     clojure.core.async/alts!!
     clojure.core.async/<!!
     clojure.core.async/<!
     clojure.core.async/>!
     clojure.core.async/>!!
     clojure.core.async/poll!
     metabase.domain-entities.specs/add-to-hiearchy!
     schema.coerce/coercer!
     })

;;; TODO -- we should disallow `metabase.test/user-http-request` with any method other than `:get`

(defn node->qualified-symbol [node]
  (try
    (when (hooks/token-node? node)
      (let [sexpr (hooks/sexpr node)]
        (when (symbol? sexpr)
          (when-let [resolved (hooks/resolve {:name sexpr})]
            (symbol (name (:ns resolved)) (name (:name resolved)))))))
    ;; some symbols like `*count/Integer` aren't resolvable.
    (catch Exception _
      nil)))

(defn- ignored-linters [node]
  (when-let [sexpr (some-> node meta :clj-kondo/ignore hooks/sexpr)]
    (if (keyword? sexpr)
      #{sexpr}
      (set sexpr))))

(defn find-thread-unsafe-symbols
  "Walk `node` and call

    (f symbol-node qualified-symbol)

  For each thread-unsafe child node."
  [node f]
  (letfn [(check-node [node]
            (when-let [qualified-symbol (node->qualified-symbol node)]
              (cond
                (thread-unsafe-forms qualified-symbol)
                (f node qualified-symbol)

                (and (not (thread-safe-forms qualified-symbol))
                     (or (str/ends-with? (name qualified-symbol) "!")
                         (str/ends-with? (name qualified-symbol) "!*")))
                (f node qualified-symbol))))
          (walk [node]
            (let [ignored (not-empty (set/union (:metabase/ignored (meta node)) (ignored-linters node)))]
              (check-node (cond-> node
                            ignored (vary-meta assoc :metabase/ignored ignored)))
              (doseq [child (:children node)]
                (walk (cond-> child
                        ignored (vary-meta assoc :metabase/ignored ignored))))))]
    (walk node)))
