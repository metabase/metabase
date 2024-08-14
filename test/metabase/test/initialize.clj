(ns metabase.test.initialize
  "Logic for initializing different components that need to be initialized when running tests."
  (:require
   [clojure.string :as str]
   [mb.hawk.init]
   [metabase.config :as config]
   [metabase.plugins.classloader :as classloader]
   [metabase.util :as u]
   [metabase.util.log :as log]))

(set! *warn-on-reflection* true)

(defmulti ^:private do-initialization!
  "Perform component-specific initialization. This is guaranteed to only be called once."
  {:arglists '([init-step])}
  keyword)

(defn- log-init-message [task-name]
  (let [body   (format "| Initializing %s... |" task-name)
        border (str \+ (str/join (repeat (- (count body) 2) \-)) \+)]
    (log/info (u/colorize :blue (str "\n"
                                     (str/join "\n" [border body border])
                                     "\n")))))

(def ^:private init-timeout-ms (u/seconds->ms 60))

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
      (log/fatalf e "Error initializing %s" step)
      (when config/is-test?
        (System/exit -1))
      (throw e))))

(defn initialize-if-needed!
  "Initialize one or more components.

    (initialize-if-needed! :db :web-server)"
  [& steps]
  ;; `:plugins` initialization is ok when loading test namespaces. Nothing else is tho (e.g. starting up the
  ;; application DB, or starting up the web server).
  (when-not (= steps [:plugins])
    (mb.hawk.init/assert-tests-are-not-initializing (pr-str (cons 'initialize-if-needed! steps))))
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

;; initialize test drivers that are not shipped as part of the product
;; this is needed because if DRIVERS=all in the environment, then only the directories within modules are searched to
;; determine the set of available drivers, so the "test only" drivers that live under test_modules will never be
;; registered
(define-initialization :test-drivers
  (classloader/require 'metabase.test.initialize.plugins)
  ((resolve 'metabase.test.initialize.plugins/init-test-drivers!)
   [:driver-deprecation-test-legacy :driver-deprecation-test-new :secret-test-driver]))

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

(defn- all-components
  "Set of all components/initialization steps that are defined."
  []
  (set (keys (methods do-initialization!))))

;; change the arglists for `initialize-if-needed!` to list all the possible args for REPL-usage convenience. Don't do
;; this directly in `initialize-if-needed!` itself because it breaks Eastwood.
(alter-meta! #'initialize-if-needed! assoc :arglists (list (into ['&] (sort (all-components)))))
