(ns metabase.task.DynamicClassLoadHelper
  "This is needed to get the JDBC backend for Quartz working, or something like that. See
  http://clojurequartz.info/articles/durable_quartz_stores.html for details."
  (:require [clojure.string :as str])
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

(defn- task-class-name->namespace-str
  "Determine the namespace we need to load for one of our tasks.

    (task-class-name->namespace-str \"metabase.task.upgrade_checks.CheckForNewVersions\")
    ;; -> \"metabase.task.upgrade-checks\""
  [class-name]
  (-> class-name
      (str/replace \_ \-)
      (str/replace #"\.\w+$" "")))

(defn- require-task-namespace
  "Since Metabase tasks are defined in Clojure-land we need to make sure we `require` the namespaces where they are
  defined before we try to load the task classes."
  [class-name]
  ;; only try to `require` metabase.task classes; don't do this for other stuff that gets shuffled thru here like
  ;; Quartz classes
  (when (str/starts-with? class-name "metabase.task.")
    (require (symbol (task-class-name->namespace-str class-name)))))

(defn -loadClass
  "Class loadClass(String className)

  Return the class with the given name."
  ([^metabase.task.DynamicClassLoadHelper this, ^String class-name]
   (require-task-namespace class-name)
   (.superLoadClass this class-name true)) ; loadClass(String name, boolean resolve)
  ([^metabase.task.DynamicClassLoadHelper this, ^String class-name, _]
   (require-task-namespace class-name)
   (.superLoadClass this class-name true)))

(defn -getClassLoader
  "ClassLoader getClassLoader()

  Enable sharing of the class-loader with 3rd party"
  [this]
  this)
