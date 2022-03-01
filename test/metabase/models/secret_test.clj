(ns metabase.models.secret-test
  (:require [clojure.java.io :as io]
            [clojure.test :refer :all]
            [metabase.models.secret :as secret :refer [Secret]]
            [metabase.test :as mt]
            [metabase.util.encryption-test :as encryption-test])
  (:import [java.io DataInputStream File]
           java.nio.charset.StandardCharsets))

(defn- value-matches?
  "Returns true iff `expected` value matches the `actual` (bytes) value. If `expected` is a String, then `actual` is
  considered a UTF-8 encoded String and compared on that basis. Otherwise, `expected` is compared to `actual` after each
  is wrapped in `seq` (in order to compare byte-by-byte, instead of by reference to the respective byte arrays)."
  [expected ^bytes actual]
  (cond (string? expected)
        (= expected (String. actual StandardCharsets/UTF_8))

        (bytes? expected)
        (= (seq expected) (seq actual))))

(defn- check-secret []
  (doseq [value ["fourtytwo" (byte-array (range 0 100))]]
    (let [name        "Test Secret"
          kind        ::secret/password]
      (mt/with-temp Secret [{:keys [id] :as secret} {:name       name
                                                     :kind       kind
                                                     :value      value
                                                     :creator_id (mt/user->id :crowberto)}]
         (is (= name (:name secret)))
         (is (= kind (:kind secret)))
         (is (mt/secret-value-equals? value (:value secret)))
         (let [loaded (Secret id)]
           (is (= name (:name loaded)))
           (is (= kind (:kind loaded)))
           (is (mt/secret-value-equals? value (:value loaded))))))))

(deftest secret-retrieval-test
  (testing "A secret value can be retrieved successfully"
    (testing " when there is NO encryption key in place"
      (encryption-test/with-secret-key nil
        (check-secret)))
    (testing " when there is an encryption key in place"
      (encryption-test/with-secret-key (resolve 'encryption-test/secret)
        (check-secret)))))

(deftest value->file!-test
  (testing "value->file! works for a secret value"
    (let [file-secret-val "dingbat"
          ^File tmp-file  (doto (File/createTempFile "value-to-file-test_" ".txt")
                            (.deleteOnExit))]
      (spit tmp-file file-secret-val)
      (doseq [[value-kind exp-val secret-map] [["string"
                                                nil
                                                {:name  "string secret"
                                                 :kind  ::secret/password
                                                 :value "kerfuffle"}]
                                               ["binary"
                                                nil
                                                {:name  "binary secret"
                                                 :kind  ::secret/bytes
                                                 :value (byte-array [-110 -14 61 194 871])}]
                                               ["file based"
                                                file-secret-val
                                                {:name   "file based secret"
                                                 :kind   ::secret/password
                                                 :source "file-path"
                                                 :value  (.getAbsolutePath tmp-file)}]]]
        (testing (format " with a %s value" value-kind)
          (mt/with-temp Secret [{:keys [id value] :as secret} (assoc secret-map :creator_id (mt/user->id :crowberto))]
            (let [val-file (secret/value->file! secret nil)]
              (is (value-matches? (or exp-val value)
                                  (let [result (byte-array (.length val-file))]
                                    (with-open [in (DataInputStream. (io/input-stream val-file))]
                                      (.readFully in result))
                                    result))))))))))
