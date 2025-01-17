(ns metabase.models.secret-test
  (:require
   [buddy.core.codecs :as codecs]
   [clojure.java.io :as io]
   [clojure.test :refer :all]
   [metabase.models.secret :as secret]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.util :as u]
   [metabase.util.encryption-test :as encryption-test]
   [toucan2.core :as t2])
  (:import
   (java.io DataInputStream File)
   (java.nio.charset StandardCharsets)))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db :plugins :test-drivers))

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
      (mt/with-temp [:model/Secret {:keys [id] :as secret} {:name       name
                                                            :kind       kind
                                                            :value      value
                                                            :creator_id (mt/user->id :crowberto)}]
        (is (= name (:name secret)))
        (is (= kind (:kind secret)))
        (is (mt/secret-value-equals? value (:value secret)))
        (let [loaded (t2/select-one :model/Secret :id id)]
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

(deftest get-secret-string-test
  (testing "get-secret-string from value only"
    (is (= "titok"
           (secret/value-as-string :secret-test-driver {:keystore-value "titok"} "keystore"))))

  (testing "get-secret-string from value only from the database"
    (mt/with-temp [:model/Secret {id :id} {:name       "private-key"
                                           :kind       ::secret/pem-cert
                                           :value      "titok"
                                           :creator_id (mt/user->id :crowberto)}]
      (is (= "titok"
             (secret/value-as-string :secret-test-driver {:keystore-id id} "keystore")))))

  (testing "get-secret-string from uploaded value"
    (mt/with-temp [:model/Secret {id :id} {:name       "private-key"
                                           :kind       ::secret/pem-cert
                                           :value      (.getBytes "titok" "UTF-8")
                                           :creator_id (mt/user->id :crowberto)}]
      (is (= "titok"
             (secret/value-as-string :secret-test-driver
                                     {:keystore-id      id
                                      :keystore-options "uploaded"}
                                     "keystore")))
      (testing "but prefer value if both value and id are given (#33452)"
        (are [value] (= "psszt!"
                        (secret/value-as-string
                         :secret-test-driver
                         {:keystore-id      id
                          :keystore-value   value
                          :keystore-options "uploaded"}
                         "keystore"))
          "psszt!"
          (mt/bytes->base64-data-uri (.getBytes "psszt!" "UTF-8"))))))

  (testing "get-secret-string from local file"
    (mt/with-temp-file [file-db "-1-key.pem"
                        file-value "-2-key.pem"]
      (spit file-db "titok")
      (spit file-value "psszt!")

      (testing "from value"
        (is (= "titok"
               (secret/value-as-string
                :secret-test-driver
                {:keystore-path    file-db
                 :keystore-options "local"}
                "keystore"))))

      (testing "from the database"
        (mt/with-temp [:model/Secret {id :id} {:name       "private-key"
                                               :kind       ::secret/pem-cert
                                               :source     :file-path
                                               :value      file-db
                                               :creator_id (mt/user->id :crowberto)}]
          (is (= "titok"
                 (secret/value-as-string
                  :secret-test-driver
                  {:keystore-id id}
                  "keystore")))
          (testing "but prefer value if both value and id are given (#33452)"
            (is (= "psszt!"
                   (secret/value-as-string
                    :secret-test-driver
                    {:keystore-id      id
                     :keystore-path    file-value
                     :keystore-options "local"}
                    "keystore")))))))))

(defn- tempfile-with-contents
  ^File [contents encoding]
  (doto (File/createTempFile "value-to-file-test_" ".txt")
    (.deleteOnExit)
    (spit contents :encoding (str encoding))))

(deftest value->file!-test
  (testing "value->file! works for a secret value"
    (let [file-secret-val "dingbat"
          ^File tmp-file (tempfile-with-contents file-secret-val StandardCharsets/UTF_8)]
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
          (mt/with-temp [:model/Secret {secret-id :id :keys [value]} (assoc secret-map :creator_id (mt/user->id :crowberto))]
            (let [val-file (secret/value-as-file! :secret-test-driver {:keystore-id secret-id} "keystore")]
              (is (value-matches? (or exp-val value)
                                  (let [result (byte-array (.length val-file))]
                                    (with-open [in (DataInputStream. (io/input-stream val-file))]
                                      (.readFully in result))
                                    result)))))))))
  (testing "value->file! returns the same file for secrets"
    (testing "for file paths"
      (let [file-secret-val "dingbat"
            ^File tmp-file  (tempfile-with-contents file-secret-val StandardCharsets/UTF_8)]
        (mt/with-temp [:model/Secret {secret-id :id} {:name   "file based secret"
                                                      :kind   :perm-cert
                                                      :source "file-path"
                                                      :value  (.getAbsolutePath tmp-file)}]
          (is (instance? java.io.File (secret/value-as-file! :secret-test-driver {:keystore-id secret-id} "keystore")))
          (is (= (secret/value-as-file! :secret-test-driver {:keystore-id secret-id} "keystore")
                 (secret/value-as-file! :secret-test-driver {:keystore-id secret-id} "keystore"))
              "Secret did not return the same file"))))
    (testing "for upload files (#23034)"
      (mt/with-temp [:model/Secret {secret-id :id} {:name   "file based secret"
                                                    :kind   :perm-cert
                                                    :source nil
                                                    :value  (.getBytes "super secret")}]
        (is (instance? java.io.File (secret/value-as-file! :secret-test-driver {:keystore-id secret-id} "keystore")))
        (is (= (secret/value-as-file! :secret-test-driver {:keystore-id secret-id} "keystore")
               (secret/value-as-file! :secret-test-driver {:keystore-id secret-id} "keystore"))
            "Secret did not return the same file")))))

