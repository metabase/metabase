(ns metabase.plugins.classloader-test
  (:require [expectations :refer [expect]]
            [metabase.plugins.classloader :as classloader])
  (:import clojure.lang.DynamicClassLoader))

;; make sure we correctly detect when the current thread has the shared dynamic classloader as an ancestor
(expect
  false
  (do
    (.setContextClassLoader (Thread/currentThread) (ClassLoader/getSystemClassLoader))
    (#'classloader/has-shared-context-classloader-as-ancestor? (.getContextClassLoader (Thread/currentThread)))))

(expect
  (do
    (.setContextClassLoader (Thread/currentThread) @@#'classloader/shared-context-classloader)
    (#'classloader/has-shared-context-classloader-as-ancestor? (.getContextClassLoader (Thread/currentThread)))))

(expect
  (do
    (.setContextClassLoader (Thread/currentThread) (DynamicClassLoader. @@#'classloader/shared-context-classloader))
    (#'classloader/has-shared-context-classloader-as-ancestor? (.getContextClassLoader (Thread/currentThread)))))

;; if the current thread does NOT have a context classloader that is a descendent of the shared context classloader,
;; calling `the-classloader` should set it as a side-effect
(expect
  @@#'classloader/shared-context-classloader
  (do
    (.setContextClassLoader (Thread/currentThread) (ClassLoader/getSystemClassLoader))
    (classloader/the-classloader)
    (.getContextClassLoader (Thread/currentThread))))

;; if current thread context classloader === the shared context classloader it should be kept as-is
(expect
  @@#'classloader/shared-context-classloader
  (do
    (.setContextClassLoader (Thread/currentThread) @@#'classloader/shared-context-classloader)
    (classloader/the-classloader)
    (.getContextClassLoader (Thread/currentThread))))

;; if current thread context classloader is a *descendant* the shared context classloader it should be kept as-is
(let [descendant-classloader (DynamicClassLoader. @@#'classloader/shared-context-classloader)]
  (expect
    descendant-classloader
    (do
      (.setContextClassLoader (Thread/currentThread) descendant-classloader)
      (classloader/the-classloader)
      (.getContextClassLoader (Thread/currentThread)))))
