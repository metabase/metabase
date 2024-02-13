(ns metabase.permissions.util-test
  (:require
   [clojure.test :refer :all]
   [malli.generator :as mg]
   [metabase.permissions.util :as perms.u]))

(def ^:private valid-paths
  ["/db/1/"
   "/db/1/native/"
   "/db/1/schema/"
   "/db/1/schema/public/"
   "/db/1/schema/PUBLIC/"
   "/db/1/schema//"
   "/db/1/schema/1234/"
   "/db/1/schema/public/table/1/"
   "/db/1/schema/PUBLIC/table/1/"
   "/db/1/schema//table/1/"
   "/db/1/schema/public/table/1/"
   "/db/1/schema/PUBLIC/table/1/"
   "/db/1/schema//table/1/"
   "/db/1/schema/1234/table/1/"
   "/db/1/schema/PUBLIC/table/1/query/"
   "/db/1/schema/PUBLIC/table/1/query/segmented/"
   ;; block permissions
   "/block/db/1/"
   "/block/db/1000/"
   ;; download permissions
   "/download/db/1/"
   "/download/limited/db/1/"
   "/download/db/1/native/"
   "/download/limited/db/1/native/"
   "/download/db/1/schema/PUBLIC/"
   "/download/limited/db/1/schema/PUBLIC/"
   "/download/db/1/schema/PUBLIC/table/1/"
   "/download/limited/db/1/schema/PUBLIC/table/1/"
   ;; data model permissions
   "/data-model/db/1/"
   "/data-model/db/1/schema/PUBLIC/"
   "/data-model/db/1/schema/PUBLIC/table/1/"
   ;; db details permissions
   "/details/db/1/"
   ;; execution permissions
   "/execute/"
   ;; full admin (everything) root permissions
   "/"])

(def ^:private valid-paths-with-slashes
  [;; COMPANY-NET\ should get escaped to COMPANY-NET\\
   "/db/16/schema/COMPANY-NET\\\\john.doe/"
   ;; COMPANY-NET/ should get escaped to COMPANY-NET\/
   "/db/16/schema/COMPANY-NET\\/john.doe/"
   ;; my\schema should get escaped to my\\schema
   "/db/1/schema/my\\\\schema/table/1/"
   ;; my\\schema should get escaped to my\\\\schema
   "/db/1/schema/my\\\\\\\\schema/table/1/"
   ;; my/schema should get escaped to my\/schema
   "/db/1/schema/my\\/schema/table/1/"])

(deftest ^:parallel valid-path-test
  (testing "valid paths"
    (doseq [path valid-paths]
      (testing (pr-str path)
        (is (= true
               (perms.u/valid-path? path)))))

    (testing "\nWe should allow slashes in permissions paths? (#8693, #13263)\n"
      (doseq [path valid-paths-with-slashes]
        (testing (pr-str path)
          (is (= true
                 (perms.u/valid-path? path)))))))

  (testing "invalid paths"
    (doseq [[reason paths]
            {"Native READ permissions are DEPRECATED as of v0.30 so they should no longer be treated as valid"
             ["/db/1/native/read/"]

             "missing trailing slashes"
             ["/db/1"
              "/db/1/native"
              "/db/1/schema"
              "/db/1/schema/public"
              "/db/1/schema/PUBLIC"
              "/db/1/schema"
              "/db/1/schema/public/db/1"
              "/db/1/schema/PUBLIC/db/1"
              "/db/1/schema//db/1"
              "/db/1/schema/public/db/1/table/2"
              "/db/1/schema/PUBLIC/db/1/table/2"
              "/db/1/schema//db/1/table/2"]

             "too many slashes"
             ["/db/1//"
              "/db/1/native//"
              "/db/1/schema/public//"
              "/db/1/schema/PUBLIC//"
              "/db/1/schema///"
              "/db/1/schema/public/db/1//"
              "/db/1/schema/PUBLIC/db/1//"
              "/db/1/schema//db/1//"
              "/db/1/schema/public/db/1/table/2//"
              "/db/1/schema/PUBLIC/db/1/table/2//"
              "/db/1/schema//db/1/table/2//"]

             "not referencing a specific object. These might be valid permissions paths but not valid paths to objects"
             ["/db/"
              "/db/1/schema/public/db/"
              "/db/1/schema/public/db/1/table/"]

             "duplicate path components"
             ["/db/db/1/"
              "/db/1/native/native/"
              "/db/1/schema/schema/public/"
              "/db/1/schema/public/public/"
              "/db/1/schema/public/db/1/table/table/"
              "/db/1/schema/public/db/1/table/table/2/"]

             "missing beginning slash"
             ["db/1/"
              "db/1/native/"
              "db/1/schema/public/"
              "db/1/schema/PUBLIC/"
              "db/1/schema//"
              "db/1/schema/public/db/1/"
              "db/1/schema/PUBLIC/db/1/"
              "db/1/schema//db/1/"
              "db/1/schema/public/db/1/table/2/"
              "db/1/schema/PUBLIC/db/1/table/2/"
              "db/1/schema//db/1/table/2/"]

             "non-numeric IDs"
             ["/db/toucans/"
              "/db/1/schema/public/table/orders/"]

             "things that aren't even strings"
             [nil
              {}
              []
              true
              false
              (keyword "/db/1/")
              1234]

             "other invalid paths"
             ["/db/1/table/"
              "/db/1/table/2/"
              "/db/1/native/schema/"
              "/db/1/native/write/"
              "/rainforest/"
              "/rainforest/toucans/"
              ""
              "//"
              "/database/1/"
              "/DB/1/"
              "/db/1/SCHEMA/"
              "/db/1/SCHEMA/PUBLIC/"
              "/db/1/schema/PUBLIC/TABLE/1/"]

             "odd number of backslashes: backslash must be escaped by another backslash" ; e.g. \ -> \\
             ["/db/1/schema/my\\schema/table/1/"
              "/db/1/schema/my\\\\\\schema/table/1/"]

             "forward slash must be escaped by a backslash" ; e.g. / -> \/
             ["/db/1/schema/my/schema/table/1/"]

             "block permissions are currently allowed for Databases only."
             ["/block/"
              "/block/db/1/schema/"
              "/block/db/1/schema/PUBLIC/"
              "/block/db/1/schema/PUBLIC/table/"
              "/block/db/1/schema/PUBLIC/table/2/"
              "/block/collection/1/"]

             "invalid download permissions"
             ["/download/"
              "/download/limited/"
              "/download/db/1/schema/PUBLIC/table/1/query/"
              "/download/db/1/schema/PUBLIC/table/1/query/segmented/"]}]

      (testing reason
        (doseq [path paths]
          (testing (str "\n" (pr-str path))
            (is (= false
                   (perms.u/valid-path? path)))))))))

