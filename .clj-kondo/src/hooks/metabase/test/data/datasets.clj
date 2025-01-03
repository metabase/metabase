(ns hooks.metabase.test.data.datasets
  (:require
   [clj-kondo.hooks-api :as hooks]
   [clojure.set :as set]
   [hooks.common]))

(defn- only-core-drivers?
  "Whether we're for sure only testing against the 'core' drivers that are also app DB types: `:postgres`, `:mysql`, or
  `:h2`. Tests like these are ok to mark `:mb/once` or `:mb/driver-tests` since we always run the full test suite
  against app DB drivers anyway."
  [node]
  (let [drivers (hooks/sexpr (second (:children node)))
        drivers (cond
                  (keyword? drivers) #{drivers}
                  (set? drivers)     drivers
                  :else              nil)]
    (when drivers
      (empty? (set/difference drivers #{:h2 :mysql :postgres})))))

(defn- validate-mb-once [x]
  (when (:mb/once (meta (:ns x)))
    (hooks/reg-finding!
     (assoc (meta (:ns x))
            :message (str "You should not use test-driver or test-drivers in a namespace marked ^:mb/once"
                          " [:metabase/validate-mb-once]")
            :type :metabase/validate-mb-once))))

(defn- validate-mb-driver-tests [x]
  (when-not (:mb/driver-tests (meta (:ns x)))
    (hooks/reg-finding!
     (assoc (meta (:ns x))
            :message (str "Namespaces that run driver tests (test-driver or test-drivers) should be marked"
                          " ^:mb/driver-tests [:metabase/validate-mb-driver-tests]")
            :type :metabase/validate-mb-driver-tests))))

(defn- validate-ns-tags [x]
  (when-not (only-core-drivers? (:node x))
    (validate-mb-once x)
    (validate-mb-driver-tests x)))

(defn test-drivers [x]
  (validate-ns-tags x)
  (letfn [(update-node [node]
            (let [[test-drivers drivers-expr & body] (:children node)]
              (-> (hooks/list-node
                   (list*
                    (hooks/token-node 'do)
                    test-drivers
                    (-> drivers-expr
                        (hooks.common/update-ignored-linters conj :unused-value))
                    body))
                  (with-meta (meta node)))))]
    (update x :node update-node)))

(defn test-driver
  "We can use the same hook for `test-driver` as we use for `test-drivers`."
  [x]
  (test-drivers x))
