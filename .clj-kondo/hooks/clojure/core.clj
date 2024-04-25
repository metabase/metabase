(ns hooks.clojure.core
  (:require
   [clj-kondo.hooks-api :as hooks]
   [clojure.string :as str]))

(defn- node->qualified-symbol [node]
  (try
   (when (hooks/token-node? node)
     (let [sexpr (hooks/sexpr node)]
       (when (symbol? sexpr)
         (let [resolved (hooks/resolve {:name sexpr})]
           (when-not (= :clj-kondo/unknown-namespace (:ns resolved))
             (symbol (name (:ns resolved)) (name (:name resolved))))))))
   ;; some symbols like `*count/Integer` aren't resolvable.
   (catch Exception _
     nil)))

(def ^:private white-card-symbols
  '#{;; these toucan methods might actually set global values if it's used outside of a transaction,
     ;; but since mt/with-temp runs in a transaction, so we'll ignore them in this case.
     toucan2.core/delete!
     toucan2.core/update!
     toucan2.core/insert!
     toucan2.core/insert-returning-instance!
     toucan2.core/insert-returning-instances!
     toucan2.core/insert-returning-pk!
     toucan2.core/insert-returning-pks!
     clojure.core.async/<!!
     clojure.core.async/>!!
     clojure.core.async/alts!!
     clojure.core.async/close!
     clojure.core.async/poll!
     clojure.core.memoize/memo-clear!
     clojure.core/conj!
     clojure.core/persistent!
     clojure.core/reset!
     clojure.core/swap!
     clojure.core/volatile!
     clojure.core/vreset!
     clojure.core/vswap!
     clojure.java.jdbc/execute!
     methodical.core/add-aux-method-with-unique-key!
     methodical.core/remove-aux-method-with-unique-key!
     next.jdbc/execute!

     ;; Definitely thread safe
     metabase.test.util.dynamic-redefs/patch-vars!

     ;; TODO: most of these symbols shouldn't be here, we should go through them and
     ;; find the functions/macros that use them and make sure their names end with !
     ;; best way to do this is try remove each of these and rely on kondo output to find places where it's used
     clojure.test/grant-collection-perms!
     clojure.test/grant-collection-perms-fn!
     clojure.test/grant-perms-fn!
     clojure.test/purge-old-entries!
     clojure.test/revoke-collection-perms!
     clojure.test/save-results!
     metabase-enterprise.advanced-permissions.models.permissions/update-db-download-permissions!
     metabase-enterprise.internal-user/install-internal-user!
     metabase-enterprise.sso.integrations.saml-test/call-with-login-attributes-cleared!
     metabase.actions/perform-action!
     metabase.analytics.snowplow-test/fake-track-event-impl!
     metabase.analytics.snowplow/track-event-impl!
     metabase.api.public-test/add-card-to-dashboard!
     metabase.cmd.dump-to-h2/dump-to-h2!
     metabase.cmd.load-from-h2/load-from-h2!
     metabase.core/ensure-audit-db-installed!
     metabase.db.schema-migrations-test.impl/run-migrations-in-range!
     metabase.db.setup/migrate!
     metabase.db.setup/setup-db!
     metabase.db/migrate!
     metabase.db/setup-db!
     metabase.driver.mongo-test/create-database-from-row-maps!
     metabase.driver.postgres-test/create-enums-db!
     metabase.driver.postgres-test/drop-if-exists-and-create-db!
     metabase.driver.sql-jdbc.execute/execute-statement!
     metabase.email-test/reset-inbox!
     metabase.email/send-email!
     metabase.models.action/insert!
     metabase.models.collection.graph-test/clear-graph-revisions!
     metabase.models.collection.graph-test/do-with-n-temp-users-with-personal-collections!
     metabase.models.field-values/create-or-update-full-field-values!
     metabase.models.model-index/add-values!
     metabase.models.moderation-review/create-review!
     metabase.models.on-demand-test/add-dashcard-with-parameter-mapping!
     metabase.models.permissions/grant-application-permissions!
     metabase.models.permissions/grant-collection-read-permissions!
     metabase.models.permissions/grant-collection-readwrite-permissions!
     metabase.models.permissions/grant-full-data-permissions!
     metabase.models.permissions/grant-native-readwrite-permissions!
     metabase.models.permissions/grant-permissions!
     metabase.models.permissions/revoke-application-permissions!
     metabase.models.permissions/revoke-data-perms!
     metabase.models.permissions/update-data-perms-graph!
     metabase.models.permissions/update-group-permissions!
     metabase.models.persisted-info/ready-database!
     metabase.models.revision/revert!
     metabase.models.setting-test/test-user-local-allowed-setting!
     metabase.models.setting-test/test-user-local-only-setting!
     metabase.models.setting.cache/restore-cache!
     metabase.models.setting/set!
     metabase.models.setting/validate-settings-formatting!
     metabase.permissions.test-util/with-restored-perms!
     metabase.pulse/send-notifications!
     metabase.pulse/send-pulse!
     metabase.query-processor.streaming.interface/begin!
     metabase.query-processor.streaming.interface/finish!
     metabase.query-processor.streaming.interface/write-row!
     metabase.sample-data/try-to-extract-sample-database!
     metabase.setup/create-token!
     metabase.sync.sync-metadata.fields.sync-metadata/update-field-metadata-if-needed!
     metabase.sync.sync-metadata/sync-db-metadata!
     metabase.sync.util-test/sync-database!
     metabase.sync.util/store-sync-summary!
     metabase.sync/sync-database!
     metabase.task.index-values/job-init!
     metabase.task.persist-refresh/job-init!
     metabase.task.persist-refresh/refresh-tables!
     metabase.task.persist-refresh/schedule-persistence-for-database!
     metabase.task/delete-task!
     metabase.test.data.bigquery-cloud-sdk/execute!
     metabase.test.data.impl/copy-db-tables-and-fields!
     metabase.test.data.impl/get-or-create-database!
     metabase.test.data.impl/get-or-create-test-data-db!
     metabase.test.data.impl.get-or-create/set-test-db-permissions!
     metabase.test.data.interface/create-db!
     metabase.test.data.interface/destroy-db!
     metabase.test.data.oracle/create-user!
     metabase.test.data.oracle/drop-user!
     metabase.test.data.sql-jdbc.load-data/make-insert!
     metabase.test.data.users/clear-cached-session-tokens!
     metabase.test.initialize/do-initialization!
     metabase.test.initialize/initialize-if-needed!
     metabase.test.integrations.ldap/start-ldap-server!
     metabase.test.util.log/ensure-unique-logger!
     metabase.test.util.log/set-ns-log-level!
     metabase.test.util/do-with-temp-env-var-value!
     metabase.test.util/restore-raw-setting!
     metabase.test.util/upsert-raw-setting!
     metabase.test/initialize-if-needed!
     metabase.test/test-helpers-set-global-values!
     metabase.test/with-temp-env-var-value!
     metabase.upload-test/set-local-infile!
     metabase.util.files/create-dir-if-not-exists!
     metabase.util.ssh-test/start-mock-servers!
     metabase.util.ssh-test/stop-mock-servers!})

