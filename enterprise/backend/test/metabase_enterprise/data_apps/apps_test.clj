(ns metabase-enterprise.data-apps.apps-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.data-apps.apps :as data-apps.apps]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(deftest create-app-refuses-a-taken-slug-test
  (mt/with-temp [:model/DataApp {app-name :name} {}]
    (let [collection-count (t2/count :model/Collection)]
      (is (thrown-with-msg? clojure.lang.ExceptionInfo #"already exists"
                            (data-apps.apps/create-app! {:name app-name :display_name "Sales" :bundle_path "dist/index.js"})))
      (testing "and creates no collection for it"
        (is (= collection-count (t2/count :model/Collection)))))))
