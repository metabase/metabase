(ns metabase.test.util-test
  "Tests for the test utils!"
  (:require
   [clojure.java.io :as io]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [environ.core :as env]
   [metabase.models.field :refer [Field]]
   [metabase.models.setting :as setting]
   [metabase.test :as mt]
   [metabase.test.data :as data]
   [metabase.test.util.random :as tu.random]
   [metabase.util :as u]
   [methodical.core :as methodical]
   [toucan2.core :as t2]
   [toucan2.tools.before-update :as t2.before-update]))

(set! *warn-on-reflection* true)

(deftest with-temp-vals-in-db-test
  (testing "let's make sure this acutally works right!"
    (let [position #(t2/select-one-fn :position Field :id (data/id :venues :price))]
      (mt/with-temp-vals-in-db Field (data/id :venues :price) {:position -1}
        (is (= -1
               (position))))
      (is (= 5
             (position)))))

  (testing "if an Exception is thrown, original value should be restored"
    (u/ignore-exceptions
     (mt/with-temp-vals-in-db Field (data/id :venues :price) {:position -1}
       (throw (Exception.))))
    (is (= 5
           (t2/select-one-fn :position Field :id (data/id :venues :price))))))

(setting/defsetting with-temp-env-var-value-test-setting
  "Setting for the `with-temp-env-var-value-test` test."
  :visibility :internal
  :setter     :none
  :default    "abc")

(deftest with-temp-env-var-value-test
  (is (= "abc"
         (with-temp-env-var-value-test-setting)))
  (mt/with-temp-env-var-value [mb-with-temp-env-var-value-test-setting "def"]
    (testing "env var value"
      (is (= "def"
             (env/env :mb-with-temp-env-var-value-test-setting))))
    (testing "Setting value"
      (is (= "def"
             (with-temp-env-var-value-test-setting)))))
  (testing "original value should be restored"
    (testing "env var value"
      (is (= nil
             (env/env :mb-with-temp-env-var-value-test-setting))))
    (testing "Setting value"
      (is (= "abc"
             (with-temp-env-var-value-test-setting))))))

(deftest with-temp-env-var-value-test-2
  (testing "original value should be restored"
    (testing "env var value"
      (is (= nil
             (env/env :mb-with-temp-env-var-value-test-setting))))
    (testing "Setting value"
      (is (= "abc"
             (with-temp-env-var-value-test-setting))))))

(deftest with-temp-env-var-value-test-3
  (testing "override multiple env vars"
    (mt/with-temp-env-var-value [some-fake-env-var 123, "ANOTHER_FAKE_ENV_VAR" "def"]
      (testing "Should convert values to strings"
        (is (= "123"
               (:some-fake-env-var env/env))))
      (testing "should handle CAPITALS/SNAKE_CASE"
        (is (= "def"
               (:another-fake-env-var env/env)))))))

(deftest with-temp-env-var-value-test-4
  (testing "validation"
    (are [form] (thrown?
                 clojure.lang.Compiler$CompilerException
                 (macroexpand form))
      (list `mt/with-temp-env-var-value '[a])
      (list `mt/with-temp-env-var-value '[a b c]))))

(setting/defsetting test-util-test-setting
  "Another internal test setting"
  :visibility :internal
  :default    ["A" "B" "C"]
  :type       :csv)

(deftest with-temporary-setting-values-test
  (testing "`with-temporary-setting-values` should do its thing"
    (mt/with-temporary-setting-values [test-util-test-setting ["D" "E" "F"]]
      (is (= ["D" "E" "F"]
             (test-util-test-setting)))))

  (testing "`with-temporary-setting-values` shouldn't stomp over default values"
    (mt/with-temporary-setting-values [test-util-test-setting ["D" "E" "F"]]
      (test-util-test-setting))
    (is (= ["A" "B" "C"]
           (test-util-test-setting)))))

(setting/defsetting with-temporary-setting-values-test-setting
  "Setting for the [[mt/with-temporary-setting-values]] tests."
  :visibility :internal)

(deftest with-temporary-setting-values-empty-string-test
  (with-temporary-setting-values-test-setting! nil)
  (testing "Setting a string Setting to an empty/blank string should be the same as setting it to `nil`"
    (doseq [s ["" " "]]
      (mt/with-temporary-setting-values [with-temporary-setting-values-test-setting s]
        (is (nil? (with-temporary-setting-values-test-setting)))))))

(deftest with-temporary-setting-values-respect-nil-test
  (with-temporary-setting-values-test-setting! nil)
  (testing "Should respect nil values"
    (mt/with-temporary-setting-values [with-temporary-setting-values-test-setting "abc"]
      (is (= "abc"
             (with-temporary-setting-values-test-setting)))
      (mt/with-temporary-setting-values [with-temporary-setting-values-test-setting nil]
        (is (nil? (with-temporary-setting-values-test-setting)))))
    (testing "even if the setting previously had a non-nil value"
      (with-temporary-setting-values-test-setting! "def")
      (mt/with-temporary-setting-values [with-temporary-setting-values-test-setting nil]
        (is (nil? (with-temporary-setting-values-test-setting)))))))

(deftest with-model-cleanup-test
  (testing "Make sure the with-model-cleanup macro actually works as expected"
    (mt/with-temp [:model/Card other-card]
      (let [card-count-before (t2/count :model/Card)
            card-name         (tu.random/random-name)]
        (mt/with-model-cleanup [:model/Card]
          (t2/insert! :model/Card (-> other-card (dissoc :id :entity_id) (assoc :name card-name)))
          (testing "Card count should have increased by one"
            (is (= (inc card-count-before)
                   (t2/count :model/Card))))
          (testing "Card should exist"
            (is (t2/exists? :model/Card :name card-name))))
        (testing "Card should be deleted at end of with-model-cleanup form"
          (is (= card-count-before
                 (t2/count :model/Card)))
          (is (not (t2/exists? :model/Card :name card-name)))
          (testing "Shouldn't delete other Cards"
            (is (pos? (t2/count :model/Card)))))))))

(deftest with-discard-model-changes-test
  (mt/with-temp
    [:model/Card      {card-id :id :as card} {:name "A Card"}
     :model/Dashboard {dash-id :id :as dash} {:name "A Dashboard"}]
    (let [count-aux-method-before (set (methodical/aux-methods t2.before-update/before-update :model/Card :before))]

      (testing "with single model"
        (mt/with-discard-model-updates [:model/Card]
          (t2/update! :model/Card card-id {:name "New Card name"})
          (testing "the changes takes affect inside the macro"
            (is (= "New Card name" (t2/select-one-fn :name :model/Card card-id)))))

        (testing "outside macro, the changes should be reverted"
          (is (= card (t2/select-one :model/Card card-id)))))

      (testing "with multiple models"
        (mt/with-discard-model-updates [:model/Card :model/Dashboard]
          (testing "the changes takes affect inside the macro"
            (t2/update! :model/Card card-id {:name "New Card name"})
            (is (= "New Card name" (t2/select-one-fn :name :model/Card card-id)))

            (t2/update! :model/Dashboard dash-id {:name "New Dashboard name"})
            (is (= "New Dashboard name" (t2/select-one-fn :name :model/Dashboard dash-id)))))

        (testing "outside macro, the changes should be reverted"
          (is (= (dissoc card :updated_at)
                 (dissoc (t2/select-one :model/Card card-id) :updated_at)))
          (is (= (dissoc dash :updated_at)
                 (dissoc (t2/select-one :model/Dashboard dash-id) :updated_at)))))

      (testing "make sure that we cleaned up the aux methods after"
        (is (= count-aux-method-before
               (set (methodical/aux-methods t2.before-update/before-update :model/Card :before))))))))

(deftest with-temp-file-test
  (testing "random filename"
    (let [temp-filename (atom nil)]
      (mt/with-temp-file [filename]
        (is (string? filename))
        (is (not (.exists (io/file filename))))
        (spit filename "wow")
        (reset! temp-filename filename))
      (testing "File should be deleted at end of macro form"
        (is (not (.exists (io/file @temp-filename))))))))

(deftest with-temp-file-test-2
  (testing "explicit filename"
    (mt/with-temp-file [filename "parrot-list.txt"]
      (is (string? filename))
      (is (not (.exists (io/file filename))))
      (is (str/ends-with? filename "parrot-list.txt"))
      (spit filename "wow")
      (testing "should delete existing file"
        (mt/with-temp-file [filename "parrot-list.txt"]
          (is (not (.exists (io/file filename)))))))))

(deftest with-temp-file-test-3
  (testing "multiple bindings"
    (mt/with-temp-file [filename nil, filename-2 "parrot-list.txt"]
      (is (string? filename))
      (is (string? filename-2))
      (is (not (.exists (io/file filename))))
      (is (not (.exists (io/file filename-2))))
      (is (not (str/ends-with? filename "parrot-list.txt")))
      (is (str/ends-with? filename-2 "parrot-list.txt")))))

(deftest with-temp-file-test-4
  (testing "should delete existing file"
    (mt/with-temp-file [filename "parrot-list.txt"]
      (spit filename "wow")
      (mt/with-temp-file [filename "parrot-list.txt"]
        (is (not (.exists (io/file filename))))))))

(deftest ^:parallel with-temp-file-test-5
  (testing "validation"
    (are [form] (thrown?
                 clojure.lang.Compiler$CompilerException
                 (macroexpand form))
      `(mt/with-temp-file [])
      `(mt/with-temp-file (+ 1 2)))))