(defn- end-with-exclamation?
  [s]
  (str/ends-with? s "!"))

(defn- non-thread-safe-form-should-end-with-exclamation*
  [{[defn-or-defmacro form-name] :children, :as node}]
  (when-not (and (:string-value form-name)
                 (end-with-exclamation? (:string-value form-name)))
    (letfn [(walk [f form]
              (f form)
              (doseq [child (:children form)]
                (walk f child)))]
      (walk (fn [form]
              (when-let [qualified-symbol (node->qualified-symbol form)]
                (when (and (not (contains? white-card-symbols qualified-symbol))
                           (end-with-exclamation? qualified-symbol))
                  (hooks/reg-finding! (assoc (meta form-name)
                                             :message (format "The name of this %s should end with `!` because it contains calls to non thread safe form `%s`."
                                                              (:string-value defn-or-defmacro) qualified-symbol)
                                             :type :metabase/test-helpers-use-non-thread-safe-functions)))))
            node))
    node))

(defn non-thread-safe-form-should-end-with-exclamation
  "Used to ensure defn and defmacro in test namespace to have name ending with `!` if it's non-thread-safe.
  A function or a macro can be defined as 'not thread safe' when their function name ends with a `!`.

  Only used in tests to identify thread-safe/non-thread-safe test helpers. See #37126"
  [{:keys [node cljc lang]}]
  (when (or (not cljc)
            (= lang :clj))
    (non-thread-safe-form-should-end-with-exclamation* node))
  {:node node})

;; ----------------- Modules -----------------

