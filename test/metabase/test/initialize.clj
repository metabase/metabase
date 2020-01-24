(ns metabase.test.initialize
  "Logic for initializing different components that need to be initialized when running tests."
  (:require [clojure.string :as str]
            [colorize.core :as colorize]
            [metabase
             [config :as config]
             [util :as u]]
            [metabase.plugins.classloader :as classloader]))


;; (def ^:private ^:dynamic *require-chain* nil)

;; (defonce new-require
;;   (let [orig-require (var-get #'clojure.core/require)]
;;     (orig-require 'clojure.pprint)
;;     (fn [& args]
;;       (binding [*require-chain* (conj (vec *require-chain*) (ns-name *ns*))]
;;         (let [require-chain-description (apply str (interpose " -> " *require-chain*))]
;;           (println "\nin" require-chain-description)
;;           ((resolve 'clojure.pprint/pprint) (cons 'require args))
;;           (apply orig-require args)
;;           (println "finished" require-chain-description))))))

;; (intern 'clojure.core 'require new-require)

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
  (doseq [k args]
    (initialize-if-needed! k)))

(defn- log-init-message [task-name]
  (let [body   (format "| Initializing %s... |" task-name)
        border (str \+ (str/join (repeat (- (count body) 2) \-)) \+)]
    (println
     (colorize/blue
      (str "\n"
           (str/join "\n" [border body border])
           "\n")))))

(def ^:private init-timeout-ms (* 30 1000))

(def ^:private ^:dynamic *initializing* [])

(defn- deref-init-delay [task-name a-delay]
  (try
    (when (contains? (set *initializing*) task-name)
      (throw (Exception. (format "Circular initialization dependencies! %s"
                                 (str/join " -> " (conj *initializing* task-name))))))
    (binding [*initializing* (conj *initializing* task-name)]
      (u/with-timeout init-timeout-ms
        @a-delay))
    (catch Throwable e
      (println "Error initializing" task-name)
      (println e)
      (when config/is-test?
        (System/exit -1))
      (throw e))))

(defmacro ^:private define-initialization [task-name & body]
  (let [delay-symb (-> (symbol (format "init-%s-%d" (name task-name) (hash &form)))
                       (with-meta {:private true}))]
    `(do
       (defonce ~delay-symb
         (delay
           (log-init-message ~(keyword task-name))
           (swap! initialized conj ~(keyword task-name))
           ~@body
           ~(keyword task-name)))
       (defmethod initialize-if-needed! ~(keyword task-name)
         [~'_]
         (deref-init-delay ~(keyword task-name) ~delay-symb)))))

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

(alter-meta! #'initialize-if-needed! assoc :arglists (list (into ['&] (sort (disj (set (keys (methods initialize-if-needed!)))
                                                                                  :many)))))
