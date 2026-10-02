(ns metabase-enterprise.data-apps.apps-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.data-apps.apps :as data-apps.apps]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(def ^:private app-row
  {:name         "sales"
   :display_name "Sales"
   :bundle_path  "dist/index.js"
   :bundle       (.getBytes "BUNDLE" "UTF-8")})

(deftest concurrent-draft-creation-is-safe-test
  (mt/with-model-cleanup [:model/DataApp :model/Collection :model/PermissionsGroup]
    (let [drafts (doall (repeatedly 2 #(future (data-apps.apps/ensure-draft! "draft-app"))))]
      (doseq [draft drafts]
        @draft)
      (is (= 1 (t2/count :model/DataApp :name "draft-app"))))))

(deftest create-app-fills-a-draft-with-the-same-slug-test
  (mt/with-model-cleanup [:model/DataApp :model/Collection :model/PermissionsGroup]
    (let [{:keys [resource_collection_id]} (data-apps.apps/ensure-draft! "sales")
          draft-id                         (t2/select-one-pk :model/DataApp :name "sales")]
      (is (= draft-id (data-apps.apps/create-app! app-row)))
      (is (=? {:display_name           "Sales"
               :draft                  false
               :resource_collection_id resource_collection_id}
              (t2/select-one :model/DataApp draft-id))))))

(deftest create-app-refuses-a-taken-slug-test
  (mt/with-model-cleanup [:model/DataApp :model/Collection :model/PermissionsGroup]
    (data-apps.apps/create-app! app-row)
    (is (thrown-with-msg? clojure.lang.ExceptionInfo #"already exists"
                          (data-apps.apps/create-app! app-row)))))