;; TODO -- this hard coding is not ideal, it would be better to support metadata on the namespaces themselves.
(def ^:private global-modules
  "Global module namespaces can be imported anywhere, but their (non-module) internal namespaces are private.
  We can nest global modules, in which case each module hides its internal even from its parent module, but is itself
  importable even outside its parent module(s)."
  ;; We keep this map sorted so parents precede their children. For legibility please keep them listed that way too..
  (sorted-set
   'metabase.db
   ;; We may aspire to encapsulating more of these - either through refactoring or ^:clj-kondo/ignore.
   'metabase.db.connection
   'metabase.db.data-source
   ;; This case may justify a "friends" style relationship with the metabase.driver module.
   'metabase.db.jdbc-protocols
   'metabase.db.metadata-queries
   'metabase.db.query
   'metabase.db.setup
   ;; The namespaces only have their modularity broken within our tests, perhaps we should special case them.
   'metabase.db.liquibase
   'metabase.db.schema-migrations-test.impl
   'metabase.db.test-util

   'metabase.upload
   ;; We anticipate using this CLJC ns for type inference on the frontend, so it's exposed outside the CLJ module.
   'metabase.upload.types))

;; TODO -- this hard coding is not ideal, it would be better to support metadata on the namespaces themselves.
(def ^:private internal-modules
  "Internal modules are similar to nested modules, except their top-level namespace is not globally exposed."
  (sorted-set
   'metabase.db.liquibase))

(def ^:private modules
  "A sorted list, from outside in of all modules and submodules, both global and internal."
  (into global-modules internal-modules))

(defn- module->child-detector
  "Construct a function that return the given namespace when called with a namespace which is nested inside it."
  [module-ns-sym]
  (let [prefix (str (name module-ns-sym) ".")]
    (fn child-detector [ns-sym]
      (when (str/starts-with? (name ns-sym) prefix)
        module-ns-sym))))

(def ^:private module-detectors
  "A pre-built list of detectors corresponding to our modules, going from most to least specific."
  (->> (reverse modules)
       (mapv module->child-detector)))

(defn- parent-module
  "Find the most tightly enclosing module for the given namespace, returning nil if it is not within any."
  [ns-sym]
  (some #(% ns-sym) module-detectors))

(defn- base-module
  "Traverse up through the module hierarchy to find the top-level module for the given namespace, if it is within one."
  [ns-sym]
  (when-let [parent (parent-module ns-sym)]
    (loop [module parent]
      (if-let [parent (parent-module module)]
        (recur parent)
        module))))

(when-not (every? (comp global-modules base-module) internal-modules)
  (throw (Exception. "Sanity check: every internal module is inside a global module")))

(defn- dependency-info
  "Return the metadata corresponding to each namespace / class within a given section of an ns form."
  [node]
  (if-let [ns-sym (:value node)]
    ;; It could be a named symbol
    [{:node node, :ns-sym ns-sym}]
    (let [[{base :value :as first-node} & sub-nodes] (:children node)]
      (if-not (symbol? (:value (first sub-nodes)))
        ;; Base is either the only form, or followed by a keyword like :as or :refer
        ;; In either case, it should already be fully qualified.
        [{:node first-node, :ns-sym base}]
        ;; If there is a list of symbols, the first node gives the namespace.
        (for [sub-node sub-nodes]
          {:node sub-node, :ns-sym (symbol (format "%s.%s"
                                                   (name base)
                                                   (name (:value sub-node))))})))))

(def ^:private dependency-section? #{:require :import :use :load})

(defn- dependencies->ns-symbols
  "Given a subsection of an ns-form, e.g. (:require ...), return a list of info for the namespaces it references."
  [dependency-node]
  (let [[{section-key :k} & references] (:children dependency-node)]
    (when (dependency-section? section-key)
      (mapcat dependency-info references))))

(defn- allowed-parents [{ns-sym :value ns-s :string-value}]
  (into #{} (remove nil?)
        [;; Modules can depend on their own internals.
         (modules ns-sym)
         ;; We can to depend on our siblings.
         (parent-module ns-sym)
         ;; We treat modules and their test namespaces synonymously
         (when (modules ns-sym)
           (symbol (str ns-s "-test")))
         (when (str/ends-with? ns-s "-test")
           ;; Using substring requires interop
           (symbol (str/replace ns-s #"-test$" "")))]))

(defn module-internals-should-be-encapsulated
  "Test whether a namespace violates the encapsulation of any modules. Does not lint dynamic references, yet."
  [{{[_ ns-token & dependencies] :children} :node :as input}]
  (let [illegal-dependencies (->> (mapcat dependencies->ns-symbols dependencies)
                                  ;; modules can be referenced from anywhere (even if they are inside another module)
                                  (remove (comp global-modules :ns-sym))
                                  (map #(assoc % :parent-module (parent-module (:ns-sym %))))
                                  ;; we don't care about namespaces which aren't in a module
                                  (remove (comp nil? :parent-module))
                                  ;; we don't care about internal references within a module
                                  (remove (comp (allowed-parents ns-token) :parent-module)))]
    (doseq [{:keys [node ns-sym parent-module]} illegal-dependencies]
      (hooks/reg-finding! (assoc (meta node)
                                 :message (format "namespace %s referenced outside of module %s." ns-sym parent-module)
                                 :type :metabase/module-encapsulation-broken)))
    input))


(comment
 (require '[clj-kondo.core :as clj-kondo])
 (def form (str '(defmacro a
                   [x]
                   `(fun-call x))))

 (def form "(defmacro a
           [x]
           `(some! ~x))")

 (def form "(defun f
           [x]
           (let [g! (fn [] 1)]
           (g!)))")

 (str (hooks/parse-string form))
 (hooks/sexpr (hooks/parse-string form))

 (binding [hooks/*reload* true]
   (-> form
       (with-in-str (clj-kondo/run! {:lint ["-"]}))
       :findings))

 (do (non-thread-safe-form-should-end-with-exclamation* (hooks/parse-string form)) nil))
