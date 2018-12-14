(ns metabase.plugins.init-steps
  "Logic for performing the `init-steps` listed in a Metabase plugin's manifest. For driver plugins that specify that we
  should `lazy-load`, these steps are lazily performed the first time non-trivial driver methods (such as connecting
  to a Database) are called; for all other Metabase plugins these are perfomed during launch.

  The entire list of possible init steps is below, as impls for the `do-init-step!` multimethod."
  (:require [clojure.tools.logging :as log]
            [metabase.plugins.classloader :as classloader]
            [metabase.plugins.jdbc-proxy :as jdbc-proxy]
            [metabase.util :as u]
            [metabase.util.i18n :refer [trs]]))

(defmulti ^:private do-init-step!
  "Perform a driver init step. Steps are listed in `init:` in the plugin manifest; impls for each step are found below
  by dispatching off the value of `step:` for each step. Other properties specified for that step are passed as a map."
  {:arglists '([m])}
  (comp keyword :step))

(defmethod do-init-step! :load-namespace [{nmspace :namespace}]
  (log/debug (u/format-color 'blue (trs "Loading plugin namespace {0}..." nmspace)))
  ;; done for side-effects to ensure context classloader is the right one
  (classloader/the-classloader)
  ;; as elsewhere make sure Clojure is using our context classloader (which should normally be true anyway) because
  ;; that's the one that will have access to the JARs we've added to the classpath at runtime
  (binding [*use-context-classloader* true]
    (require (symbol nmspace))))

(defmethod do-init-step! :register-jdbc-driver [{class-name :class}]
  (log/debug (u/format-color 'blue (trs "Registering JDBC proxy driver wrapping {0}..." class-name)))
  (jdbc-proxy/create-and-register-proxy-driver! class-name))

(defn do-init-steps!
  "Perform the initialization steps for a Metabase plugin as specified under `init:` in its plugin
  manifest (`metabase-plugin.yaml`) by calling `do-init-step!` for each step."
  [init-steps]
  (doseq [step init-steps]
    (do-init-step! step)))
