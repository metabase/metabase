(ns metabase.plugins.classloader
  "Logic for getting and setting the context classloader we'll use for loading Metabase plugins. Use `the-classloader`
  to get the Classloader you should use with calls to `Class/forName`; call it for side effects to ensure the current
  thread context classloader will have access to JARs we add at runtime before calling `require`.

  The classloader is guaranteed to be an instance of `DynamicClassLoader`, which means we can add URLs to it at
  runtime with dynapath; use `add-url-to-classpath!` to add URLs to the classpath to make sure they are added to the
  correct classloader.

  If you are unfamiliar with ClassLoaders in general, I found this article pretty helpful:
  https://www.javaworld.com/article/2077344/core-java/find-a-way-out-of-the-classloader-maze.html.

  <3 Cam"
  (:require [clojure.tools.logging :as log]
            [dynapath.util :as dynapath]
            [metabase.util :as u]
            [metabase.util.i18n :refer [trs]])
  (:import [clojure.lang DynamicClassLoader RT]
           java.net.URL))

(def ^:private shared-context-classloader
  "The context classloader we'll use for *all threads*, once we figure out what that is. Guaranteed to be an instance of
  `DynamicClassLoader`."
  (promise))

;; If the Clojure runtime base loader is already an instance of DynamicClassLoader (e.g. it is something like
;; `clojure.lang.Compiler/LOADER` we can go ahead and use that in the future. This is usually the case when doing
;; REPL-based development or running via `lein`; when running from the UberJAR `clojure.lang.Compiler/LOADER` is not
;; set and thus this will return the current thread's context classloader, which is usually just the System classloader.
;;
;; The base loader is what Clojure ultimately uses to loading namespaces with `require` so adding URLs to it is they
;; way to go, if we can
(when-not *compile-files*
  (u/prog1 (RT/baseLoader)
    (when (instance? DynamicClassLoader <>)
      (log/debug (trs "Using Clojure base loader as shared context classloader: {0}" <>))
      (deliver shared-context-classloader <>))))


(defn- has-classloader-as-ancestor?
  "True if `classloader` and `ancestor` are the same object, or if `classloader` has `ancestor` as an ancestor in its
  parent chain, e.g. as a parent, its parent's parent, etc."
  [^ClassLoader classloader, ^ClassLoader ancestor]
  (cond
    (identical? classloader ancestor)
    true

    classloader
    (recur (.getParent classloader) ancestor)))

(defn- has-shared-context-classloader-as-ancestor?
  "True if the `shared-context-classloader` has been set and it is an ancestor of `classloader`."
  [^ClassLoader classloader]
  (when (realized? shared-context-classloader)
    (has-classloader-as-ancestor? classloader @shared-context-classloader)))


(defn ^ClassLoader the-classloader
  "Fetch the context classloader for the current thread; ensure it has a our shared context classloader as an ancestor
  somewhere in its hierarchy, changing the thread's context classloader when needed.

  This function should be used when loading classes (such as JDBC drivers) with `Class/forName`; and for side-effects
  before calling `require`, to ensure the context classloader for the current thread is one that has access to the JARs
  we've added to the classpath."
  []
  (let [current-thread-context-classloader (.getContextClassLoader (Thread/currentThread))]
    (cond
      ;; if the context classloader already has the classloader we'll add URLs to as an ancestor return it as-is
      (has-shared-context-classloader-as-ancestor? current-thread-context-classloader)
      current-thread-context-classloader

      ;; Otherwise we'll have to create our own new context classloader. We'll use the same one for all the threads
      ;; that need it. Check and see if we've already made one; if so, we can return that as-is
      (realized? shared-context-classloader)
      (u/prog1 @shared-context-classloader
        (log/debug (trs "Setting current thread context classloader to shared classloader {0}..." <>))
        (.setContextClassLoader (Thread/currentThread) <>))

      ;; Otherwise if we need to create our own and it HAS NOT been done yet go ahead and do it
      :else
      (do
        ;; Make a new classloader using the current thread's context classloader as it's parent. In cases where we hit
        ;; this condition (i.e., when running from the uberjar), the current thread's context classloader should be
        ;; the system classloader. Since it will be the same for other threads too it doesn't matter if we ignore
        ;; *their* context classloaders by giving them this one. No other places in the codebase should be modifying
        ;; classloaders anyway.
        (deliver shared-context-classloader (DynamicClassLoader. current-thread-context-classloader))
        ;; it's important that we deref the promise again here instead of using the one we just created because it is
        ;; possible thru a race condition that somebody else delivered the promise before we did; in that case,
        ;; Clojure ignores subsequent calls to `deliver`. Dereffing the promise guarantees that we'll get the actual
        ;; value of it rather than one that ends up getting discarded
        (log/debug (trs "Setting current thread context classloader to NEWLY CREATED classloader {0}..."
                        @shared-context-classloader))
        (.setContextClassLoader (Thread/currentThread) @shared-context-classloader)))))


(defn- classloader-hierarchy
  "Return a sequence of classloaders representing the hierarchy for `classloader` by iterating over calls to
  `.getParent`. The classloaders are in order from most distant ancestor to least; i.e. first item in the sequence is
  the highest classloader in the hierarchy (which should be the platform classloader)."
  [^ClassLoader classloader]
  (reverse (take-while some? (iterate #(.getParent ^ClassLoader %) classloader))))

(defn- the-top-level-classloader
  "Find the highest-level DynamicClassLoader, starting our search with the current thread's context classloader; the
  classloader will be changed as needed by a call to `the-classloader`. The call to `the-classloader`, will, as a
  side-effect, make the current thread's context classloader one that has the shared classloader that we add URLs as
  an ancestor if it does not already have it as one.

  This classloader is the one we'll add URLs to.

  Why? In nREPL-based usage, the REPL creates a new classloader for each statement, using the prior one as its parent;
  if we add URLs to the lowest classloader on the chain, any other threads using an ancestor classloader won't have
  the new URL. By adding the URL to the highest-level classloader we can, the current thread and other threads will be
  ultimately have access to that URL."
  (^DynamicClassLoader []
   (the-top-level-classloader (the-classloader)))
  (^DynamicClassLoader [^DynamicClassLoader classloader]
   (some #(when (instance? DynamicClassLoader %) %)
         (classloader-hierarchy (.getContextClassLoader (Thread/currentThread))))))


(defn add-url-to-classpath!
  "Add a URL (presumably for a local JAR) to the classpath."
  [^URL url]
  ;; `add-classpath-url` will return non-truthy if it couldn't add the URL, e.g. because the classloader wasn't one
  ;; that allowed it
  (assert (dynapath/add-classpath-url (the-top-level-classloader) url))
  (log/info (u/format-color 'blue (trs "Added URL {0} to classpath" url))))
