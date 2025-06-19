(ns metabase.permissions.policy
  "Implements a 'Permissions Policy DSL' that uses a vector format to allow models to describe
  a policy that determins how they can be accessed across and arbitrary set of actions. Policies
  can reference other policies allowing us to compose policies together. :self

  This also provides two operators for specifying that a given permission must be more permissive
  then the given one or less permissive than the given. More permissive means that the permission
  has a lower index in the vector of possible permission values.

  So saying [:more :perm/collection-acecss :read] for a permission of type `perms/collection-access`
  would be true if the permission is the same or more permissive than a :read -- a :read-and-write
  would also pass this test. Saying [:less :perm/collection-acecss :read] would restrict to only a
  :read permission.

  These permissions tests can also supply a default value to use if no permission is defined or the
  resource is absent from this document. [:more :perms/view-data :legacy-self-service [:default :blocked]]

  If no permission is found and no default is supplied the permission check will fail.

  More complicated checks can delegate to clojure functions by using a call of the form
  [:fn 'ns/function-symbol arg1 arg2 ...] these calls must returna boolean value.

  Since these documents are just clojure data structures they can be manipulated by function calls
  to add additional constants or other rules.

  Policies are applied to a virtual document of permissions. This document can be supplied either
  by looking up permissions via the Metabase permissions system or encoded in the authorization for
  a specific session. The format a session-authorization would request these tokens is not intended
  to map 1-to-1 to the document used to evaluate these permissions.

  Fully Realized this document would look like:

  ```clojure
    {:dashboards
     {1 {:perms/dashboard-access :read
         :drills true
         :params {:customer [10]}}}
     :collections
     {1 {:perms/collection-access :read}
      2 {:read-and-write}}
     :databases
     {1 {:tables {10 {:perms/download-results :no
                      :perms/create-queries :no
                      :perms/view-data :unrestricted}
                  20 {:perms/download-results :one-million-rows
                      :perms/create-queries :no
                      :perms/view-data :blocked}
                  30 {:perms/download-results :
                      :perms/create-queries :query-builder
                      :perms/view-data :unrestricted}
                  40 {:perms/download-results :one-million-rows
                      :perms/create-queries :query-builder
                      :perms/view-data :unrestricted}
                  50 {:perms/download-results :ten-thousand-rows
                      :perms/create-queries :query-builder
                      :perms/view-data :unrestricted}}
      2 {:perms/download-results :one-million-rows
         :perms/create-queries :query-builder-and-native
         :perms/view-data :unrestricted}}}
  ```

  Because there could be 10s or thousands or 100s of thousands of tables in data-access permissions,
  this document would be loaded lazily or derived as sql queries in some cases.

  A policy could then target this document. For example a dashboard could grant read permissions either
  when its id is specifically included in the dashboards resources or when its parent collection is
  included:

  ```clojure
  [:or [:in :self.id :dashboards [:more :perm/dashboard-access :read]]
   [:in :self.collection_id :collections [:more :perm/collection-access :read]]]
  ```

  In cases where we need to evaluate the same policy across more than one target model such as evaluting
  if an adhoc query can be run against set of tables:

  ```clojure
  [:each :target :self
   [:in :target.db :databases
    [:or [:and [:more :perms/view-data :unrestricted]
                [:more :perms/create-queries :query-builder]]
     [:in :target.id :tables [:and [:more :perms/view-data :unrestricted]
                              [:more :perms/create-queries :query-builder]]]]]]
  ```

  The repeated clause could be extracted into a var and referenced in multiple locations

  ```clojure
  (def unrestricted-and-query-builder [:and [:more :perms/view-data :unrestricted]
                                       [:more :perms/create-queries :query-builder]])

  [:each :self :target
   [:in :target.db :databases
    [:or unrestricted-and-query-builder
     [:in :target.id :tables unrestricted-and-query-builder]]]]
  ```"
  (:require
   [clojure.string :as str]
   [metabase.permissions.types :as perms.types]
   [metabase.util.log :as log]))

(declare eval-policy)

(defrecord PolicyNode [op args position children])

(defn- build-ast
  "Builds an AST from a policy vector, tagging each node with its position"
  ([policy] (build-ast policy []))
  ([policy position]
   (cond
     (vector? policy)
     (let [[op & args] policy]
       (->PolicyNode op
                     args
                     position
                     (map-indexed (fn [idx arg]
                                    (build-ast arg (conj position idx)))
                                  args)))

     :else
     (->PolicyNode ::literal [policy] position []))))

(def ^:dynamic *permissions-doc* nil)

(def ^:dynamic *evaluation-trace* nil)

(defn- trace-evaluation
  "Records an evaluation step with position information"
  [position op result]
  (when *evaluation-trace*
    (log/info {:position position :op op :result result})
    (swap! *evaluation-trace* conj {:position position :op op :result result}))
  result)

(defn resolve-path
  "Resolves a dotted path like :self.id or :target.db against the given context"
  [path context]
  (let [parts (-> path name (str/split #"\."))]
    (reduce (fn [obj part]
              (when obj
                (get obj (keyword part))))
            context
            parts)))

(defn get-permission-value
  "Gets a permission value from the permissions document with optional default"
  [perm-type resource-path  default]
  (let [perm-val (get-in *permissions-doc* resource-path)]
    (or (get perm-val perm-type) default)))

(defmulti eval-policy-operation
  "Evaluates a specific policy operation based on the operation type"
  (fn [node context] (:op node)))

(defmethod eval-policy-operation :or
  [node context]
  (let [result (boolean (some #(eval-policy % context) (:children node)))]
    (trace-evaluation (:position node) :or result)))

(defmethod eval-policy-operation :and
  [node context]
  (let [result (every? #(eval-policy % context) (:children node))]
    (trace-evaluation (:position node) :and result)))

(defmethod eval-policy-operation :in
  [node context]
  (let [[resource-key resource-path _] (:args node)
        resource-id (resolve-path resource-key context)
        result (some->> resource-id
                        (update context :current-resource-path conj resource-path)
                        (eval-policy (nth (:children node) 2)))]
    (trace-evaluation (:position node) :in result)))

(defn- get-permission-indices
  "Helper function to extract permission values and convert them to indices for comparison.
  Returns a map with :current-idx and :required-idx, or nil if either cannot be resolved."
  [perm-type required-level default-clause context]
  (let [[default-key default-val] (when (= (first default-clause) :default)
                                    [(first default-clause) (second default-clause)])
        current-path #p (:current-resource-path context)
        current-val #p (get-permission-value perm-type current-path (when default-key default-val))
        required-idx (perms.types/perm->int perm-type required-level)
        current-idx (some->> current-val (perms.types/perm->int perm-type))]
    (when (and current-idx required-idx)
      {:current-idx current-idx :required-idx required-idx})))

(defmethod eval-policy-operation :more
  [node context]
  (let [[perm-type required-level default-clause] (:args node)
        indices (get-permission-indices perm-type required-level default-clause context)
        result (when indices
                 (<= (:current-idx indices) (:required-idx indices)))]
    (trace-evaluation (:position node) :more result)))

(defmethod eval-policy-operation :less
  [node context]
  (let [[perm-type required-level default-clause] (:args node)
        indices (get-permission-indices perm-type required-level default-clause context)
        result (when indices
                 (>= (:current-idx indices) (:required-idx indices)))]
    (trace-evaluation (:position node) :less result)))

(defmethod eval-policy-operation :each
  [node context]
  (let [[target-key self-key _] (:args node)
        targets (get context self-key)
        sub-policy-node (nth (:children node) 2)
        result (every? #(eval-policy sub-policy-node (assoc context target-key %))
                       targets)]
    (trace-evaluation (:position node) :each result)))

(defmethod eval-policy-operation :fn
  [node context]
  (let [[fn-symbol & fn-args] (:args node)
        resolved-fn (resolve fn-symbol)
        resolved-args (map #(if (keyword? %)
                              (resolve-path % context)
                              %) fn-args)
        result (apply resolved-fn resolved-args)]
    (trace-evaluation (:position node) :fn result)))

(defmethod eval-policy-operation ::literal
  [node context]
  (let [result (first (:args node))]
    (trace-evaluation (:position node) ::literal result)))

(defmethod eval-policy-operation :default
  [node context]
  (let [result (vec (cons (:op node) (:args node)))]
    (trace-evaluation (:position node) :default result)))

(defn- eval-policy
  [node context]
  (eval-policy-operation node context))

(defn evaluate-policy
  "Evaluates a policy DSL vector against a permissions document and model instance.

  Args:
    policy - A policy DSL vector (e.g., [:or [:in :self.id :dashboards [:more :perm/dashboard-access :read]] ...])
    permissions-doc - The permissions document containing resources and data-access permissions
    model-instance - The model instance being evaluated (contains id, collection_id, etc.)

  Returns:
    Boolean - true if the policy passes, false otherwise"
  [policy permissions-doc model-instance]
  (let [trace (atom [])
        ast (build-ast policy)]
    (binding [*permissions-doc* permissions-doc
              *evaluation-trace* trace]
      (let [result (eval-policy ast {:self model-instance :current-resource-path []})]
        ;; For debugging, you can access the trace via @trace
        ;; Each trace entry has {:position [...] :op :operation-name :result boolean/value}
        result))))
