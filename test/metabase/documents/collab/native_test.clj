(ns metabase.documents.collab.native-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.documents.collab.native :as native]))

(defn- supported-platform?
  "Does this JVM run on a platform where we publish a Y-CRDT native library?"
  []
  (let [os   (System/getProperty "os.name")
        arch (System/getProperty "os.arch")]
    (or (and (str/starts-with? os "Mac")   (contains? #{"aarch64" "x86_64"} arch))
        (and (str/starts-with? os "Linux") (contains? #{"amd64" "x86_64"} arch)))))

(deftest ^:parallel native-library-loads-test
  (testing "Y-CRDT JNI native library loads on supported developer platforms"
    (if (supported-platform?)
      (is (native/native-library-available?)
          "native-library-available? must return true on macos-arm64, macos-x86_64, and linux-x86_64")
      (is true "skipped: running on an unsupported platform"))))
