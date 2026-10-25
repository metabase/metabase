(ns metabase-enterprise.data-apps.apps-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.data-apps.apps :as data-apps.apps]
   [metabase-enterprise.data-apps.test-util :as data-apps.tu]
   [metabase.test :as mt]))

(set! *warn-on-reflection* true)

(def ^:private app-row
  {:name         "sales"
   :display_name "Sales"
   :bundle_path  "dist/index.js"
   :bundle       (.getBytes "BUNDLE" "UTF-8")})

(deftest create-app-refuses-a-taken-slug-test
  (mt/with-model-cleanup [:model/DataApp :model/Collection :model/PermissionsGroup]
    (data-apps.apps/create-app! (assoc app-row :resource_collection_id (data-apps.tu/app-collection-id!)))
    (is (thrown-with-msg? clojure.lang.ExceptionInfo #"already exists"
                          (data-apps.apps/create-app! (assoc app-row :resource_collection_id (data-apps.tu/app-collection-id!)))))))
