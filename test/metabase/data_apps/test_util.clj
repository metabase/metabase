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

(defmacro with-data-app-cleanup
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
  "Create a temporary data app for testing."
  [{:keys [data-app]} thunk]
  (mt/with-temp
    [:model/DataApp {app-id :id} (merge
                                  {:name "Test Data App"
                                   :url "/test-data-app"
                                   :description "Test description"
                                   :creator_id (mt/user->id :crowberto)}
                                  data-app)]
    (thunk (t2/select-one :model/DataApp app-id))))

(defn data-app-url
  "URL helper for data app endpoints"
  ([] "/data-app")
  ([id] (str "/data-app/" id))
  ([id suffix] (str "/data-app/" id suffix)))

 ;; Set up with-temp defaults for DataApp model
(methodical/defmethod t2.with-temp/with-temp-defaults :model/DataApp
  [_]
  {:name (u.random/random-name)
   :url (str "/" (u.random/random-name))
   :description (str "Test description for " (u.random/random-name))
   :creator_id (mt/user->id :crowberto)})

(defmacro with-data-app
  "Macro that sets up a temporary data app for testing.

  Example:
    (with-data-app
      [app {:data-app {:name \"My Test App\"}}]
      (is (= \"My Test App\" (:name app))))"
  [[bindings props] & body]
  `(do-with-data-app ~props (fn [~bindings] ~@body)))

(def default-app-definition-config
  "Default app definition config that matches the malli spec"
  (mu/validate-throw ::data-apps.models/AppDefinitionConfig
                     {:actions    []
                      :parameters []
                      :pages      [{:name "Default Page"}]}))
