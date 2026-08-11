(ns metabase.test.initialize
  "Logic for initializing different components that need to be initialized when running tests."
  (:require
   [clojure.string :as str]
   [integrant.core :as ig]
   [mb.hawk.init]
   [metabase.classloader.core :as classloader]
   [metabase.config.core :as config]
   [metabase.notification.core :as notification]
   [metabase.util :as u]
   [metabase.util.log :as log]))

(set! *warn-on-reflection* true)

;;; ---------------------------------------------- dependency graph ----------------------------------------------

(def ^:private config
  "Which fixtures each fixture needs initialized before it can run.

  Component values carry no data. Every component's effect is exogenous -- namespaces loaded, rows written, global
  vars mutated -- so the refs exist only to order initialization, and the system map `ig/build` returns is discarded."
  {::plugins       {}
   ::test-drivers  {}
   ;; loads the namespaces that install the system's multimethods, settings, tasks and event handlers. Components
   ;; below write rows through models whose behavior those methods provide -- e.g. inserting an AuthIdentity
   ;; dispatches `metabase.auth-identity.provider/validate`, which only exists once `metabase.auth-identity.init` is
   ;; loaded.
   ::core-init     {}
   ;; `register-listeners!` iterates the `def-listener!` implementations loaded at that moment, so every namespace
   ;; declaring one has to be loaded first. Must precede ::db so listeners (e.g. connection-pool-invalidated) exist
   ;; when database initialization triggers events.
   ::mq            {:core-init (ig/ref ::core-init)}
   ;; migrating triggers events (e.g. connection-pool-invalidated) and sets up the scheduler, both of which run
   ;; handlers installed by the init namespaces
   ::db            {:core-init (ig/ref ::core-init)
                    :mq        (ig/ref ::mq)}
   ;; the handler routes to API namespaces, and `set!`ting the site name goes through the settings machinery
   ::web-server    {:core-init (ig/ref ::core-init)
                    :db        (ig/ref ::db)}
   ;; creating a user inserts an AuthIdentity, which dispatches `auth-identity.provider/validate :provider/password`
   ::test-users    {:core-init (ig/ref ::core-init)
                    :db        (ig/ref ::db)}
   ;; personal collections are created through the Collection model's hooks
   ::test-users-personal-collections {:core-init  (ig/ref ::core-init)
                                      :test-users (ig/ref ::test-users)}
   ;; seeding writes Notification rows, whose channels and payload types are registered by the init namespaces
   ::notifications {:core-init (ig/ref ::core-init)
                    :db        (ig/ref ::db)}
   ::row-lock      {:db (ig/ref ::db)}})

(def ^:private step->key
  "Maps the unqualified keyword callers pass to [[initialize-if-needed!]] onto its [[config]] key."
  (into {} (map (juxt (comp keyword name) identity)) (keys config)))

;;; ------------------------------------------------- time budgets -------------------------------------------------

(def ^:private default-budget
  "Merged under each component's [[ig/annotate]] map, so an annotation may override either key alone."
  {::warn-after-ms (u/seconds->ms 30)
   ::timeout-ms    (u/minutes->ms 5)})

;;; A budget covers a component's own work only: `ig/build` initializes each dependency under its own budget before
;;; the dependent runs, so nothing here has to leave room for the graph beneath it.
;;;
;;; `::timeout-ms` is a hang detector, not a performance target -- it is set well above anything a healthy run
;;; produces. `::warn-after-ms` is the knob that surfaces drift. Measured locally against H2: ::db ~10.5s,
;;; ::web-server ~10s, ::test-users ~1s, ::plugins ~100ms, ::mq ~10ms, ::core-init ~1ms (its namespaces are already
;;; loaded by the time test discovery finishes). CI, with real app DBs and DRIVERS=all, runs well above these.
(ig/annotate ::db         {::warn-after-ms (u/seconds->ms 60), ::timeout-ms (u/minutes->ms 10)})
(ig/annotate ::web-server {::warn-after-ms (u/seconds->ms 60)})
(ig/annotate ::core-init  {::warn-after-ms (u/seconds->ms 60)})
(ig/annotate ::plugins    {::warn-after-ms (u/seconds->ms 45)})

(defn- budget [k]
  (merge default-budget (ig/describe k)))

;;; ------------------------------------------------ initialization ------------------------------------------------

