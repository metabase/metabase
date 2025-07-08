(ns metabase.data-apps.test-util
  "Test utilities for data apps"
  (:require
   [metabase.data-apps.models :as data-apps.models]
   [metabase.test :as mt]
   [metabase.test.util :as tu]
   [metabase.util.malli :as mu]
   [metabase.util.random :as u.random]
   [methodical.core :as methodical]
   [toucan2.core :as t2]
   [toucan2.tools.with-temp :as t2.with-temp]))

(defmacro with-data-app-cleanup!
  "Execute `body`, then delete any *new* data app-related rows created during execution.
  This includes DataApp, DataAppDefinition, and DataAppRelease models.

  Example:
    (with-data-app-cleanup
      (create-data-app-via-api!)
      (is (= ...)))"
  [& body]
  `(tu/with-model-cleanup [:model/DataApp :model/DataAppDefinition :model/DataAppRelease]
     ~@body))

(defn do-with-data-app
  "Create a temporary data app for testing. Optionally creates a definition if :definition is provided."
  [{:keys [definition] :as data-app} thunk]
  (mt/with-temp
    [:model/DataApp {app-id :id :as app} (merge
                                          {:name "Test Data App"}
                                          (dissoc data-app :definition))]
    (let [app-with-definition (if definition
                                (do
                                  (data-apps.models/set-latest-definition! app-id {:config definition})
                                  (assoc app :definition (data-apps.models/latest-definition app-id)))
                                app)]
      (thunk app-with-definition))))

(defn data-app-url
  "URL helper for data app endpoints"
  ([] "/data-app")
  ([id] (str "/data-app/" id))
  ([id suffix] (str "/data-app/" id suffix)))

(defmacro with-data-app
  "Macro that sets up a temporary data app for testing. Optionally creates a definition if :definition is provided.

  Examples:

    (with-data-app
      [app {:name \"My Test App\"
            :definition default-app-definition-config}]
      (is (= 1 (get-in app [:definition :revision_number]))))"
  [[bindings props] & body]
  `(with-data-app-cleanup!
     (do-with-data-app ~props (fn [~bindings] ~@body))))

(def default-app-definition-config
  "Default app definition config that matches the malli spec"
  (mu/validate-throw ::data-apps.models/AppDefinitionConfig
                     {:actions []
                      :parameters []
                      :pages [{:name "Default Page"}]}))

(defn do-with-released-app!
  "Create a temporary data app with a released definition for testing."
  [data-app thunk]
  (with-data-app [app (cond-> data-app
                        (nil? (:definition data-app))
                        (assoc :definition default-app-definition-config))]
    (data-apps.models/release! (:id app) (:id (data-apps.models/latest-definition (:id app))))
    (thunk (data-apps.models/get-published-data-app (:url app)))))

(defmacro with-released-app!
  "Macro that sets up a temporary data app with a released definition for testing.

  Example:
    (with-released-app!
      [app {:name \"My Test App\"}]
      (is (= \"My Test App\" (:name app))))"
  [[bindings props] & body]
  `(do-with-released-app! ~props (fn [~bindings] ~@body)))
