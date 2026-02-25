#_{:clj-kondo/ignore [:metabase/unknown-release-flag]}
(ns metabase.release-flags.models-test
  (:require
   [clojure.test :refer :all]
   [metabase.release-flags.models :as models]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2])
  (:import
   (java.time LocalDate)))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db))

(defn- get-release-flag [flag]
  (t2/select-one :model/ReleaseFlag :flag flag))

(defn- has-release-flag-unchecked? [flag]
  (:is_enabled (get-release-flag flag)))

(deftest all-flags-test
  (testing "returns flag data keyed by name"
    (mt/with-temp [:model/ReleaseFlag _ {:flag "all-flags-test" :description "A test"}]
      (let [flags (models/all-flags)]
        (is (contains? flags "all-flags-test"))
        (is (not (get-in flags ["all-flags-test" :is_enabled])))
        (is (= "A test" (get-in flags ["all-flags-test" :description])))))))

(deftest update-statuses!-test
  (testing "updates is_enabled for existing flags"
    (mt/with-temp [:model/ReleaseFlag _ {:flag "status-a" :description "A" :is_enabled false}
                   :model/ReleaseFlag _ {:flag "status-b" :description "B" :is_enabled true}]
      (models/update-statuses! {"status-a" true "status-b" false})
      (is (has-release-flag-unchecked? "status-a"))
      (is (not (has-release-flag-unchecked? "status-b")))))
  (testing "handles keyword keys"
    (mt/with-temp [:model/ReleaseFlag _ {:flag "kw-flag" :description "KW" :is_enabled false}]
      (models/update-statuses! {:kw-flag true})
      (is (has-release-flag-unchecked? "kw-flag")))))

(deftest delete-flags!-test
  (testing "returns 0 for empty set"
    (is (= 0 (models/delete-flags! #{}))))
  (testing "deletes specified flags and returns count"
    (mt/with-temp [:model/ReleaseFlag _ {:flag "del-a" :description "A" :is_enabled false}
                   :model/ReleaseFlag _ {:flag "del-b" :description "B" :is_enabled false}
                   :model/ReleaseFlag _ {:flag "keep" :description "C" :is_enabled false}]
      (is (= 2 (models/delete-flags! #{"del-a" "del-b"})))
      (is (nil? (get-release-flag "del-a")))
      (is (some? (get-release-flag "keep"))))))

(deftest upsert-flag!-test
  (testing "inserts a new flag"
    (let [flag-name (str "upsert-" (random-uuid))]
      (try
        (models/upsert-flag! flag-name "New description" (LocalDate/parse "2026-03-01"))
        (let [row (get-release-flag flag-name)]
          (is (some? row))
          (is (= "New description" (:description row))))
        (finally
          (t2/delete! :model/ReleaseFlag :flag flag-name)))))
  (testing "updates an existing flag"
    (mt/with-temp [:model/ReleaseFlag _ {:flag "upsert-existing" :description "Old" :is_enabled false}]
      (models/upsert-flag! "upsert-existing" "Updated" (LocalDate/parse "2026-04-01"))
      (is (= "Updated" (:description (get-release-flag "upsert-existing")))))))

(deftest has-release-flag?-test
  (testing "returns true when flag is enabled"
    (mt/with-temp [:model/ReleaseFlag _ {:flag "enabled-flag" :description "E" :is_enabled true}]
      #_{:clj-kondo/ignore [:metabase/unknown-release-flag]}
      (is (models/has-release-flag? "enabled-flag"))))
  (testing "returns false when flag is disabled"
    (mt/with-temp [:model/ReleaseFlag _ {:flag "disabled-flag" :description "D" :is_enabled false}]
      #_{:clj-kondo/ignore [:metabase/unknown-release-flag]}
      (is (not (models/has-release-flag? "disabled-flag")))))
  (testing "throws on missing flag"
    (is (not #_{:clj-kondo/ignore [:metabase/unknown-release-flag]}
         (models/has-release-flag? "nonexistent"))))
  (testing "handles keyword argument"
    (mt/with-temp [:model/ReleaseFlag _ {:flag "kw-test" :description "K" :is_enabled true}]
      #_{:clj-kondo/ignore [:metabase/unknown-release-flag]}
      (is (models/has-release-flag? :kw-test))))
  (testing "handles namespaced keyword argument"
    (mt/with-temp [:model/ReleaseFlag _ {:flag "my-ns/ns-flag" :description "NS" :is_enabled true}]
      #_{:clj-kondo/ignore [:metabase/unknown-release-flag]}
      (is (models/has-release-flag? :my-ns/ns-flag)))))
