(ns metabase.plugins.lazy-loaded-driver
  "Implementation for a delayed-load driver that implements a few basic driver methods (`available?`, `display-name`,
  and `connection-properties`) needed for things like setup using the information provided in the plugin manifest.
  Other methods resolve drivers using `driver/the-initialized-driver`, which calls `initialize!`; we'll wait until
  that call to do more memory-intensive things like registering a JDBC driver or loading the actual driver namespace.

  See https://github.com/metabase/metabase/wiki/Metabase-Plugin-Manifest-Reference for all the options allowed for a
  plugin manifest."
  (:require
   [clojure.java.io :as io]
   [metabase.driver :as driver]
   [metabase.driver.common :as driver.common]
   [metabase.util :as u]
   [metabase.util.i18n :refer [trs]]
   [metabase.util.log :as log]
   [metabase.util.yaml :as yaml])
  (:import
   (clojure.lang MultiFn)))

(set! *warn-on-reflection* true)

(defn- parse-connection-property [prop]
  (cond
    (string? prop)
    (or (driver.common/default-options (keyword prop))
        (driver.common/default-connection-info-fields (keyword prop))
        (throw (Exception. (trs "Default connection property {0} does not exist." prop))))

    (not (map? prop))
    (throw (Exception. (trs "Invalid connection property {0}: not a string or map." prop)))

    (:group prop)
    ;; Handle nested group structure
    {:type :group
     :container-style (:container-style (:group prop))
     :fields (into [] (mapcat #(u/one-or-many (parse-connection-property %))) (:fields (:group prop)))}

    (:merge prop)
    (into {} (map parse-connection-property) (:merge prop))

    :else
    prop))

(defn- parse-connection-properties
  "Parse the connection properties included in the plugin manifest. These can be one of several things -- a key
  referring to one of the default maps in `driver.common`, a entire custom map, a list of maps to `merge:` (e.g.
  for overriding part, but not all, of a default option), or a nested group structure."
  [{:keys [connection-properties]}]
  (into []
        (mapcat (fn [prop]
                  (let [parsed (parse-connection-property prop)]
                    ;; If parsed result is a group, keep it as a single item
                    ;; Otherwise apply one-or-many to flatten merged properties
                    (if (and (map? parsed) (= :group (:type parsed)))
                      [parsed]
                      (u/one-or-many parsed)))))
        connection-properties))

(defn- make-initialize! [driver load-plugin!]
  (fn this-method [_]
    ;; Load first, so a failed load throws before we touch the method table -- the next `initialize!` retries
    ;; the load rather than falling through to the no-op default. Adds the JAR to the classpath and runs the
    ;; manifest init steps exactly once.
    (u/profile (u/format-color 'magenta (trs "Load lazy loading driver {0}" driver))
      (load-plugin!))
    ;; Drop this placeholder now that the plugin is loaded -- unless loading installed the driver's own
    ;; `initialize!`, in which case removing it would strand the driver on the no-op default. Dropping it also
    ;; stops the call below from looping back into this method.
    (when (identical? this-method (get-method driver/initialize! driver))
      (remove-method driver/initialize! driver))
    ;; Call `initialize!` again: the driver's own implementation if it installed one, else the no-op default.
    (driver/initialize! driver)))

(defn register-lazy-loaded-driver!
  "Register a basic shell of a Metabase driver using the information from its Metabase plugin"
  [{:keys                                                                                            [load-plugin!]
    extra-info                                                                                       :extra
    contact-info                                                                                     :contact-info
    superseded-by                                                                                    :superseded-by
    {driver-name :name, :keys [abstract display-name parent], :or {abstract false}, :as driver-info} :driver}]
  {:pre [(map? driver-info) (fn? load-plugin!)]}
  (let [driver           (keyword driver-name)
        connection-props (parse-connection-properties driver-info)]
    ;; Make sure the driver has required properties like driver-name
    (when-not (seq driver-name)
      (throw (ex-info (trs "Cannot initialize plugin: missing required property `driver-name`")
                      driver-info)))
    ;; if someone forgot to include connection properties for a non-abstract driver throw them a bone and warn them
    ;; about it
    (when (and (not abstract)
               (empty? connection-props))
      (log/warn (u/format-color :red "Warning: plugin manifest for %s does not include connection properties" driver)))
    ;; ok, now add implementations for the so-called "non-trivial" driver multimethods
    (doseq [[^MultiFn multifn, f]
            {driver/initialize!           (make-initialize! driver load-plugin!)
             driver/display-name          (when display-name (constantly display-name))
             driver/contact-info          (constantly contact-info)
             driver/connection-properties (constantly connection-props)
             driver/extra-info            (constantly extra-info)
             driver/superseded-by         (constantly (keyword superseded-by))}]
      (when f
        (.addMethod multifn driver f)))
    ;; finally, register the Metabase driver
    (log/debug (u/format-color :magenta "Registering lazy loading driver %s..." driver))
    (driver/register! driver, :parent (set (map keyword (u/one-or-many parent))), :abstract? abstract)))

(defn- parse-yaml-section [manifest section]
  (some-> manifest
          yaml/parse-string
          section
          u/one-or-many
          first))

(defn- load-connection-properties
  [driver]
  (let [manifest   (slurp (str (io/file "modules/drivers/" (name driver) "/resources/metabase/" (name driver) "/metabase-plugin.yaml")))
        properties (parse-connection-properties (parse-yaml-section manifest :driver))
        extras     (parse-yaml-section manifest :extra)]
    (.addMethod ^MultiFn driver/connection-properties driver (constantly properties))
    (.addMethod ^MultiFn driver/extra-info driver (constantly extras))))

(comment
  (load-connection-properties :databricks))