(deftest ssl-cert-base-uploaded
  (testing "secrets aren't mangled by encoding"
    (let [content "☃️<Certificate text goes here>☃️"
          mime-types ["application/x-x509-ca-cert" "application/octet-stream"]]
      (testing "decodes root cert value properly (#20319, #22626)"
        (doseq [mime-type mime-types
                charset [StandardCharsets/UTF_8 StandardCharsets/ISO_8859_1]
                :let [uploaded-bytes (codecs/str->bytes content (str charset))
                      uploaded-str-value (codecs/bytes->str (codecs/str->bytes content (str charset))
                                                            (str charset))]
                uploaded-value [uploaded-str-value
                                (format "data:%s;base64,%s" mime-type (u/encode-base64-bytes uploaded-bytes))]]
          (testing (format "mime-type %s charset %s " mime-type (str charset))
            (let [details {:keystore-value uploaded-value}
                  file (secret/value-as-file!
                        :secret-test-driver
                        details
                        "keystore")
                  file-bytes (mt/file->bytes file)]
              (is (=? uploaded-bytes file-bytes))
              (is (=? uploaded-str-value (secret/value-as-string :secret-test-driver details "keystore")))
              (mt/with-temp [:model/Database {db-details :details} {:engine "secret-test-driver"
                                                                    :details details}]
                (is (=? uploaded-bytes
                        (mt/file->bytes (secret/value-as-file! :secret-test-driver db-details "keystore"))))
                (is (=? uploaded-str-value
                        (secret/value-as-string :secret-test-driver db-details "keystore")))))))))))

(deftest ssl-cert-base-file-path
  (testing "file secrets aren't mangled by encoding"
    (let [content "☃️<Certificate text goes here>☃️"
          mime-types ["application/x-x509-ca-cert" "application/octet-stream"]]
      (testing "decodes root cert value properly (#20319, #22626)"
        (doseq [mime-type mime-types
                charset [StandardCharsets/UTF_8 StandardCharsets/ISO_8859_1]
                :let [uploaded-bytes (codecs/str->bytes content (str charset))
                      uploaded-str-value (codecs/bytes->str (codecs/str->bytes content (str charset))
                                                            (str charset))]]
          (testing (format "mime-type %s charset %s " mime-type (str charset))
            (let [temp-file (tempfile-with-contents content charset)
                  details {:keystore-path (.getAbsolutePath temp-file)}
                  file (secret/value-as-file!
                        :secret-test-driver
                        details
                        "keystore")
                  file-bytes (mt/file->bytes file)]
              (is (=? uploaded-bytes file-bytes))
              (is (=? uploaded-str-value (secret/value-as-string :secret-test-driver details "keystore")))
              (mt/with-temp [:model/Database {db-details :details} {:engine "secret-test-driver"
                                                                    :details details}]
                (is (=? uploaded-bytes
                        (mt/file->bytes (secret/value-as-file! :secret-test-driver db-details "keystore"))))
                (is (=? uploaded-str-value
                        (secret/value-as-string :secret-test-driver db-details "keystore")))))))))))

(deftest use-latest-version-test
  (testing "when reading a secret from the DB, the latest version is taken (#33116)"
    (let [initial-value "vnetillo"
          latest-value (str initial-value "s")
          initial-source "source"
          latest-source (str initial-source "s")
          secret-property "keystore"
          secret-map1 {:name  secret-property
                       :kind  ::secret/password
                       :value initial-value
                       :source initial-source}
          secret-map2 {:name  secret-property
                       :kind  ::secret/password
                       :value latest-value
                       :source latest-source}
          crowberto-id (mt/user->id :crowberto)
          by-crowberto #(assoc % :creator_id crowberto-id)]
      (mt/with-temp [:model/Secret {:keys [id version]} (by-crowberto secret-map1)
                     :model/Secret _ (-> secret-map2
                                         by-crowberto
                                         (assoc :id id :version (inc version)))]
        (let [details {:keystore-id id}]
          (testing "latest-for-id"
            (let [secret (secret/latest-for-id id)]
              (is (= latest-value (-> secret :value bytes (String. "UTF8"))))
              (is (= (keyword latest-source) (:source secret)))))
          (testing "get-secret-string"
            (is (= latest-value (secret/value-as-string :secret-test-driver details secret-property)))))))))
