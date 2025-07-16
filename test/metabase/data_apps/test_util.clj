(ns metabase.data-apps.test-util
  "Test utilities for data apps"
  (:require
   [metabase.data-apps.models :as data-apps.models]
   [metabase.test :as mt]
   [metabase.test.util :as tu]
   [metabase.util.malli :as mu]
   [toucan2.core :as t2]))

(defmacro with-data-app-cleanup!
  "Execute `body`, then delete any *new* data app-related rows created during execution.
  This includes DataApp, DataAppDefinition, and DataAppRelease models.

  Example:
    (with-data-app-cleanup!
      (create-data-app-via-api!)
      (is (= ...)))"
  [& body]
  `(tu/with-model-cleanup [:model/DataAppRelease :model/DataAppDefinition :model/DataApp]
     ~@body))

(defn do-with-data-app!
  "Create a temporary data app for testing. Optionally creates a definition if :definition is provided."
  [{:keys [definition] :as data-app} thunk]
  (mt/with-temp
    [:model/DataApp {app-id :id :as app} (merge
                                          {:name "Test Data App"}
                                          (dissoc data-app :definition))]
    (try
      (let [app-with-definition (if definition
                                  (->> (merge definition {:creator_id (mt/user->id :crowberto)})
                                       (data-apps.models/set-latest-definition! app-id)
                                       (assoc app :definition))
                                  app)]
        (thunk app-with-definition))
      (finally
        ;; Work around the fact that MySQL tries to delete child tables in the wrong order (definition, then release),
        ;; and trips around the fact that ONLY the "definition -> release" FK does NOT cascade on delete.
        (t2/delete! :model/DataAppRelease :app_id app-id)))))

(defn data-app-url
  "URL helper for data app endpoints"
  ([] "/data-app")
  ([id] (str "/data-app/" id))
  ([id suffix] (str "/data-app/" id suffix)))

(defmacro with-data-app!
  "Macro that sets up temporary data apps for testing. Supports both single and multiple app creation.

  Single app example:
    (with-data-app!
      [app {:name \"My Test App\"
            :definition default-app-definition-config}]
      (is (= 1 (get-in app [:definition :revision_number]))))

  Multiple apps example:
    (with-data-app!
      [app1 {:name \"App 1\"} app2 {:name \"App 2\"}]
      (is (= \"App 1\" (:name app1)))
      (is (= \"App 2\" (:name app2))))"
  [bindings & body]
  (let [binding-pairs (partition 2 bindings)]
    `(with-data-app-cleanup!
       ~(reduce (fn [acc-body [binding props]]
                  `(do-with-data-app! ~props (fn [~binding] ~acc-body)))
                `(do ~@body)
                (reverse binding-pairs)))))

(def default-app-definition-config
  "Default app definition config that matches the malli spec"
  (mu/validate-throw ::data-apps.models/AppDefinitionConfig
                     {:actions []
                      :parameters []
                      :pages [{:name "Default Page"}]}))

(defn do-with-released-app!
  "Create a temporary data app with a released definition for testing."
  [data-app thunk]
  (let [creator-id (or (:creator_id data-app) (mt/user->id :crowberto))]
    (with-data-app! [app (cond-> data-app
                           (not (contains? data-app :definition))
                           (assoc :definition {:config     default-app-definition-config
                                               :creator_id creator-id}))]
      (data-apps.models/release! (:id app) creator-id)
      (thunk (data-apps.models/get-published-data-app (:slug app))))))

(defmacro with-released-app!
  "Macro that sets up temporary data apps with released definitions for testing. Supports both single and multiple app creation.

  Single app example:
    (with-released-app!
      [app {:name \"My Test App\"}]
      (is (= \"My Test App\" (:name app))))

  Multiple apps example:
    (with-released-app!
      [app1 {:name \"App 1\"} app2 {:name \"App 2\"}]
      (is (= \"App 1\" (:name app1)))
      (is (= \"App 2\" (:name app2))))"
  [bindings & body]
  (let [binding-pairs (partition 2 bindings)]
    `(with-data-app-cleanup!
       ~(reduce (fn [acc-body [binding props]]
                  `(do-with-released-app! ~props (fn [~binding] ~acc-body)))
                `(do ~@body)
                (reverse binding-pairs)))))