(deftest ^:parallel valid-path-backslashes-test
  (testing "Only even numbers of backslashes should be valid (backslash must be escaped by another backslash)"
    (doseq [[_num-backslashes expected schema-name] [[0 true "PUBLIC"]
                                                     [0 true  "my_schema"]
                                                     [2 false "my\\schema"]
                                                     [4 true  "my\\\\schema"]
                                                     [6 false "my\\\\\\schema"]
                                                     [8 true  "my\\\\\\\\schema"]]]
      (doseq [path [(format "/db/1/schema/%s/table/2/" schema-name)
                    (format "/db/1/schema/%s/table/2/query/" schema-name)]]
        (testing (str "\n" (pr-str path))
          (is (= expected
                 (perms.u/valid-path? path))))))))

(deftest ^:parallel valid-path-format-test
  (testing "known valid paths"
    (doseq [path (concat valid-paths valid-paths-with-slashes)]
      (testing (pr-str path)
        (is (perms.u/valid-path-format? path)))))
  (testing "unknown paths with valid path format"
    (are [path] (perms.u/valid-path-format? path)
      "/asdf/"
      "/asdf/ghjk/"
      "/asdf-ghjk/"
      "/adsf//"
      "/asdf/1/ghkl/"
      "/asdf\\/ghkl/"
      "/asdf\\\\ghkl/"))
  (testing "invalid paths"
    (are [path] (not (perms.u/valid-path-format? path))
      ""
      "/asdf"
      "asdf/"
      "123"
      nil
      ;; these trigger Kondo warnings because the function expects a string or nil, but we should probably test behavior
      ;; anyway for cases where you're passing in a local and Kondo can't infer the type
      #_:clj-kondo/ignore {}
      #_:clj-kondo/ignore []
      #_:clj-kondo/ignore true
      #_:clj-kondo/ignore false
      #_:clj-kondo/ignore (keyword "/asdf/")
      #_:clj-kondo/ignore 1234)))

(deftest ^:parallel permission-classify-path
  (are [path expected] (= expected
                          (perms.u/classify-path path))
    "/"                                                         :admin
    "/block/db/0/"                                              :block
    "/collection/7/"                                            :collection
    "/db/3/"                                                    :data
    "/data-model/db/0/schema/\\/\\/\\/񊏱\\\\\\\\\\\\򍕦/table/4/" :data-model
    "/details/db/6/"                                            :db-conn-details
    "/download/db/7/"                                           :download
    "/execute/"                                                 :execute
    "/application/monitoring/"                                  :non-scoped
    "/query/db/0/native/"                                       :query-v2
    "/data/db/3/schema/something/table/3/"                      :data-v2))

(deftest ^:parallel data-permissions-classify-path
  (are [path] (= :data
                 (perms.u/classify-path path))
    "/db/3/"
    "/db/3/native/"
    "/db/3/schema/"
    "/db/3/schema//"
    "/db/3/schema/secret_base/"
    "/db/3/schema/secret_base/table/3/"
    "/db/3/schema/secret_base/table/3/read/"
    "/db/3/schema/secret_base/table/3/query/"
    "/db/3/schema/secret_base/table/3/query/segmented/"))

(deftest ^:parallel data-permissions-v2-migration-data-perm-classification-test
  (are [path expected] (= expected
                          (perms.u/classify-data-path path))
    "/db/3/"                                            :dk/db
    "/db/3/native/"                                     :dk/db-native
    "/db/3/schema/"                                     :dk/db-schema
    "/db/3/schema//"                                    :dk/db-schema-name
    "/db/3/schema/secret_base/"                         :dk/db-schema-name
    "/db/3/schema/secret_base/table/3/"                 :dk/db-schema-name-and-table
    "/db/3/schema/secret_base/table/3/read/"            :dk/db-schema-name-table-and-read
    "/db/3/schema/secret_base/table/3/query/"           :dk/db-schema-name-table-and-query
    "/db/3/schema/secret_base/table/3/query/segmented/" :dk/db-schema-name-table-and-segmented))

(deftest ^:parallel idempotent-move-test
  (let [;; all v1 paths:
        v1-paths ["/db/3/" "/db/3/native/" "/db/3/schema/" "/db/3/schema//" "/db/3/schema/secret_base/"
                  "/db/3/schema/secret_base/table/3/" "/db/3/schema/secret_base/table/3/read/"
                  "/db/3/schema/secret_base/table/3/query/" "/db/3/schema/secret_base/table/3/query/segmented/"]
        ;; cooresponding v2 paths:
        v2-paths ["/data/db/3/" "/query/db/3/" "/data/db/3/" "/query/db/3/" "/data/db/3/" "/query/db/3/schema/"
                  "/data/db/3/schema//" "/query/db/3/schema//" "/data/db/3/schema/secret_base/"
                  "/query/db/3/schema/secret_base/" "/data/db/3/schema/secret_base/table/3/"
                  "/query/db/3/schema/secret_base/table/3/" "/data/db/3/schema/secret_base/table/3/"
                  "/query/db/3/schema/secret_base/table/3/" "/data/db/3/schema/secret_base/table/3/"
                  "/query/db/3/schema/secret_base/table/3/"]]
    (is (= v2-paths (mapcat #'perms.u/->v2-path v1-paths)))
    (is (= v2-paths (mapcat #'perms.u/->v2-path v2-paths)))
    (let [w (partial mapcat #'perms.u/->v2-path)]
      (is (= v2-paths (->
                                    v1-paths
                          w w                       w w;
                          w w                       w w;
                          w w w w w w w w w w w w w w w;
                          w w w w w w w w w w w w w w w;
                          w w w                   w w w;
                          w w      w         w      w w
                          w w     w w       w w     w w
                          w w           w           w w
                          w w           w           w w
                          w w w w w w w w w w w w w w w;
                              w w w w w w w w w w w;;;;
                              w w w w w w w w w w w;;
                                  w w w w w w w;
                                      w   w;
                                      w   w
                                    w w   w w))))));


(deftest ^:parallel data-permissions-v2-migration-move-test
  (testing "move admin"
    (is (= ["/"] (#'perms.u/->v2-path "/"))))
  (testing "move block"
    (is (= []
           (#'perms.u/->v2-path "/block/db/1/"))))
  (testing "move data"
    (is (= ["/data/db/1/" "/query/db/1/"]
           (#'perms.u/->v2-path "/db/1/")))
    (is (= ["/data/db/1/" "/query/db/1/"]
           (#'perms.u/->v2-path "/db/1/native/")))
    (is (= ["/data/db/1/" "/query/db/1/schema/"]
           (#'perms.u/->v2-path "/db/1/schema/")))
    (is (= ["/data/db/1/schema//" "/query/db/1/schema//"]
           (#'perms.u/->v2-path "/db/1/schema//")))
    (is (= ["/data/db/1/schema/PUBLIC/" "/query/db/1/schema/PUBLIC/"]
           (#'perms.u/->v2-path "/db/1/schema/PUBLIC/")))
    (is (= ["/data/db/1/schema/PUBLIC/table/1/" "/query/db/1/schema/PUBLIC/table/1/"]
           (#'perms.u/->v2-path "/db/1/schema/PUBLIC/table/1/")))
    (is (= []
           (#'perms.u/->v2-path "/db/1/schema/PUBLIC/table/1/read/")))
    (is (= ["/data/db/1/schema/PUBLIC/table/1/" "/query/db/1/schema/PUBLIC/table/1/"]
           (#'perms.u/->v2-path "/db/1/schema/PUBLIC/table/1/query/")))
    (is (= ["/data/db/1/schema/PUBLIC/table/1/" "/query/db/1/schema/PUBLIC/table/1/"]
           (#'perms.u/->v2-path "/db/1/schema/PUBLIC/table/1/query/segmented/")))))

(defn- check-fn [fn-var & [iterations]]
  (let [iterations (or iterations 5000)]
    (if-let [result ((mg/function-checker (:schema (meta fn-var)) {::mg/=>iterations iterations}) @fn-var)]
      result
      {:pass? true :iterations iterations})))

(deftest ^:parallel quickcheck-perm-path-classification-test
  (is (:pass? (check-fn #'perms.u/classify-path))))

(deftest ^:parallel quickcheck-data-path-classification-test
  (is (:pass? (check-fn #'perms.u/classify-data-path))))

(deftest ^:parallel quickcheck-->v2-path-test
  (is (:pass? (check-fn #'perms.u/->v2-path))))
