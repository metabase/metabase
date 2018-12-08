(ns metabase.plugins.lazy-loaded-driver
  "Implementation for a delayed-load driver that implements a few basic driver methods (`available?`, `display-name`,
  and `connection-properties`) needed for things like setup using the information provided in the plugin manifest.
  Other methods resolve drivers using `driver/the-initialized-driver`, which calls `initialize!`; we'll wait until
  that call to do more memory-intensive things like registering a JDBC driver or loading the actual driver namespace."
  (:require [clojure.tools.logging :as log]
            [metabase
             [driver :as driver]
             [util :as u]]
            [metabase.plugins.initialize :as plugins.init]
            [metabase.util
             [date :as du]
             [i18n :refer [trs]]])
  (:import clojure.lang.MultiFn))

(defn register-lazy-loaded-driver!
  "Register a basic shell of a Metabase driver using the information from its Metabase plugin"
  [{init-steps :init, {driver-name :name, :keys [display-name connection-properties parent]} :driver}]
  (let [driver (keyword driver-name)]
    (doseq [[^MultiFn multifn, f]
            {driver/initialize!
             (fn [_]
               ;; remove *this* implementation of `initialize!`, because as you will see below, we want to give
               ;; lazy-load drivers the option to implement `initialize!` and do other things, which means we need to
               ;; manually call it. When we do so we don't want to get stuck in an infinite loop of calls back to this
               ;; implementation
               (remove-method driver/initialize! driver)
               ;; ok, do the init steps listed in the plugin mainfest
               (du/profile (u/format-color 'magenta (trs "Load lazy loading driver {0}" driver))
                 (plugins.init/initialize! init-steps))
               ;; ok, now go ahead and call `driver/initialize!` a second time on the driver in case it actually has
               ;; an implementation of `initialize!` other than this one. If it does not, we'll just end up hitting
               ;; the default implementation, which is a no-op
               (driver/initialize! driver))

             driver/available?
             (constantly true)

             driver/display-name
             (constantly display-name)

             driver/connection-properties
             (constantly connection-properties)}]

      (.addMethod multifn driver f))

    (log/info (u/format-color 'magenta (trs "Registering lazy loading driver {0}..." driver)))
    (driver/register! driver, :parent (keyword parent))))
