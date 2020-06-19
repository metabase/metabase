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
  (:refer-clojure :exclude [require])
  (:require [clojure.string :as str]
            [clojure.tools.logging :as log]
            [dynapath.util :as dynapath])
  (:import [clojure.lang DynamicClassLoader RT]
           java.net.URL))

(defonce ^:private ^{:doc "The context classloader we'll use for *all threads*, once we figure out what that is.
  Guaranteed to be an instance of `DynamicClassLoader`."} shared-context-classloader
  (delay
   ;; If the Clojure runtime base loader is already an instance of DynamicClassLoader (e.g. it is something like
   ;; `clojure.lang.Compiler/LOADER` we can go ahead and use that in the future. This is usually the case when doing
   ;; REPL-based development or running via `lein`; when running from the UberJAR `clojure.lang.Compiler/LOADER` is
   ;; not set and thus this will return the current thread's context classloader, which is usually just the System
   ;; classloader.
   ;;
   ;; The base loader is what Clojure ultimately uses to loading namespaces with `require` so adding URLs to it is
   ;; they way to go, if we can)
   (or
    (when-let [base-loader (RT/baseLoader)]
      (when (instance? DynamicClassLoader base-loader)
        (log/tracef "Using Clojure base loader as shared context classloader: %s" base-loader)
        base-loader))
    ;; Otherwise if we need to create our own go ahead and do it
    ;;
    ;; Make a new classloader using the current thread's context classloader as it's parent. In cases where we hit
    ;; this condition (i.e., when running from the uberjar), the current thread's context classloader should be the
    ;; system classloader. Since it will be the same for other threads too it doesn't matter if we ignore *their*
    ;; context classloaders by giving them this one. No other places in the codebase should be modifying classloaders
    ;; anyway.
    (let [new-classloader (DynamicClassLoader. (.getContextClassLoader (Thread/currentThread)))]
      (log/tracef "Using NEWLY CREATED classloader as shared context classloader: %s" new-classloader)
      new-classloader))))

(defn- has-classloader-as-ancestor?
  "True if `classloader` and `ancestor` are the same object, or if `classloader` has `ancestor` as an ancestor in its
  parent chain, e.g. as a parent, its parent's parent, etc."
  [^ClassLoader classloader, ^ClassLoader ancestor]
  (cond
    (identical? classloader ancestor)
    true

    classloader
    (recur (.getParent classloader) ancestor)

    :else
    false))

(defn- has-shared-context-classloader-as-ancestor?
  "True if the `shared-context-classloader` has been set and it is an ancestor of `classloader`."
  [^ClassLoader classloader]
  (has-classloader-as-ancestor? classloader @shared-context-classloader))

(defn ^ClassLoader the-classloader
  "Fetch the context classloader for the current thread; ensure it has a our shared context classloader as an ancestor
  somewhere in its hierarchy, changing the thread's context classloader when needed.

  This function should be used when loading classes (such as JDBC drivers) with `Class/forName`; and for side-effects
  before calling `require`, to ensure the context classloader for the current thread is one that has access to the JARs
  we've added to the classpath."
  []
  (or
   ;; if the context classloader already has the classloader we'll add URLs to as an ancestor return it as-is
   (let [current-thread-context-classloader (.getContextClassLoader (Thread/currentThread))]
     (when (has-shared-context-classloader-as-ancestor? current-thread-context-classloader)
       current-thread-context-classloader))
   ;; otherwise set the current thread's context classloader to the shared context classloader
   (let [shared-classloader @shared-context-classloader]
     (log/tracef "Setting current thread context classloader to shared classloader %s..." shared-classloader)
     (.setContextClassLoader (Thread/currentThread) shared-classloader)
     shared-classloader)))

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
         (classloader-hierarchy classloader))))

(defn require
  "Just like vanilla `require`, but ensures we're using our shared classloader to do it. Always use this over vanilla
  `require` -- otherwise namespaces might get loaded by the wrong ClassLoader, resulting in weird, hard-to-debug
  errors."
  [& args]
  ;; done for side-effects to ensure context classloader is the right one
  (the-classloader)
  ;; as elsewhere make sure Clojure is using our context classloader (which should normally be true anyway) because
  ;; that's the one that will have access to the JARs we've added to the classpath at runtime
  (try
    (binding [*use-context-classloader* true]
      ;; serialize requires
      (locking clojure.lang.RT/REQUIRE_LOCK
        (apply clojure.core/require args)))
    (catch Throwable e
      (throw (ex-info (.getMessage e)
                      {:classloader      (the-classloader)
                       :classpath-urls   (map str (dynapath/all-classpath-urls (the-classloader)))
                       :system-classpath (sort (str/split (System/getProperty "java.class.path") #"[:;]"))}
                      e)))))

(defonce ^:private already-added (atom #{}))

(defn add-url-to-classpath!
  "Add a URL (presumably for a local JAR) to the classpath."
  [^URL url]
  (when-not (@already-added url)
    (swap! already-added conj url)
    ;; `add-classpath-url` will return non-truthy if it couldn't add the URL, e.g. because the classloader wasn't one
    ;; that allowed it
    (assert (dynapath/add-classpath-url (the-top-level-classloader) url))
    ;; don't i18n this or we will have circular refs
    (log/infof "Added URL %s to classpath" url)))
