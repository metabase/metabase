(ns metabase.test.initialize
  "Logic for initializing different components that need to be initialized when running tests."
  (:require [clojure.string :as str]
            [colorize.core :as colorize]
            [metabase
             [config :as config]
             [util :as u]]
            [metabase.plugins.classloader :as classloader]))

(defmulti ^:private do-initialization!
  "Perform component-specific initialization. This is guaranteed to only be called once."
  {:arglists '([init-setp])}
  keyword)

(defn- log-init-message [task-name]
  (let [body   (format "| Initializing %s... |" task-name)
        border (str \+ (str/join (repeat (- (count body) 2) \-)) \+)]
    (println
     (colorize/blue
      (str "\n"
           (str/join "\n" [border body border])
           "\n")))))

(def ^:private init-timeout-ms (* 30 1000))

(def ^:private ^:dynamic *initializing*
  "Collection of components that are being currently initialized by the current thread."
  [])

(defonce ^:private initialized (atom #{}))

(defn- check-for-circular-deps [step]
  (when (contains? (set *initializing*) step)
    (throw (Exception. (format "Circular initialization dependencies! %s"
                               (str/join " -> " (conj *initializing* step)))))))

(defn- initialize-if-needed!* [step]
  (try
    (log-init-message step)
    (binding [*initializing* (conj *initializing* step)]
      (u/with-timeout init-timeout-ms
        (do-initialization! step)))
    (catch Throwable e
      (println "Error initializing" step)
      (println e)
      (when config/is-test?
        (System/exit -1))
      (throw e))))

(defn initialize-if-needed!
  "Initialize one or more components.

    (initialize-if-needed! :db :web-server)"
  [& steps]
  (doseq [step steps
          :let [step (keyword step)]]
    (when-not (@initialized step)
      (check-for-circular-deps step)
      (locking step
        (when-not (@initialized step)
          (initialize-if-needed!* step)
          (swap! initialized conj step))))))

(defn initialized?
  "Has this component been initialized?"
  ([k]
   (contains? @initialized k))

  ([k & more]
   (and (initialized? k)
        (apply initialized? more))))

(defmacro ^:private define-initialization [task-name & body]
  `(defmethod do-initialization! ~(keyword task-name)
     [~'_]
     ~@body))

(define-initialization :plugins
  (classloader/require 'metabase.test.initialize.plugins)
  ((resolve 'metabase.test.initialize.plugins/init!)))

;; initializing the DB also does setup needed so the scheduler will work correctly. (Remember that the scheduler uses
;; a JDBC backend!)
(define-initialization :db
  (classloader/require 'metabase.test.initialize.db)
  ((resolve 'metabase.test.initialize.db/init!)))

(define-initialization :web-server
  (initialize-if-needed! :db)
  (classloader/require 'metabase.test.initialize.web-server)
  ((resolve 'metabase.test.initialize.web-server/init!)))

(define-initialization :test-users
  (initialize-if-needed! :db)
  (classloader/require 'metabase.test.initialize.test-users)
  ((resolve 'metabase.test.initialize.test-users/init!)))

(define-initialization :test-users-personal-collections
  (initialize-if-needed! :test-users)
  (classloader/require 'metabase.test.initialize.test-users-personal-collections)
  ((resolve 'metabase.test.initialize.test-users-personal-collections/init!)))

(define-initialization :events
  (classloader/require 'metabase.test.initialize.events)
  ((resolve 'metabase.test.initialize.events/init!)))

(defn- all-components
  "Set of all components/initialization steps that are defined."
  []
  (set (keys (methods do-initialization!))))

;; change the arglists for `initialize-if-needed!` to list all the possible args for REPL-usage convenience
(alter-meta! #'initialize-if-needed! assoc :arglists (list (into ['&] (sort (all-components)))))
