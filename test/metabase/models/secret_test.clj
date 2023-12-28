(ns metabase.models.secret-test
  (:require
   [clojure.java.io :as io]
   [clojure.test :refer :all]
   [metabase.models.secret :as secret :refer [Secret]]
   [metabase.test :as mt]
   [metabase.util :as u]
   [metabase.util.encryption-test :as encryption-test]
   [toucan2.core :as t2]
   [toucan2.tools.with-temp :as t2.with-temp])
  (:import
   (java.io DataInputStream File)
   (java.nio.charset StandardCharsets)))

(set! *warn-on-reflection* true)

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
      (t2.with-temp/with-temp [Secret {:keys [id] :as secret} {:name       name
                                                               :kind       kind
                                                               :value      value
                                                               :creator_id (mt/user->id :crowberto)}]
        (is (= name (:name secret)))
        (is (= kind (:kind secret)))
        (is (mt/secret-value-equals? value (:value secret)))
        (let [loaded (t2/select-one Secret :id id)]
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
           (secret/get-secret-string {:secret-prop-value "titok"} "secret-prop"))))

  (testing "get-secret-string from value only from the database"
    (t2.with-temp/with-temp [Secret {id :id} {:name       "private-key"
                                              :kind       ::secret/pem-cert
                                              :value      "titok"
                                              :creator_id (mt/user->id :crowberto)}]
      (is (= "titok"
             (secret/get-secret-string {:secret-prop-id id} "secret-prop")))))

  (testing "get-secret-string from uploaded value"
    (t2.with-temp/with-temp [Secret {id :id} {:name       "private-key"
                                              :kind       ::secret/pem-cert
                                              :value      (let [encoder (java.util.Base64/getEncoder)]
                                                            (str "data:application/octet-stream;base64,"
                                                                 (.encodeToString encoder
                                                                                  (.getBytes "titok" "UTF-8"))))
                                              :creator_id (mt/user->id :crowberto)}]
      (is (= "titok"
             (secret/get-secret-string
              {:secret-prop-id      id
               :secret-prop-options "uploaded"}
              "secret-prop")))
      (testing "but prefer value if both value and id are given (#33452)"
        (are [value] (= "psszt!"
                        (secret/get-secret-string
                         {:secret-prop-id      id
                          :secret-prop-value   value
                          :secret-prop-options "uploaded"}
                         "secret-prop"))
          "psszt!"
          (.getBytes "psszt!" "UTF-8")
          (let [encoder (java.util.Base64/getEncoder)]
            (str "data:application/octet-stream;base64,"
                 (.encodeToString encoder
                                  (.getBytes "psszt!" "UTF-8"))))))))

  (testing "get-secret-string from local file"
    (mt/with-temp-file [file-db "-1-key.pem"
                        file-value "-2-key.pem"]
      (spit file-db "titok")
      (spit file-value "psszt!")

      (testing "from value"
        (is (= "titok"
               (secret/get-secret-string
                {:secret-prop-path    file-db
                 :secret-prop-options "local"}
                "secret-prop"))))

      (testing "from the database"
        (t2.with-temp/with-temp [Secret {id :id} {:name       "private-key"
                                                  :kind       ::secret/pem-cert
                                                  :value      file-db
                                                  :creator_id (mt/user->id :crowberto)}]
          (is (= "titok"
                 (secret/get-secret-string
                  {:secret-prop-id      id
                   :secret-prop-options "local"}
                  "secret-prop")))
          (testing "but prefer value if both value and id are given (#33452)"
            (is (= "psszt!"
                   (secret/get-secret-string
                    {:secret-prop-id      id
                     :secret-prop-value   file-value
                     :secret-prop-options "local"}
                    "secret-prop")))))))))

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
          (t2.with-temp/with-temp [Secret {:keys [value] :as secret} (assoc secret-map :creator_id (mt/user->id :crowberto))]
            (let [val-file (secret/value->file! secret nil)]
              (is (value-matches? (or exp-val value)
                                  (let [result (byte-array (.length val-file))]
                                    (with-open [in (DataInputStream. (io/input-stream val-file))]
                                      (.readFully in result))
                                    result)))))))))
  (testing "value->file! returns the same file for secrets"
    (testing "for file paths"
      (let [file-secret-val "dingbat"
            ^File tmp-file  (doto (File/createTempFile "value-to-file-test_" ".txt")
                              (.deleteOnExit))]
        (spit tmp-file file-secret-val)
        (t2.with-temp/with-temp [Secret secret {:name   "file based secret"
                                                :kind   :perm-cert
                                                :source "file-path"
                                                :value  (.getAbsolutePath tmp-file)}]
          (is (instance? java.io.File (secret/value->file! secret nil)))
          (is (= (secret/value->file! secret nil)
                 (secret/value->file! secret nil))
              "Secret did not return the same file"))))
    (testing "for upload files (#23034)"
      (t2.with-temp/with-temp [Secret secret {:name   "file based secret"
                                              :kind   :perm-cert
                                              :source nil
                                              :value  (.getBytes "super secret")}]
        (is (instance? java.io.File (secret/value->file! secret nil)))
        (is (= (secret/value->file! secret nil)
               (secret/value->file! secret nil))
            "Secret did not return the same file")))))

