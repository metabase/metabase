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
  "Fixture dependencies. Refs only order initialization -- each component's effect is exogenous (namespaces loaded,
  rows written, global vars mutated), never a value in the system map."
  {::plugins       {}
   ::test-drivers  {}
   ;; installs the multimethods, settings, tasks and event handlers everything below relies on -- e.g. inserting an
   ;; AuthIdentity dispatches `auth-identity.provider/validate`, which exists only once its init ns is loaded
   ::core-init     {}
   ;; `register-listeners!` only sees `def-listener!` implementations already loaded, and ::db triggers events, so
   ;; this has to land between them
   ::mq            {:core-init (ig/ref ::core-init)}
   ;; migrating triggers events and sets up the scheduler, both of which run handlers from the init namespaces
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
  "Unqualified keyword callers pass to [[initialize-if-needed!]] -> its [[config]] key."
  (into {} (map (juxt (comp keyword name) identity)) (keys config)))

;;; ------------------------------------------------- time budgets -------------------------------------------------

(def ^:private default-budget
  {::warn-after-ms (u/seconds->ms 30)
   ::timeout-ms    (u/minutes->ms 5)})

;;; A budget covers a component's own work only -- dependencies are initialized under their own.
;;;
;;; `::timeout-ms` catches hangs; `::warn-after-ms` surfaces drift. Measured locally against H2: ::db ~10.5s,
;;; ::web-server ~10s, ::test-users ~1s, ::plugins ~100ms, ::mq ~10ms, ::core-init ~1ms. CI, with real app DBs and
;;; DRIVERS=all, runs well above these.
(ig/annotate ::db         {::warn-after-ms (u/seconds->ms 60), ::timeout-ms (u/minutes->ms 10)})
(ig/annotate ::web-server {::warn-after-ms (u/seconds->ms 60)})
(ig/annotate ::core-init  {::warn-after-ms (u/seconds->ms 60)})
(ig/annotate ::plugins    {::warn-after-ms (u/seconds->ms 45)})

(defn- budget [k]
  (merge default-budget (ig/describe k)))

;;; ------------------------------------------------ initialization ------------------------------------------------

(defonce ^{:private true
           :doc "Initialized keys -> whatever their [[ig/init-key]] returned. The system map a normal integrant
                application would hold onto; here it is what makes a repeat demand a lookup rather than a
                re-initialization."}
  system
  (atom {}))

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
  "Adds the once-per-JVM guard and the key's time budget to [[ig/init-key]]. The components are not self-idempotent --
  their work lands in global state, so a second run would repeat the side effects."
  [k v]
  ;; `contains?`, not truthiness -- plenty of these components return nil
  (if (contains? @system k)
    (@system k)
    (locking k
      (if (contains? @system k)
        (@system k)
        (let [result (try
                       (init-with-budget! k v)
                       (catch Throwable e
                         (log/fatalf e "Error initializing %s" k)
                         (when config/is-test?
                           (System/exit -1))
                         (throw e)))]
          (swap! system assoc k result)
          result)))))

(defn initialize-if-needed!
  "Initialize one or more components, and anything they depend on.

    (initialize-if-needed! :db :test-users)"
  [& steps]
  ;; `:plugins` initialization is ok when loading test namespaces. Nothing else is tho (e.g. starting up the
  ;; application DB, or starting up the web server).
  (when-not (= steps [:plugins])
    (mb.hawk.init/assert-tests-are-not-initializing (pr-str (cons 'initialize-if-needed! steps))))
  (let [requested (map keyword steps)
        ks        (map step->key requested)
        unknown   (remove step->key requested)]
    (when (seq unknown)
      (throw (ex-info (str "Unknown initialization steps: " (str/join ", " unknown))
                      {:unknown-steps (vec unknown)
                       :known-steps   (sort (keys step->key))})))
    ;; `ig/build` rather than `ig/init`: `ig/init` passes `ig/init-key` straight through, losing the guard and budgets
    (ig/build config ks init-once!))
  nil)

(defn initialized?
  "Has this component been initialized?"
  [k & more]
  (let [done @system]
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