(defonce ^:private initialized (atom #{}))

(defn- log-init-message [task-name]
  (let [body   (format "| Initializing %s... |" task-name)
        border (str \+ (str/join (repeat (- (count body) 2) \-)) \+)]
    (log/info (u/colorize :blue (str "\n"
                                     (str/join "\n" [border body border])
                                     "\n")))))

(defn- init-with-budget! [k v]
  (let [{::keys [warn-after-ms timeout-ms]} (budget k)]
    (log-init-message k)
    (u/with-timer-ms [duration-ms]
      (let [result (u/with-timeout timeout-ms (ig/init-key k v))
            ms     (long (duration-ms))]
        (if (< ms warn-after-ms)
          (log/infof "Initialized %s in %d ms" k ms)
          (log/warnf "Initialized %s in %d ms, over its %d ms warning threshold" k ms warn-after-ms))
        result))))

(defn- init-once!
  "The function `ig/build` applies to every key. Wraps [[ig/init-key]] with the once-per-JVM guard and the key's time
  budget. Components are only idempotent because of this guard: their work lands in global state, not in the system
  map, so running one twice would repeat the side effects."
  [k v]
  (if (@initialized k)
    ::already-initialized
    (locking k
      (if (@initialized k)
        ::already-initialized
        (u/prog1 (try
                   (init-with-budget! k v)
                   (catch Throwable e
                     (log/fatalf e "Error initializing %s" k)
                     (when config/is-test?
                       (System/exit -1))
                     (throw e)))
          (swap! initialized conj k))))))

(defn initialize-if-needed!
  "Initialize one or more components, and anything they depend on.

    (initialize-if-needed! :db :test-users)"
  [& steps]
  ;; `:plugins` initialization is ok when loading test namespaces. Nothing else is tho (e.g. starting up the
  ;; application DB, or starting up the web server).
  (when-not (= steps [:plugins])
    (mb.hawk.init/assert-tests-are-not-initializing (pr-str (cons 'initialize-if-needed! steps))))
  (let [ks (mapv (fn [step]
                   (or (step->key (keyword step))
                       (throw (ex-info (format "Unknown initialization step: %s" step)
                                       {:step step, :known-steps (sort (keys step->key))}))))
                 steps)]
    ;; `ig/build` rather than `ig/init` so that every key goes through [[init-once!]]; `ig/init` is this same call
    ;; with `ig/init-key` passed directly, which would give us neither the once-only guard nor the budgets.
    (ig/build config ks init-once!))
  nil)

(defn initialized?
  "Has this component been initialized?"
  [k & more]
  (let [done @initialized]
    (every? #(contains? done (step->key (keyword %))) (cons k more))))

(defn all-components
  "Set of all components/initialization steps that are defined."
  []
  (set (keys step->key)))

;;; ------------------------------------------------- components -------------------------------------------------

(defmethod ig/init-key ::plugins [_ _]
  (classloader/require 'metabase.test.initialize.plugins)
  ((resolve 'metabase.test.initialize.plugins/init!)))

;; initialize test drivers that are not shipped as part of the product
;; this is needed because if DRIVERS=all in the environment, then only the directories within modules are searched to
;; determine the set of available drivers, so the "test only" drivers that live under test_modules will never be
;; registered
(defmethod ig/init-key ::test-drivers [_ _]
  (classloader/require 'metabase.test.initialize.plugins)
  ((resolve 'metabase.test.initialize.plugins/init-test-drivers!)
   [:driver-deprecation-test-legacy :driver-deprecation-test-new :secret-test-driver]))

(defmethod ig/init-key ::core-init [_ _]
  (classloader/require 'metabase.core.init))

;; Initialize the MQ subsystem: sync backends, no buffering, register listeners.
(defmethod ig/init-key ::mq [_ _]
  (classloader/require 'metabase.test.initialize.mq)
  ((resolve 'metabase.test.initialize.mq/init!)))

;; initializing the DB also does setup needed so the scheduler will work correctly. (Remember that the scheduler uses
;; a JDBC backend!)
(defmethod ig/init-key ::db [_ _]
  (classloader/require 'metabase.test.initialize.db)
  ((resolve 'metabase.test.initialize.db/init!)))

(defmethod ig/init-key ::web-server [_ _]
  (classloader/require 'metabase.test.initialize.web-server)
  ((resolve 'metabase.test.initialize.web-server/init!)))

(defmethod ig/init-key ::test-users [_ _]
  (classloader/require 'metabase.test.initialize.test-users)
  ((resolve 'metabase.test.initialize.test-users/init!)))

(defmethod ig/init-key ::test-users-personal-collections [_ _]
  (classloader/require 'metabase.test.initialize.test-users-personal-collections)
  ((resolve 'metabase.test.initialize.test-users-personal-collections/init!)))

(defmethod ig/init-key ::notifications [_ _]
  (notification/seed-notification!))

(defmethod ig/init-key ::row-lock [_ _]
  (classloader/require 'metabase.test.initialize.row-lock)
  ((resolve 'metabase.test.initialize.row-lock/init!)))

;; change the arglists for `initialize-if-needed!` to list all the possible args for REPL-usage convenience. Don't do
;; this directly in `initialize-if-needed!` itself because it breaks Eastwood.
(alter-meta! #'initialize-if-needed! assoc :arglists (list (into ['&] (sort (all-components)))))
