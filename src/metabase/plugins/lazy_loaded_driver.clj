(ns metabase.plugins.lazy-loaded-driver
  "Implementation for a delayed-load driver that implements a few basic driver methods (`available?`, `display-name`,
  and `connection-properties`) needed for things like setup using the information provided in the plugin manifest.
  Other methods resolve drivers using `driver/the-initialized-driver`, which calls `initialize!`; we'll wait until
  that call to do more memory-intensive things like registering a JDBC driver or loading the actual driver namespace.

  See https://github.com/metabase/metabase/wiki/Metabase-Plugin-Manifest-Reference for all the options allowed for a
  plugin manifest."
  (:require [clojure.tools.logging :as log]
            [metabase
             [driver :as driver]
             [util :as u]]
            [metabase.driver.common :as driver.common]
            [metabase.plugins.initialize :as plugins.init]
            [metabase.util
             [date :as du]
             [i18n :refer [trs]]
             [ssh :as ssh]])
  (:import clojure.lang.MultiFn))

(defn- parse-connection-property [prop]
  (cond
    (string? prop)
    (or (driver.common/default-options (keyword prop))
        (throw (Exception. (str (trs "Default connection property {0} does not exist." prop)))))

    (not (map? prop))
    (throw (Exception. (str (trs "Invalid connection property {0}: not a string or map." prop))))

    (:merge prop)
    (reduce merge (map parse-connection-property (:merge prop)))

    :else
    prop))

(defn- parse-connection-properties
  "Parse the connection properties included in the plugin manifest. These can be one of several things -- a key
  referring to one of the default maps in `driver.common`, a entire custom map, or a list of maps to `merge:` (e.g.
  for overriding part, but not all, of a default option)."
  [{:keys [connection-properties connection-properties-include-tunnel-config]}]
  (cond-> (for [prop connection-properties]
            (parse-connection-property prop))

    connection-properties-include-tunnel-config
    ssh/with-tunnel-config))

(defn- make-initialize! [driver init-steps]
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
    (driver/initialize! driver)))

(defn register-lazy-loaded-driver!
  "Register a basic shell of a Metabase driver using the information from its Metabase plugin"
  [{init-steps :init, {driver-name :name, :keys [display-name parent], :as driver-info} :driver}]
  ;; Make sure the driver has required properties like driver-name
  (when-not (seq driver-name)
    (throw (ex-info (str (trs "Cannot initialize plugin: missing required property `driver-name`"))
             driver-info)))
  (let [driver (keyword driver-name)]
    (doseq [[^MultiFn multifn, f]
            {driver/initialize!           (make-initialize! driver init-steps)
             driver/available?            (constantly true)
             driver/display-name          (constantly display-name)
             driver/connection-properties (constantly (parse-connection-properties driver-info))}]
      (.addMethod multifn driver f))

    (log/info (u/format-color 'magenta (trs "Registering lazy loading driver {0}..." driver)))
    (driver/register! driver, :parent (keyword parent))))
