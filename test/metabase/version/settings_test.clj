(ns metabase.version.settings-test
  (:require
   [clojure.test :refer :all]
   [metabase.config.core :as config]
   [metabase.test :as mt]
   [metabase.version.settings :as version.settings]))

(def prevent? #'version.settings/prevent-upgrade?)

(deftest upgrade-threshold-test
  (testing "it is stable but changes across releases"
    (letfn [(threshold [version]
              (with-redefs [config/current-major-version (constantly version)]
                (version.settings/upgrade-threshold)))]
      ;; asserting that across 10 versions we have at leaset 5 distinct values
      (let [thresholds (into [] (map threshold) (range 50 60))]
        ;; kinda the same but very explicit: it's not the same value across versions
        (is (> (count (distinct thresholds)) 1) "value should change between versions")
        (is (< 5 (count (set thresholds))) "value should be decently random between versions")
        (is (every? (fn [x] (and (integer? x) (<= 0 x 100))) thresholds) "should always be an integer between 0 and 100")))))

(deftest prevent-upgrade?-test
  ;; verify that the base value works
  (is (prevent? 45 {:version "0.46" :rollout 50} 75) "base case that it does prevent when rollout is below threshold")
  (testing "never throws and returns truthy"
    (is (not (prevent? 45 {:version "0.46"} 75)) "missing rollout")
    ;; version is weird
    (is (not (prevent? 45 {:version 45} 75)) "version not a version string")
    ;; misshape
    (is (not (prevent? 45 {:latest {:version "0.46" :rollout 80}} 75)) "Wrong shape"))

  (testing "Knows when to upgrade"
    (let [threshold 25
          above     50
          below     15]
      (is (not (prevent? 50 {:version "1.51.23.1" :rollout above} threshold)))
      (is (prevent? 50 {:version "1.51.23.1" :rollout below} threshold))
      (testing "when major is the same, threshold does not matter"
        (is (not (prevent? 50 {:version "1.50.23.1" :rollout above} threshold)) "Same major")
        (is (not (prevent? 50 {:version "1.50.23.1" :rollout below} threshold)) "Same major"))
      (testing "when major is two versions below, follows normal behavior"
        ;; todo: should this offer the next major? ie on 49, 51 is at 10% rollout, should we offer 50 or not?
        (is (not (prevent? 49 {:version "1.51.23.1" :rollout above} threshold)))
        (is (prevent? 49 {:version "1.51.23.1" :rollout below} threshold))))))

(def info #'version.settings/version-info*)

(deftest version-info*-test
  (let [version-info {:latest {:version "1.51.23.1" :rollout 50
                               :highlights ["highlights for 1.51.23.1"]}
                      :older [{:version "1.51.22" :highlights ["highlights for 1.51.22"]}
                              {:version "1.51.21" :highlights ["highlights for 1.51.21"]}]}]
    (testing "When on same major, includes latest"
      (is (= version-info (info version-info {:current-major 51 :upgrade-threshold-value 25}))))
    (testing "When below major"
      (testing "And below rollout threshold lacks latest"
        (is (not (contains? (info version-info {:current-major 50 :upgrade-threshold-value 75}) :latest))))
      (testing "And above rollout threshold includes latest"
        (is (contains? (info version-info {:current-major 50 :upgrade-threshold-value 25}) :latest))))
    (testing "if something feels off, just includes it by default"
      (testing "missing rollout"
        (let [modified (update version-info :latest dissoc :rollout)]
          (is (= modified (info modified {:current-major 51 :upgrade-threshold-value 25})))))
      (testing "version is weird"
        (let [modified (update version-info :latest assoc :version "x01.51")]
          (is (= modified (info modified {:current-major 51 :upgrade-threshold-value 25})))))
      (testing "unknown current threshold"
        (doseq [weird-value [nil "45" (Object.) 23.234 :keyword "string"]]
          (is (= version-info (info version-info {:current-major 51 :upgrade-threshold-value weird-value})))))
      (testing "rollout is a decimal"
        (let [modified (update version-info :latest assoc :rollout 0.2)]
          (is (= modified (info modified {:current-major 51 :upgrade-threshold-value 25}))))))))

(deftest update-channel-test
  (testing "we can set the update channel"
    (mt/discard-setting-changes [update-channel]
      (version.settings/update-channel! "nightly")
      (is (= "nightly" (version.settings/update-channel)))))
  (testing "we can't set the update channel to an invalid value"
    (mt/discard-setting-changes [update-channel]
      (is (thrown?
           IllegalArgumentException
           (version.settings/update-channel! "millennially"))))))
