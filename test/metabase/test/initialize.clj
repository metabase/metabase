(ns metabase.test.initialize
  "Logic for initializing different components that need to be initialized when running tests."
  (:require [clojure.string :as str]
            [colorize.core :as colorize]
            [metabase
             [config :as config]
             [util :as u]]
            [metabase.plugins.classloader :as classloader]))

(defmulti initialize-if-needed!
  "Initialize one or more components.

    (initialize-if-needed! :db :web-server)"
  (fn
    ([k]        (keyword k))
    ([k & more] :many)))

(defonce ^:private initialized (atom #{}))

(defn initialized?
  "Has this component been initialized?"
  ([k]
   (contains? @initialized k))

  ([k & more]
   (and (initialized? k)
        (apply initialized? more))))

(defmethod initialize-if-needed! :many
  [& args]
  (doseq [result (pmap (fn [k]
                         (try
                           (initialize-if-needed! k)
                           (catch Throwable e
                             e)))
                       args)]
    (when (instance? Throwable result)
      (throw result))))

(defn- log-init-message [task-name]
  (let [body   (format "| Initializing %s... |" task-name)
        border (str \+ (str/join (repeat (- (count body) 2) \-)) \+)
        msg    (colorize/blue
                (str "\n"
                     (str/join "\n" [border body border])
                     "\n"))]
    (locking log-init-message
      (println msg))))

(def ^:private init-task-timeout-ms
  "Max amount of time to wait for an initialization task to complete."
  30000)

(defonce ^:private started-initialization (atom #{}))

(defn- do-initialization [task-name thunk]
  (letfn [(thunk' []
            (log-init-message task-name)
            (u/with-timeout init-task-timeout-ms (thunk))
            (swap! initialized conj task-name)
            task-name)]
    (when-not (initialized? task-name)
      (let [[old] (swap-vals! started-initialization conj task-name)]
        (when-not (get old task-name)
          (try
            (thunk')
            (catch Throwable e
              (swap! started-initialization disj task-name)
              (when config/is-test?
                (println "Failed to initialize" task-name)
                (println e)
                (System/exit -1))
              (throw e))))))))

;; Basic idea is we create a delay that contains the actual logic for initialization, then when you call
;; `initialize-if-needed!` it derefs the delay.
(defmacro ^:private define-initialization [task-name & body]
  `(defmethod initialize-if-needed! ~(keyword task-name)
     [~'_]
     (do-initialization ~(keyword task-name) (fn [] ~@body))))

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

(let [init-method-keys (disj (set (keys (methods initialize-if-needed!))) :many)]
  (alter-meta! #'initialize-if-needed! assoc :arglists (list (into ['&] (sort init-method-keys)))))
