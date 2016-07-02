(ns metabase.cmd.load-from-h2-test
  (:require [clojure.java.classpath :as classpath]
            [clojure.tools.namespace.find :as ns-find]
            [expectations :refer :all]
            metabase.cmd.load-from-h2
            [metabase.models.interface :as models]))

;; Check to make sure we're migrating all of our entities.
;; This fetches the `metabase.cmd.load-from-h2/entities` and compares it all existing entities

(defn- migrated-entity-names []
  (set (map :name @(resolve 'metabase.cmd.load-from-h2/entities))))

(defn- all-entity-names []
  (set (for [ns       (ns-find/find-namespaces (classpath/classpath))
             :when    (re-find #"^metabase\.models\." (name ns))
             :when    (not (re-find #"test" (name ns)))
             [_ varr] (do (require ns)
                          (ns-interns ns))
             :let     [entity (var-get varr)]
             :when    (models/metabase-entity? entity)]
         (:name entity))))

(expect
  (migrated-entity-names)
  (all-entity-names))
