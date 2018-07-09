(ns metabase.task.DynamicClassLoadHelper
  "This is needed to get the JDBC backend for Quartz working, or something like that. See
  http://clojurequartz.info/articles/durable_quartz_stores.html for details."
  (:gen-class
   :extends clojure.lang.DynamicClassLoader
   :exposes-methods {loadClass superLoadClass}
   :implements [org.quartz.spi.ClassLoadHelper]))

;; docstrings are copies of the ones for the corresponding methods of the ClassLoadHelper interface

(defn -initialize
  "void initialize()

  Called to give the ClassLoadHelper a chance to initialize itself, including the opportunity to \"steal\" the class
  loader off of the calling thread, which is the thread that is initializing Quartz."
  [_])

(defn -loadClass
  "Class loadClass(String className)

  Return the class with the given name."
  ([^metabase.task.DynamicClassLoadHelper this, ^String class-name]
   (.superLoadClass this class-name true)) ; loadClass(String name, boolean resolve)
  ([^metabase.task.DynamicClassLoadHelper this, ^String class-name, _]
   (.superLoadClass this class-name true)))

(defn -getClassLoader
  "ClassLoader getClassLoader()

  Enable sharing of the class-loader with 3rd party"
  [this]
  this)
