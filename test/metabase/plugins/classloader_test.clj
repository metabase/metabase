(ns metabase.plugins.classloader-test
  (:require
   [clojure.test :refer :all]
   [metabase.plugins.classloader :as classloader])
  (:import
   (clojure.lang DynamicClassLoader)))

(set! *warn-on-reflection* true)

(deftest has-shared-context-classloader-as-ancestor?-test
  (testing "make sure we correctly detect when the current thread has the shared dynamic classloader as an ancestor"
    (.setContextClassLoader (Thread/currentThread) (ClassLoader/getSystemClassLoader))
    (is (= false
           (#'classloader/has-shared-context-classloader-as-ancestor? (.getContextClassLoader (Thread/currentThread)))))

    (testing "context classloader => MB shared-context-classloader"
      (.setContextClassLoader (Thread/currentThread) @@#'classloader/shared-context-classloader)
      (is (#'classloader/has-shared-context-classloader-as-ancestor? (.getContextClassLoader (Thread/currentThread)))))

    (testing "context classloader => DynamicClassLoader with MB shared-context-classloader as its parent"
      (.setContextClassLoader (Thread/currentThread) (DynamicClassLoader. @@#'classloader/shared-context-classloader))
      (is (#'classloader/has-shared-context-classloader-as-ancestor? (.getContextClassLoader (Thread/currentThread)))))))

(deftest set-context-classloader-test
  (testing (str "if the current thread does NOT have a context classloader that is a descendent of the shared context "
                "classloader, calling `the-classloader` should set it as a side-effect")
    (.setContextClassLoader (Thread/currentThread) (ClassLoader/getSystemClassLoader))
    (classloader/the-classloader)
    (is (= @@#'classloader/shared-context-classloader
           (.getContextClassLoader (Thread/currentThread)))))

  (testing "if current thread context classloader === the shared context classloader it should be kept as-is"
    (.setContextClassLoader (Thread/currentThread) @@#'classloader/shared-context-classloader)
    (classloader/the-classloader)
    (is (= @@#'classloader/shared-context-classloader
           (.getContextClassLoader (Thread/currentThread)))))

  (testing (str "if current thread context classloader is a *descendant* the shared context classloader it should be "
                "kept as-is")
    (let [descendant-classloader (DynamicClassLoader. @@#'classloader/shared-context-classloader)]
      (.setContextClassLoader (Thread/currentThread) descendant-classloader)
      (classloader/the-classloader)
      (is (= descendant-classloader
             (.getContextClassLoader (Thread/currentThread)))))))
