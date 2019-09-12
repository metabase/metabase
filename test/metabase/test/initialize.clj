(ns metabase.test.initialize
  "Logic for initializing different components that needed to be initialized when running tests."
  (:require [clojure.string :as str]
            [colorize.core :as colorize]))

(defmulti initialize-if-needed!
  "Initialize one or more components.

    (initialize-if-needed! :db :web-server)"
  (fn
    ([k]        (keyword k))
    ([k & more] :many)))

(defmethod initialize-if-needed! :many
  [& args]
  (doseq [k args]
    (initialize-if-needed! k)))

(defn- task-name-init-message [task-name]
  (let [body   (format "| Initializing %s... |" task-name)
        border (str \+ (str/join (repeat (- (count body) 2) \-)) \+)]
    (str "\n"
         (str/join "\n" [border body border])
         "\n")))

(defmacro ^:private define-initialization [task-name & body]
  (let [delay-symb (vary-meta (symbol (format "init-%s-%d" (name task-name) (hash &form)))
                              assoc :private true)]
    `(do
       (defonce ~delay-symb
         (delay
           (println (colorize/blue ~(task-name-init-message task-name)))
           ~@body
           nil))
       (defmethod initialize-if-needed! ~(keyword task-name)
         [~'_]
         @~delay-symb))))

(define-initialization :plugins
  (require 'metabase.test.initialize.plugins)
  ((resolve 'metabase.test.initialize.plugins/init!)))

(define-initialization :scheduler
  (require 'metabase.test.initialize.scheduler)
  ((resolve 'metabase.test.initialize.scheduler/init!)))

(define-initialization :db
  (require 'metabase.test.initialize.db)
  ((resolve 'metabase.test.initialize.db/init!)))

(define-initialization :web-server
  (initialize-if-needed! :db)
  (require 'metabase.test.initialize.web-server)
  ((resolve 'metabase.test.initialize.web-server/init!)))
