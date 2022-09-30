(ns hooks.clojure.test
  (:require [clj-kondo.hooks-api :as hooks]
            [clojure.walk :as walk]))

;;; to make our lives a bit easier we'll ignore namespaces... it's not like there are some versions of `with-redefs`
;;; that are ok while others aren't
(def ^:private disallowed-forms
  '#{notify-database-updated
     with-clock
     with-column-remappings
     with-discarded-collections-perms-changes
     with-locale
     with-log-level
     with-log-messages-for-level
     with-model-cleanup
     with-non-admin-groups-no-root-collection-perms
     with-redefs
     with-system-timezone-id
     with-temp-env-var-value
     with-temp-vals-in-db
     with-temporary-raw-setting-values
     with-temporary-setting-values})

(defn- disallowed-form? [node]
  (when (hooks/list-node? node)
    (let [first-child (first (:children node))]
      (when (hooks/token-node? first-child)
        (let [unqualified-symbol (symbol (name (hooks/sexpr first-child)))]
          (contains? disallowed-forms unqualified-symbol))))))

(defn- check-for-disallowed-forms-in-parallel-tests
  [nodes]
  (walk/postwalk
   (fn [node]
     (when (disallowed-form? node)
       (hooks/reg-finding!
        (assoc (meta (first (:children node)))
               :message (format "%s is not allowed inside parallel tests" (first (hooks/sexpr node)))
               :type    :metabase/disallow-form-in-parallel-tests))))
   nodes))

(defn- parse-metadata
  "Parse a sequence of metadata nodes into a map that we can actually read."
  [metadata-nodes]
  (into {} (for [node metadata-nodes]
             (cond
               (hooks/map-node? node)                                 (hooks/sexpr node)
               ((some-fn hooks/token-node? hooks/keyword-node?) node) [(hooks/sexpr node) true]))))

(defn deftest [{{[_deftest {test-metadata-nodes :meta, :as _test-name} & body] :children} :node, :as form}]
  (let [test-metadata (parse-metadata test-metadata-nodes)
        parallel?     (:parallel test-metadata)]
    (when parallel?
      (check-for-disallowed-forms-in-parallel-tests body)))
  form)