(defn- decode-ssl-db-property [content mime-type property]
  (let [value-key (keyword (str property "-value"))
        options-key (keyword (str property "-options"))]
    (:value (secret/db-details-prop->secret-map
                  {:ssl true
                   :ssl-mode "verify-ca"
                   value-key (format "data:%s;base64,%s" mime-type (u/encode-base64 content))
                   options-key "uploaded"
                   :port 5432,
                   :advanced-options false
                   :dbname "the-bean-base"
                   :host "localhost"
                   :tunnel-enabled false
                   :engine :postgres
                   :user "human-bean"}
                  property))))

(deftest ssl-cert-base
  (testing "db-details-prop->secret-map"
    (let [content "<Certificate text goes here>"
          mime-types ["application/x-x509-ca-cert" "application/octet-stream"]]
      (testing "decodes root cert value properly (#20319, #22626)"
        (doseq [property ["ssl-root-cert" "ssl-client-cert"]
                mime-type mime-types]
          (testing (format "property %s with mime-type %s" property mime-type)
            (is (= content
                   (decode-ssl-db-property content mime-type property))))))
      (testing "decodes client key value properly (#22626)"
        (doseq [property ["ssl-key"]
                mime-type mime-types]
          (testing (format "property %s with mime-type %s" property mime-type)
            (let [decoded (decode-ssl-db-property content mime-type property)]
              (is (bytes? decoded))
              (is (= content
                     (String. ^bytes decoded "UTF-8"))))))))))

(deftest use-latest-version-test
  (testing "when reading a secret from the DB, the latest version is taken (#33116)"
    (let [initial-value "vnetillo"
          latest-value (str initial-value "s")
          initial-source "source"
          latest-source (str initial-source "s")
          secret-property "secret"
          secret-map1 {:name  secret-property
                       :kind  ::secret/password
                       :value initial-value
                       :source initial-source}
          secret-map2 {:name  secret-property
                       :kind  ::secret/password
                       :value latest-value
                       :source latest-source}
          crowberto-id (mt/user->id :crowberto)
          by-crowberto #(assoc % :creator_id crowberto-id)
          timestamp-string? (fn [s]
                              (try
                                (java.time.Instant/parse s)
                                true
                                (catch Exception _
                                  false)))]
      (t2.with-temp/with-temp [Secret {:keys [id version]} (by-crowberto secret-map1)
                               Secret _ (-> secret-map2
                                            by-crowberto
                                            (assoc :id id :version (inc version)))]
        (let [details {:secret-id id}]
          (testing "db-details-prop->secret-map"
            (let [secret (secret/db-details-prop->secret-map details secret-property)]
              (is (= latest-value (-> secret :value bytes (String. "UTF8"))))
              (is (= (keyword latest-source) (:source secret)))))
          (testing "get-secret-string"
            (is (= latest-value (secret/get-secret-string details secret-property))))
          (testing "expand-inferred-secret-values"
            (is (=? {:secret-id id
                     :secret-source (keyword latest-source)
                     :secret-creator-id crowberto-id
                     :secret-created-at timestamp-string?}
                    (secret/expand-inferred-secret-values details secret-property id)))))))))
