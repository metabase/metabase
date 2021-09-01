(ns metabase.models.setting.multi-setting-test
  (:require [clojure.test :refer :all]
            [metabase.models.setting :as setting]
            [metabase.models.setting.multi-setting :as multi-setting]
            [metabase.test.fixtures :as fixtures]))

(use-fixtures :once (fixtures/initialize :db))

(def ^:dynamic ^:private *parakeet* :green-friend)

(multi-setting/define-multi-setting ^:private multi-setting-test-bird-name
  "A test Setting."
  (fn [] *parakeet*)
  :visibility :internal)

(multi-setting/define-multi-setting-impl multi-setting-test-bird-name :green-friend
  :getter (constantly "Green Friend")
  :setter :none)

(multi-setting/define-multi-setting-impl multi-setting-test-bird-name :yellow-friend
  :getter (partial setting/get-string :multi-setting-test-bird-name)
  :setter (partial setting/set-string! :multi-setting-test-bird-name))

(deftest multi-setting-test
  (testing :green-friend
    (is (= "Green Friend"
           (multi-setting-test-bird-name)))
    (is (thrown-with-msg?
         UnsupportedOperationException
         #"You cannot set :multi-setting-test-bird-name; it is a read-only setting"
         (multi-setting-test-bird-name "Parroty"))))
  (testing :yellow-friend
    (binding [*parakeet* :yellow-friend]
      (is (= "Yellow Friend"
             (multi-setting-test-bird-name "Yellow Friend")))
      (is (= "Yellow Friend"
             (multi-setting-test-bird-name))))))

(multi-setting/define-multi-setting ^:private multi-setting-read-only
  "A test setting that is always read-only."
  (fn [] *parakeet*)
  :visibility :internal
  :getter     (constantly "Parroty")
  :setter     :none)

(multi-setting/define-multi-setting-impl multi-setting-read-only :green-friend
  :getter (constantly "Green Friend")
  :setter (partial setting/set-string! :multi-setting-read-only))

(multi-setting/define-multi-setting-impl multi-setting-read-only :yellow-friend
  :getter (constantly "Yellow Friend")
  :setter (partial setting/set-string! :multi-setting-read-only))

(deftest keys-in-definition-should-overshadow-keys-in-impls
  (testing "Specifying :getter or :setter in `define-multi-setting` should mean ones in any `impl` are ignored"
    (doseq [parakeet [:green-friend :yellow-friend :parroty]]
      (testing parakeet
        (binding [*parakeet* parakeet]
          (is (= "Parroty"
                 (multi-setting-read-only)))
          (is (thrown-with-msg?
               UnsupportedOperationException
               #"You cannot set multi-setting-read-only; it is a read-only setting"
               (multi-setting-read-only "Parroty"))))))))
