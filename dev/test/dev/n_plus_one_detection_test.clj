(ns test.dev.n-plus-one-detection-test
  (:require  [clojure.test :refer [deftest testing is]]
             [dev]
             [methodical.core :as methodical]
             [toucan2.core :as t2]
             [toucan2.tools.hydrate :as t2.hydrate]))

(methodical/defmethod t2.hydrate/simple-hydrate
  [:default ::some-silly-key-that-should-never-actually-be-hydrated!!!]
  [_model k row]
  (let [v (:one (t2/query-one {:select [[1 :one]]}))]
    (assoc row k v)))

(def ^:dynamic *cached?* nil)

;; A simple hydration function that simulates caching. The first time it's called, it hits the database, but it
;; doesn't on subsequent calls.
(methodical/defmethod t2.hydrate/simple-hydrate
  [:default ::just-a-fake-cached-hydration-function!!!]
  [_model k row]
  (if @*cached?*
    (assoc row k :cached)
    (do
      (reset! *cached?* true)
      (assoc row k (:not-cached (t2/query-one {:select [[true :not-cached]]}))))))

(deftest n-plus-one-detection-test-works
  (testing "it does actually detect N+1 queries"
    (is (thrown-with-msg? clojure.lang.ExceptionInfo #"N\+1 hydration detected"
                          (t2/hydrate [{} {} {}] ::some-silly-key-that-should-never-actually-be-hydrated!!!))))
  (testing "it detects N+1 queries even when there's just one item"
    (is (thrown-with-msg? clojure.lang.ExceptionInfo #"N\+1 hydration detected"
                          (t2/hydrate [{}] ::some-silly-key-that-should-never-actually-be-hydrated!!!))))
  (binding [*cached?* (atom false)]
    (testing "Hydration doesn't throw"
      (is (= [{::just-a-fake-cached-hydration-function!!! :cached}]
             (t2/hydrate [{}] ::just-a-fake-cached-hydration-function!!!))))
    (testing "The 'cache' was populated"
      (is (true? @*cached?*)))))
