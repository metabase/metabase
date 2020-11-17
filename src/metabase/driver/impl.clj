(ns metabase.driver.impl
  "Internal implementation functions for `metabase.driver`. These functions live in a separate namespace to reduce the
  clutter in `metabase.driver` itself."
  (:require [clojure.tools.logging :as log]
            [metabase.plugins.classloader :as classloader]
            [metabase.util :as u]
            [metabase.util.i18n :refer [trs tru]]
            [schema.core :as s]))

;;; --------------------------------------------------- Hierarchy ----------------------------------------------------

(defonce ^{:doc "Driver hierarchy. Used by driver multimethods for dispatch. Add new drivers with `regsiter!`."}
  hierarchy
  (make-hierarchy))

(defn registered?
  "Is `driver` a valid registered driver?"
  [driver]
  (isa? hierarchy (keyword driver) :metabase.driver/driver))

(defn concrete?
  "Is `driver` registered, and non-abstract?"
  [driver]
  (isa? hierarchy (keyword driver) ::concrete))

(defn abstract?
  "Is `driver` an abstract \"base class\"? i.e. a driver that you cannot use directly when adding a Database, such as
  `:sql` or `:sql-jdbc`."
  [driver]
  (not (concrete? driver)))


;;; -------------------------------------------- Loading Driver Namespace --------------------------------------------

(s/defn ^:private driver->expected-namespace [driver :- s/Keyword]
  (symbol
   (or (namespace driver)
       (str "metabase.driver." (name driver)))))

(defn- require-driver-ns
  "`require` a driver's 'expected' namespace."
  [driver & require-options]
  (let [expected-ns (driver->expected-namespace driver)]
    (log/debug
     (trs "Loading driver {0} {1}" (u/format-color 'blue driver) (apply list 'require expected-ns require-options)))
    (try
      (apply classloader/require expected-ns require-options)
      (catch Throwable e
        (log/error e (tru "Error loading driver namespace"))
        (throw (Exception. (tru "Could not load {0} driver." driver) e))))))

(defn load-driver-namespace-if-needed!
  "Load the expected namespace for a `driver` if it has not already been registed. This only works for core Metabase
  drivers, whose namespaces follow an expected pattern; drivers provided by 3rd-party plugins are expected to register
  themselves in their plugin initialization code.

  You should almost never need to do this directly; it is handled automatically when dispatching on a driver and by
  `register!` below (for parent drivers) and by `driver.u/database->driver` for drivers that have not yet been
  loaded."
  [driver]
  (when-not *compile-files*
    (when-not (registered? driver)
      (u/profile (trs "Load driver {0}" driver)
        (require-driver-ns driver)
        ;; ok, hopefully it was registered now. If not, try again, but reload the entire driver namespace
        (when-not (registered? driver)
          (require-driver-ns driver :reload)
          ;; if *still* not registered, throw an Exception
          (when-not (registered? driver)
            (throw (Exception. (tru "Driver not registered after loading: {0}" driver)))))))))


;;; -------------------------------------------------- Registration --------------------------------------------------

(defn check-abstractness-hasnt-changed
  "Check to make sure we're not trying to change the abstractness of an already registered driver"
  [driver new-abstract?]
  (when (registered? driver)
    (let [old-abstract? (boolean (abstract? driver))
          new-abstract? (boolean new-abstract?)]
      (when (not= old-abstract? new-abstract?)
        (throw (Exception. (tru "Error: attempting to change {0} property `:abstract?` from {1} to {2}."
                                driver old-abstract? new-abstract?)))))))

(defn register!
  "Register a driver.

    (register! :sql, :abstract? true)

    (register! :postgres, :parent :sql-jdbc)

  Valid options are:

  ###### `:parent` (default = none)

  Parent driver(s) to derive from. Drivers inherit method implementations from their parents similar to the way
  inheritance works in OOP. Specify multiple direct parents by passing a collection of parents.

  You can add additional parents to a driver using `add-parent!` below; this is how test extensions are implemented.

  ###### `:abstract?` (default = false)

  Is this an abstract driver (i.e. should we hide it in the admin interface, and disallow running queries with it)?

  Note that because concreteness is implemented as part of our keyword hierarchy it is not currently possible to
  create an abstract driver with a concrete driver as its parent, since it would still ultimately derive from
  `::concrete`."
  {:style/indent 1}
  [driver & {:keys [parent abstract?]}]
  {:pre [(keyword? driver)]}
  ;; no-op during compilation.
  (when-not *compile-files*
    (let [parents (filter some? (u/one-or-many parent))]
      ;; load parents as needed; if this is an abstract driver make sure parents aren't concrete
      (doseq [parent parents]
        (load-driver-namespace-if-needed! parent))
      (when abstract?
        (doseq [parent parents
                :when  (concrete? parent)]
          (throw (ex-info (trs "Abstract drivers cannot derive from concrete parent drivers.")
                   {:driver driver, :parent parent}))))
      ;; validate that the registration isn't stomping on things
      (check-abstractness-hasnt-changed driver abstract?)
      ;; ok, if that was successful we can derive the driver from `:metabase.driver/driver`/`::concrete` and parent(s)
      (let [derive! (partial alter-var-root #'hierarchy derive driver)]
        (derive! :metabase.driver/driver)
        (when-not abstract?
          (derive! ::concrete))
        (doseq [parent parents]
          (derive! parent)))
      ;; ok, log our great success
      (log/info
       (u/format-color 'blue
           (if (metabase.driver.impl/abstract? driver)
             (trs "Registered abstract driver {0}" driver)
             (trs "Registered driver {0}" driver)))
       (if (seq parents)
         (trs "(parents: {0})" (vec parents))
         "")
       (u/emoji "🚚")))))


;;; ------------------------------------------------- Initialization -------------------------------------------------

;; We'll keep track of which drivers are initialized using a set rather than adding a special key to the hierarchy or
;; something like that -- we don't want child drivers to inherit initialized status from their ancestors
(defonce ^:private initialized-drivers
  ;; For the purposes of this exercise the special keywords used in the hierarchy should always be assumed to be
  ;; initialized so we don't try to call initialize on them, which of course would try to load their namespaces when
  ;; dispatching off `the-driver`; that would fail, so don't try it
  (atom #{:metabase.driver/driver ::concrete}))

(defn initialized?
  "Has `driver` been initialized? (See `initialize!` below for a discussion of what exactly this means.)"
  [driver]
  (@initialized-drivers driver))

(defonce ^:private initialization-lock (Object.))

(defn initialize-if-needed!
  "Initialize a driver by calling executing `(init-fn driver)` if it hasn't yet been initialized. Refer to documentation
  for `metabase.driver/initialize!` for a full explanation of what this means."
  [driver init-fn]
  ;; no-op during compilation
  (when-not *compile-files*
    ;; first, initialize parents as needed
    (doseq [parent (parents hierarchy driver)]
      (initialize-if-needed! parent init-fn))
    (when-not (initialized? driver)
      ;; if the driver is not yet initialized, acquire an exclusive lock for THIS THREAD to perform initialization to
      ;; make sure no other thread tries to initialize it at the same time
      (locking initialization-lock
        ;; and once we acquire the lock, check one more time to make sure the driver didn't get initialized by
        ;; whatever thread(s) we were waiting on.
        (when-not (initialized? driver)
          (log/info (u/format-color 'yellow (trs "Initializing driver {0}..." driver)))
          (log/debug (trs "Reason:") (u/pprint-to-str 'blue (drop 5 (u/filtered-stacktrace (Thread/currentThread)))))
          (swap! initialized-drivers conj driver)
          (init-fn driver))))))
