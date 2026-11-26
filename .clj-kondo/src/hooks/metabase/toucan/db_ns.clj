(ns hooks.metabase.toucan.db-ns
  "Lint that application database query calls -- Toucan 2's `t2/select`, `t2/query`, `t2/insert!`, `t2/update!`,
  `t2/delete!` and friends, plus the `metabase.app-db.core` wrappers around them such as `mdb/query` and
  `mdb/update-or-insert!` -- live in a module's `db` namespace, i.e. `metabase[-enterprise].<module>.db` (or `metabase.driver.<driver>.db` for
  driver modules). Every other namespace in a module goes through those functions instead of talking to the
  application database directly.

  Registered as an `:analyze-call` hook on each of those functions in `.clj-kondo/config.edn`. The hook
  returns its input unchanged so Kondo's normal analysis of the call (arity, var usage) still runs."
  (:require
   [clj-kondo.hooks-api :as hooks]
   [hooks.common :as hooks.common]
   [hooks.common.modules :as modules]))

(def ^:private driver-db-namespace
  "Matches `metabase.driver.<driver>.db`; individual drivers are not modules."
  #"^metabase\.driver\.[^.]+\.db$")

(defn- db-namespace? [config ns-sym]
  (let [ns-str (name ns-sym)]
    (boolean
     ;; Resolve ownership first: a nested `.db` name alone does not make a module.
     (or (when-let [module (modules/module config ns-sym)]
           (= ns-str (str (modules/module-ns-prefix (:metabase/modules config) module) ".db")))
         (re-matches driver-db-namespace ns-str)))))

(defn- test-file?
  "Whether `filename` is in a test source tree. Test namespaces are exempt through the `test-namespaces` group in
  `config.edn`, but helper namespaces like `metabase.sso.test-helpers` don't match that group's pattern."
  [filename]
  (boolean (and filename (re-find #"(?:^|/)test/" filename))))

(def ^:private model-index
  "For each Toucan 2 fn that accepts a bare primary key, the index of the model among its arguments."
  '{select                         0
    select-one                     0
    select-pks-set                 0
    select-pks-vec                 0
    select-one-pk                  0
    reducible-select               0
    count                          0
    exists?                        0
    delete!                        0
    update!                        0
    update-returning-pks!          0
    reducible-update               0
    reducible-update-returning-pks 0
    select-one-fn                  1
    select-fn-set                  1
    select-fn-vec                  1
    select-fn-reducible            1
    select-pk->fn                  1
    select-fn->pk                  1
    select-fn->fn                  2})

(def ^:private trailing-changes-fns
  "Fns whose arglist ends in a changes map, so the bare primary key is the second-to-last argument."
  '#{update! update-returning-pks! reducible-update reducible-update-returning-pks})

(def ^:private map-returning-fns
  "Fns whose call returns a map -- or throws, given a string -- so a call to one can never carry a string into
  the query slot."
  '#{assoc assoc-in assoc-some dissoc select-keys update update-in})

(def ^:private seeded-fns
  "Fns that return their first argument when nothing applies, so they return a map only when seeded with one."
  '#{cond-> cond->> -> ->> some-> some->> into})

(def ^:private branching-fns
  "Fns whose result is one of their branches, so they return a map only when every branch is one."
  '#{if if-not if-let if-some when when-not when-let when-some or})

(def ^:private map-asserting-fns
  "`h2x/assert-map-or-nil!`, which throws for anything but a map or nil, so a call to it can never carry a string."
  '#{metabase.util.honey-sql-2/assert-map-or-nil!})

(defn- resolved-symbol
  "`sym` with its namespace alias resolved, or `sym` itself when Kondo cannot resolve it."
  [sym]
  (or (try
        (when-let [{resolved-ns :ns, resolved-name :name} (hooks/resolve {:name sym})]
          (symbol (str resolved-ns) (str resolved-name)))
        (catch Exception _ nil))
      sym))

(defn- map-form?
  "Whether `node` statically yields a map (or nil), so passing it after the model is conditions or a query,
  never a string. A fn named for a query proves nothing -- it could return a string -- so only the shape of the
  form counts, or a call to [[map-asserting-fns]], which checks at runtime."
  [node]
  (cond
    (hooks/map-node? node) true
    (and (hooks/token-node? node) (nil? (hooks/sexpr node))) true
    (hooks/list-node? node)
    (let [[head & args] (:children node)
          sym           (some-> head hooks/sexpr)
          f             (when (symbol? sym) (symbol (name sym)))]
      (boolean
       (cond
         (and (symbol? sym)
              (contains? map-asserting-fns (resolved-symbol sym))) true
         (contains? map-returning-fns f) true
         (contains? seeded-fns f)        (some-> (first args) map-form?)
         ;; `(merge s {...})` throws for a string `s`, so one map argument is enough.
         (= 'merge f)                    (some map-form? args)
         (contains? branching-fns f)     (let [branches (case f
                                                          (if if-not if-let if-some) (rest args)
                                                          (when when-not when-let when-some) [(last args)]
                                                          or args)]
                                           (and (seq branches) (every? map-form? branches))))))
    :else false))

(defn- implicit-pk-node?
  "Whether `node`, as the lone query argument after a model, is read by Toucan as a primary key.

  A keyword names a query, and a string or vector literal is a query written in place. A form that yields a
  map ([[map-form?]]), or an identity query, is a query too. Anything else -- a symbol, a number, a call -- is
  reported, because Toucan reads a non-map value as a primary key, and a string one as a query: written as
  `:id x`, a string is bound as a value instead."
  [node]
  (not (or (map-form? node)
           (hooks/keyword-node? node)
           (hooks/string-node? node)
           (hooks/vector-node? node)
           (let [head (some-> node :children first hooks/sexpr)]
             (and (hooks/list-node? node) (symbol? head) (= "identity-query" (name head)))))))

(def ^:private pk-columns
  "Models whose primary key is not `:id`, mirroring their `t2/primary-keys` methods."
  {:model/Setting           :key
   :model/QueryCache        :query_hash
   :model/QueryAction       :action_id
   :model/ImplicitAction    :action_id})

(defn- pk-column
  "The primary key column to suggest for `model-node`: `:id`, unless [[pk-columns]] names another. A model
  that is not a literal keyword could be any model, so it gets `:toucan/pk`, which matches on whatever that
  model's primary key is."
  [model-node]
  (let [model (if (hooks/vector-node? model-node)
                (some-> model-node :children first hooks/sexpr)
                (some-> model-node hooks/sexpr))]
    (if (keyword? model)
      (get pk-columns model :id)
      :toucan/pk)))

(defn- lint-implicit-pk!
  "Register a `:metabase/t2-implicit-pk` finding when a primary key is passed bare, as in
  `(t2/select-one :model/Card id)`, rather than as `(t2/select-one :model/Card :id id)`."
  [node]
  (let [[fn-node & args] (:children node)
        verb             (some-> fn-node hooks/sexpr name symbol)]
    (when-let [i (get model-index verb)]
      (let [after-model (drop (inc i) args)
            n-query     (if (contains? trailing-changes-fns verb) 2 1)]
        (when (= n-query (count after-model))
          (let [pk (first after-model)]
            (when (implicit-pk-node? pk)
              (hooks/reg-finding!
               (assoc (meta pk)
                      :message (format "Pass the primary key as `%s %s` rather than bare to `%s`"
                                       (pk-column (nth args i)) (hooks/sexpr pk) (hooks/sexpr fn-node))
                      :type :metabase/t2-implicit-pk)))))))))

(def change-log-tables
  "The models that the change log covers, with their tables. `metabase.change-log.events-test` checks it against them."
  {:model/Card                       :report_card
   :model/Dashboard                  :report_dashboard
   :model/Database                   :metabase_database
   :model/Field                      :metabase_field
   :model/FieldUserSettings          :metabase_field_user_settings
   :model/NativeQuerySnippet         :native_query_snippet
   :model/Notification               :notification
   :model/NotificationCard           :notification_card
   :model/NotificationHandler        :notification_handler
   :model/NotificationRecipient      :notification_recipient
   :model/NotificationSubscription   :notification_subscription
   :model/PermissionsGroup           :permissions_group
   :model/PermissionsGroupMembership :permissions_group_membership
   :model/Pulse                      :pulse
   :model/PulseCard                  :pulse_card
   :model/PulseChannel               :pulse_channel
   :model/PulseChannelRecipient      :pulse_channel_recipient
   :model/Table                      :metabase_table
   :model/Tenant                     :tenant
   :model/User                       :core_user})

(def ^:private table-write-fns
  "Fns whose first argument names the model or table they write to."
  '#{insert! insert-returning-instance! insert-returning-instances! insert-returning-pk! insert-returning-pks!
     update! update-returning-pks! reducible-update reducible-update-returning-pks delete!})

(def ^:private query-fns
  "Fns that run a query map."
  '#{query query-one reducible-query})

(def ^:private write-clauses
  "The query-map clauses that name the table a write goes to."
  #{:update :delete-from :insert-into})

(defn- call-to?
  "Whether `node` is a call to a fn named `fn-name`, in any namespace."
  [node fn-name]
  (and (hooks/list-node? node)
       (let [f (some-> node :children first hooks/sexpr)]
         (and (symbol? f) (= fn-name (name f))))))

(defn- change-log-table-node?
  "Whether `node` names the table of a tracked model: `:report_card`, `(t2/table-name :model/Card)`, or either one
  first in a vector, as in `[:report_card :c]`. `(t2/table-name model)` counts too, since `model` can be any model."
  [node]
  (cond
    (hooks/vector-node? node)    (boolean (some-> node :children first change-log-table-node?))
    (hooks/keyword-node? node)   (contains? (set (vals change-log-tables)) (hooks/sexpr node))
    (call-to? node "table-name") (let [model (second (:children node))
                                       model (cond-> model (call-to? model "resolve-model") (-> :children second))]
                                   (or (not (hooks/keyword-node? model))
                                       (contains? change-log-tables (hooks/sexpr model))))
    :else                        false))

(defn- lint-change-log-raw-write!
  "Register a `:metabase/change-log-raw-write` finding when a write names the table of a tracked model rather than the
  model, as in `(t2/update! (t2/table-name :model/Card) ...)` and `(t2/query {:update :report_card ...})`. Such a
  write skips the hooks that write the change log."
  [node]
  (let [[fn-node & args] (:children node)
        verb             (some-> fn-node hooks/sexpr name symbol)]
    (doseq [table (cond
                    (contains? table-write-fns verb) (take 1 args)
                    (contains? query-fns verb)       (for [arg   args
                                                           :when (hooks/map-node? arg)
                                                           [k v] (partition 2 (:children arg))
                                                           :when (and (hooks/keyword-node? k)
                                                                      (contains? write-clauses (hooks/sexpr k)))]
                                                       v))
            :when (change-log-table-node? table)]
      (hooks/reg-finding!
       (assoc (meta table)
              :message (str "This write skips the model's hooks, so the change log misses it. Log the rows with "
                            "`metabase.change-log.core/log-rows!`, unless the change log leaves them out on purpose. "
                            "Then ignore this finding, with the reason in a comment.")
              :type :metabase/change-log-raw-write)))))

(defn- model-owner
  "The module whose `:model-exports` in `modules` lists `model`, or nil when none does."
  [modules model]
  (some (fn [[module {:keys [model-exports]}]]
          (when (contains? model-exports model)
            module))
        modules))

(defn- lint-foreign-model-write!
  "Register a `:metabase/foreign-model-write` finding when a write names a literal `:model/X` that a module other than
  that of `ns`, or one of its ancestors, owns: such a write goes through the owning model's write function."
  [config ns node]
  (let [[fn-node model-node] (:children node)
        verb                 (some-> fn-node hooks/sexpr name symbol)
        model                (when (hooks/keyword-node? model-node) (hooks/sexpr model-node))]
    (when (and (contains? table-write-fns verb)
               (keyword? model)
               (= "model" (namespace model))
               (not (contains? (hooks.common/ignored-linters node) :metabase/foreign-model-write)))
      (let [modules (:metabase/modules config)
            owner   (model-owner modules model)
            module  (modules/module config ns)]
        (when (and owner module (not (modules/descendant-of? modules module owner)))
          (hooks/reg-finding!
           (assoc (meta model-node)
                  :message (format "%s belongs to module %s; write it through that module's write function, not `%s` in %s"
                                   model owner (hooks/sexpr fn-node) module)
                  :type :metabase/foreign-model-write)))))))

(defn lint-query-call
  "Register a `:metabase/t2-query-namespace` finding when a Toucan 2 query call appears outside a `<module>.db`
  namespace."
  [{:keys [node ns filename] :as input}]
  (lint-implicit-pk! node)
  ;; the change log leaves out migrations
  (when-not (or (test-file? filename)
                (re-find #"^metabase\.app-db\.custom-migrations" (str ns)))
    (lint-change-log-raw-write! node))
  (when (and ns
             (not (db-namespace? (modules/config input) ns))
             (not (test-file? filename)))
    (let [fn-node (first (:children node))]
      (hooks/reg-finding!
       (assoc (meta fn-node)
              :message (format "Application database query calls like `%s` must live in metabase[-enterprise].<module>.db (or metabase.driver.<driver>.db) namespaces"
                               (hooks/sexpr fn-node))
              :type :metabase/t2-query-namespace))))
  (when (and ns
             (not (test-file? filename))
             (not (re-find #"^metabase\.app-db\." (str ns))))
    (lint-foreign-model-write! (modules/config input) ns node))
  input)
