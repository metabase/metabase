(ns metabase.models.permissions-test
  (:require
   [clojure.test :refer :all]
   [malli.generator :as mg]
   [metabase.models.collection :as collection :refer [Collection]]
   [metabase.models.database :refer [Database]]
   [metabase.models.permissions :as perms :refer [Permissions]]
   [metabase.models.permissions-group
    :as perms-group
    :refer [PermissionsGroup]]
   [metabase.models.table :refer [Table]]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.util :as u]
   [toucan2.core :as t2]
   [toucan2.tools.with-temp :as t2.with-temp]))

(set! *warn-on-reflection* true)

(comment mg/keep-me)

(use-fixtures :once (fixtures/initialize :test-users-personal-collections))

;;; ----------------------------------------------- valid-path? -----------------------------------------------

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

(deftest valid-path-test
  (testing "valid paths"
    (doseq [path valid-paths]
      (testing (pr-str path)
        (is (= true
               (perms/valid-path? path)))))

    (testing "\nWe should allow slashes in permissions paths? (#8693, #13263)\n"
      (doseq [path valid-paths-with-slashes]
        (testing (pr-str path)
          (is (= true
                 (perms/valid-path? path)))))))

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
                   (perms/valid-path? path)))))))))

(deftest valid-path-backslashes-test
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
                 (perms/valid-path? path))))))))

(deftest valid-path-format-test
  (testing "known valid paths"
    (doseq [path (concat valid-paths valid-paths-with-slashes)]
      (testing (pr-str path)
        (is (= true
               (perms/valid-path-format? path))))))

  (testing "unknown paths with valid path format"
    (doseq [path ["/asdf/"
                  "/asdf/ghjk/"
                  "/asdf-ghjk/"
                  "/adsf//"
                  "/asdf/1/ghkl/"
                  "/asdf\\/ghkl/"
                  "/asdf\\\\ghkl/"]]
      (testing (pr-str path)
        (is (= true
               (perms/valid-path-format? path))))))

  (testing "invalid paths"
    (doseq [path
            [""
             "/asdf"
             "asdf/"
             "123"
             nil
             {}
             []
             true
             false
             (keyword "/asdf/")
             1234]]
      (testing (pr-str path)
        (is (= false
               (perms/valid-path-format? path)))))))


;;; -------------------------------------------------- data-perms-path ---------------------------------------------------

(deftest data-perms-path-test
  (testing "valid paths"
    (doseq [[expected args] {"/db/1/"                       [1]
                             "/db/1/schema/public/"         [1 "public"]
                             "/db/1/schema/public/table/2/" [1 "public" 2]}]
      (testing (pr-str (cons 'perms/data-perms-path args))
        (is (= expected
               (apply perms/data-perms-path args))))))

  (testing "invalid paths"
    (testing "invalid input should throw an exception"
      (doseq [args [[]
                    [1 "public" 2 3]
                    [nil]
                    ["sales"]
                    [:sales]
                    [true]
                    [false]
                    [{}]
                    [[]]
                    [:sales]
                    [1 true]
                    [1 false]
                    [1 {}]
                    [1 []]
                    [1 :sales]
                    [1 "public" nil]
                    [1 "public" "sales"]
                    [1 "public" :sales]
                    [1 "public" true]
                    [1 "public" false]
                    [1 "public" {}]
                    [1 "public" []]]]
        (testing (pr-str (cons 'perms/data-perms-path args))
          (is (thrown?
               Exception
               (apply perms/data-perms-path args))))))))

(deftest data-perms-path-escape-slashes-test
  (doseq [{:keys [slash-direction schema-name expected-escaped]} [{:slash-direction  "back (#8693)"
                                                                   :schema-name      "my\\schema"
                                                                   :expected-escaped "my\\\\schema"}
                                                                  {:slash-direction  "back (multiple)"
                                                                   :schema-name      "my\\\\schema"
                                                                   :expected-escaped "my\\\\\\\\schema"}
                                                                  {:slash-direction  "forward (#12450)"
                                                                   :schema-name      "my/schema"
                                                                   :expected-escaped "my\\/schema"}
                                                                  {:slash-direction  "both"
                                                                   :schema-name      "my\\/schema"
                                                                   :expected-escaped "my\\\\\\/schema"}
                                                                  {:slash-direction  "both (multiple)"
                                                                   :schema-name      "my\\\\/schema"
                                                                   :expected-escaped "my\\\\\\\\\\/schema"}]]
    (testing (format "We should handle slashes in permissions paths\nDirection = %s\nSchema = %s\n"
                     slash-direction (pr-str schema-name))
      (testing (pr-str (list 'data-perms-path {:id 1}))
        (is (= "/db/1/"
               (perms/data-perms-path {:id 1}))))
      (testing (pr-str (list 'data-perms-path {:id 1} schema-name))
        (is (= (format "/db/1/schema/%s/" expected-escaped)
               (perms/data-perms-path {:id 1} schema-name))))
      (testing (pr-str (list 'data-perms-path {:id 1} schema-name {:id 2}))
        (is (= (format "/db/1/schema/%s/table/2/" expected-escaped)
               (perms/data-perms-path {:id 1} schema-name {:id 2})))))))


;;; ---------------------------------- Generating permissions paths for Collections ----------------------------------

(deftest collection-path-test
  (doseq [[perms-type f-symb] {:read      'collection-read-path
                               :readwrite 'collection-readwrite-path}
          :let                [f (ns-resolve 'metabase.models.permissions f-symb)]]
    (doseq [[input expected]
            {1                                                        {:read      "/collection/1/read/"
                                                                       :readwrite "/collection/1/"}
             {:id 1}                                                  {:read      "/collection/1/read/"
                                                                       :readwrite "/collection/1/"}
             collection/root-collection                               {:read      "/collection/root/read/"
                                                                       :readwrite "/collection/root/"}
             (assoc collection/root-collection :namespace "snippets") {:read      "/collection/namespace/snippets/root/read/"
                                                                       :readwrite "/collection/namespace/snippets/root/"}
             (assoc collection/root-collection :namespace "a/b")      {:read      "/collection/namespace/a\\/b/root/read/"
                                                                       :readwrite "/collection/namespace/a\\/b/root/"}
             (assoc collection/root-collection :namespace :a/b)       {:read      "/collection/namespace/a\\/b/root/read/"
                                                                       :readwrite "/collection/namespace/a\\/b/root/"}}
            :let [expected (get expected perms-type)]]
      (testing (pr-str (list f-symb input))
        (is (= expected
               (f input)))))

    (doseq [input [{} nil "1"]]
      (testing (pr-str (list f-symb input))
        (is (thrown?
             Exception
             (f input)))))))


;;; ------------------------------------------- is-permissions-for-object? -------------------------------------------

(deftest is-permissions-for-object?-test
  (doseq [[expected inputs]
          {true
           ["/"
            "/db/"
            "/db/1/"
            "/db/1/schema/"
            "/db/1/schema/PUBLIC/"
            "/db/1/schema/PUBLIC/table/1/"]

           false
           ["/db/2/"
            "/db/2/native/"
            "/db/1/schema/public/"
            "/db/1/schema/private/"
            "/db/1/schema/PUBLIC/table/2/"]}

          perms-path inputs]
    (testing (pr-str (list 'is-permissions-for-object? perms-path "/db/1/schema/PUBLIC/table/1/"))
      (is (= expected
             (perms/is-permissions-for-object? perms-path "/db/1/schema/PUBLIC/table/1/"))))))


;;; --------------------------------------- is-partial-permissions-for-object? ---------------------------------------

(deftest is-partial-permissions-for-object?-test
  (doseq [[expected inputs]
          {true
           ["/"
            "/db/"
            "/db/1/"
            "/db/1/schema/"
            "/db/1/schema/PUBLIC/"
            "/db/1/schema/PUBLIC/table/"
            "/db/1/schema/PUBLIC/table/1/"
            "/db/1/schema/PUBLIC/table/1/field/"
            "/db/1/schema/PUBLIC/table/1/field/2/"]

           false
           ["/db/2/"
            "/db/2/native/"]}

          perms-path inputs]
    (testing (pr-str (list 'is-partial-permissions-for-object? perms-path "/db/1/"))
      (is (= expected
             (perms/is-partial-permissions-for-object? perms-path "/db/1/"))))))


;;; ---------------------------------------------- is-permissions-set? -----------------------------------------------

;;; This originally lived in [[metabase.models.permissions]] but it is only used in tests these days so I moved it here.
(defn is-permissions-set?
  "Is `permissions-set` a valid set of permissions object paths?"
  ^Boolean [permissions-set]
  (and (set? permissions-set)
       (every? (fn [path]
                 (or (= path "/")
                     (perms/valid-path? path)))
               permissions-set)))

(deftest is-permissions-set?-test
  (testing "valid permissions sets"
    (doseq [perms-set [#{}
                       #{"/"}
                       #{"/db/1/"}
                       #{"/db/1/"}
                       #{"/db/1/schema/"}
                       #{"/db/1/schema/public/"}
                       #{"/db/1/schema/public/table/1/"}
                       #{"/" "/db/2/"}
                       #{"/db/1/" "/db/2/schema/"}
                       #{"/db/1/schema/" "/db/2/schema/public/"}
                       #{"/db/1/schema/public/" "/db/2/schema/public/table/3/"}
                       #{"/db/1/schema/public/table/2/" "/db/3/schema/public/table/4/"}]]
      (testing (pr-str (list 'is-permissions-set? perms-set))
        (is (= true
               (is-permissions-set? perms-set))))))

  (testing "invalid permissions sets"
    (doseq [[group sets] {"things that aren't sets"
                          [nil {} [] true false "" 1234 :wow]

                          "things that contain invalid paths"
                          [#{"/" "/toucans/"}
                           #{"/db/1/" "//"}
                           #{"/db/1/" "/db/1/table/2/"}
                           #{"/db/1/native/schema/"}
                           #{"/db/1/schema/public/" "/parroty/"}
                           #{"/db/1/schema/public/table/1/" "/ocean/"}]}]
      (testing group
        (doseq [perms-set sets]
          (testing (pr-str (list 'is-permissions-set? perms-set))
            (is (= false
                   (is-permissions-set? perms-set)))))))))


;;; ------------------------------------------- set-has-full-permissions? --------------------------------------------

(deftest set-has-full-permissions?-test
  (doseq [[expected inputs]
          {true
           [[#{"/"}                                                     "/db/1/schema/public/table/2/"]
            [#{"/db/3/" "/db/1/"}                                       "/db/1/schema/public/table/2/"]
            [#{"/db/3/" "/db/1/"}                                       "/db/1/schema/public/table/2/"]
            [#{"/db/1/schema/public/" "/db/3/schema//"}                 "/db/1/schema/public/table/2/"]
            [#{"/db/3/schema//table/4/" "/db/1/schema/public/table/2/"} "/db/1/schema/public/table/2/"]
            [#{"/db/1/native/"}                                         "/db/1/native/"]]

           false
           [[#{}                                              "/db/1/schema/public/table/2/"]
            [#{"/db/1/native/"}                               "/db/1/"]
            [#{"/db/1/schema/public/"}                        "/db/1/schema/"]
            [#{"/db/1/schema/public/table/1/"}                "/db/1/schema/public/"]
            [#{"/db/2/"}                                      "/db/1/schema/public/table/2/"]
            [#{"/db/3/" "/db/2/"}                             "/db/1/schema/public/table/2/"]
            [#{"/db/3/schema/public/" "/db/2/schema/public/"} "/db/1/schema/public/table/2/"]]}

          [perms path] inputs]
    (testing (pr-str (list 'set-has-full-permissions? perms path))
      (is (= expected
             (perms/set-has-full-permissions? perms path))))))


;;; ------------------------------------------ set-has-partial-permissions? ------------------------------------------

(deftest set-has-partial-permissions?-test
  (doseq [[expected inputs]
          {true
           [[#{"/"}                                                     "/db/1/schema/public/table/2/"]
            [#{"/db/3/" "/db/1/"}                                       "/db/1/schema/public/table/2/"]
            [#{"/db/3/" "/db/1/"}                                       "/db/1/schema/public/table/2/"]
            [#{"/db/1/schema/public/" "/db/3/schema//"}                 "/db/1/schema/public/table/2/"]
            [#{"/db/3/schema//table/4/" "/db/1/schema/public/table/2/"} "/db/1/schema/public/table/2/"]
            [#{"/db/1/schema/public/"}                                  "/db/1/"]
            [#{"/db/1/schema/"}                                         "/db/1/"]
            [#{"/db/1/schema/public/"}                                  "/db/1/"]
            [#{"/db/1/schema/public/table/1/"}                          "/db/1/"]
            [#{"/db/1/schema/public/"}                                  "/db/1/schema/"]
            [#{"/db/1/schema/public/table/1/"}                          "/db/1/schema/"]
            [#{"/db/1/schema/public/table/1/"}                          "/db/1/schema/public/"]
            [#{"/db/3/schema//table/4/" "/db/1/schema/public/table/2/"} "/db/1/"]]

           false
           [[#{}                                              "/db/1/schema/public/table/2/"]
            [#{"/db/1/schema/"}                               "/db/1/native/"]
            [#{"/db/1/native/"}                               "/db/1/schema/"]
            [#{"/db/2/"}                                      "/db/1/schema/public/table/2/"]
            [#{"/db/3/" "/db/2/"}                             "/db/1/schema/public/table/2/"]
            [#{"/db/3/schema/public/" "/db/2/schema/public/"} "/db/1/schema/public/table/2/"]]}

          [perms path] inputs]
    (testing (pr-str (list 'set-has-partial-permissions? perms path))
      (is (= expected
             (perms/set-has-partial-permissions? perms path))))))


;;; -------------------------------------- set-has-application-permission-of-type? ---------------------------------------

(deftest set-has-application-permission-of-type?-test
  (doseq [[expected inputs]
          {true
           [[#{"/"}                          :subscription]
            [#{"/"}                          :monitoring]
            [#{"/"}                          :setting]
            [#{"/application/subscription/"} :subscription]
            [#{"/application/monitoring/"}   :monitoring]
            [#{"/application/setting/"}      :setting]]
           false
           [[#{"/application/subscription/"} :monitoring]
            [#{"/application/subscription/"} :setting]
            [#{"/application/monitoring/"}   :subscription]]}
          [perms path] inputs]
    (testing (pr-str (list 'set-has-application-permission-of-type? perms path))
      (is (= expected
             (perms/set-has-application-permission-of-type? perms path))))))

;;; --------------------------------------- set-has-full-permissions-for-set? ----------------------------------------

(deftest set-has-full-permissions-for-set?-test
  (doseq [[expected inputs]
          {true
           [[#{"/"}                                                     #{"/db/3/schema//table/4/" "/db/1/schema/public/table/2/"}]
            [#{"/db/3/" "/db/1/"}                                       #{"/db/3/schema//table/4/" "/db/1/schema/public/table/2/"}]
            [#{"/db/3/" "/db/1/"}                                       #{"/db/3/schema//table/4/" "/db/1/schema/public/table/2/"}]
            [#{"/db/1/schema/public/" "/db/3/schema//"}                 #{"/db/3/schema//table/4/" "/db/1/schema/public/table/2/"}]
            [#{"/db/3/schema//table/4/" "/db/1/schema/public/table/2/"} #{"/db/3/schema//table/4/" "/db/1/schema/public/table/2/"}]]

           false
           [[#{}                                                        #{"/db/3/schema//table/4/" "/db/1/schema/public/table/2/"}]
            [#{"/db/2/"}                                                #{"/db/3/schema//table/4/" "/db/1/schema/public/table/2/"}]
            [#{"/db/2/" "/db/1/"}                                       #{"/db/3/schema//table/4/" "/db/1/schema/public/table/2/"}]
            [#{"/db/3/schema/public/" "/db/1/schema/public/"}           #{"/db/3/schema//table/4/" "/db/1/schema/public/table/2/"}]
            [#{"/db/3/schema//table/5/" "/db/1/schema/public/table/2/"} #{"/db/3/schema//table/4/" "/db/1/schema/public/table/2/"}]]}

          [perms paths] inputs]
    (testing (pr-str (list 'set-has-full-permissions-for-set? perms paths))
      (is (= expected
             (perms/set-has-full-permissions-for-set? perms paths))))))


;;; -------------------------------------- set-has-partial-permissions-for-set? --------------------------------------

(deftest set-has-partial-permissions-for-set?-test
  (doseq [[expected inputs]
          {true
           [[#{"/"}                                                      #{"/db/1/schema/public/table/2/" "/db/2/"}]
            [#{"/db/1/schema/public/table/2/" "/db/3/schema/public/"}    #{"/db/1/" "/db/3/"}]
            [#{"/db/1/schema/public/table/2/" "/db/3/"}                  #{"/db/1/"}]
            [#{"/db/1/schema/public/" "/db/3/schema//"}                  #{"/db/1/" "/db/3/"}]
            [#{"/db/1/schema/public/table/2/" "/db/3/schema//table/4/"}  #{"/db/1/"}]
            [#{"/db/1/schema/public/"}                                   #{"/db/1/"}]
            [#{"/db/1/schema/"}                                          #{"/db/1/"}]
            [#{"/db/1/schema/public/"}                                   #{"/db/1/"}]
            [#{"/db/1/schema/public/"}                                   #{"/db/1/" "/db/1/schema/"}]
            [#{"/db/1/schema/public/"}                                   #{"/db/1/" "/db/1/schema/public/"}]
            [#{"/db/1/schema/public/table/1/"}                           #{"/db/1/" "/db/1/schema/public/table/1/"}]
            [#{"/db/1/native/"}                                          #{"/db/1/native/"}]
            [#{"/db/1/schema/public/"}                                   #{"/db/1/schema/"}]
            [#{"/db/1/schema/public/table/1/"}                           #{"/db/1/schema/"}]
            [#{"/db/1/schema/public/table/1/"}                           #{"/db/1/schema/public/"}]
            [#{"/db/1/schema/public/table/2/" "/db/3/schema//table/4/"}  #{"/db/1/"}]]

           false
           [[#{}                                                        #{"/db/1/schema/public/table/2/"}]
            [#{"/db/1/schema/"}                                         #{"/db/1/native/"}]
            [#{"/db/1/native/"}                                         #{"/db/1/schema/"}]
            [#{"/db/2/"}                                                #{"/db/1/schema/public/table/2/"}]
            [#{"/db/2/" "/db/3/"}                                       #{"/db/1/schema/public/table/2/"}]
            [#{"/db/2/schema/public/" "/db/3/schema/public/"}           #{"/db/1/schema/public/table/2/"}]
            [#{"/db/1/schema/public/table/2/" "/db/3/schema/public/"}   #{"/db/1/" "/db/3/" "/db/9/"}]
            [#{"/db/1/schema/public/table/2/" "/db/3/"}                 #{"/db/1/" "/db/9/"}]
            [#{"/db/1/schema/public/" "/db/3/schema//"}                 #{"/db/1/" "/db/3/" "/db/9/"}]
            [#{"/db/1/schema/public/table/2/" "/db/3/schema//table/4/"} #{"/db/1/" "/db/9/"}]
            [#{"/db/1/schema/public/"}                                  #{"/db/1/" "/db/9/"}]
            [#{"/db/1/schema/"}                                         #{"/db/1/" "/db/9/"}]
            [#{"/db/1/schema/public/"}                                  #{"/db/1/" "/db/9/"}]
            [#{"/db/1/schema/public/"}                                  #{"/db/1/" "/db/1/schema/" "/db/9/"}]
            [#{"/db/1/schema/public/"}                                  #{"/db/1/" "/db/1/schema/public/" "/db/9/"}]
            [#{"/db/1/schema/public/table/1/"}                          #{"/db/1/" "/db/1/schema/public/table/1/" "/db/9/"}]
            [#{"/db/1/native/"}                                         #{"/db/1/native/" "/db/9/"}]
            [#{"/db/1/schema/public/"}                                  #{"/db/1/schema/" "/db/9/"}]
            [#{"/db/1/schema/public/table/1/"}                          #{"/db/1/schema/" "/db/9/"}]
            [#{"/db/1/schema/public/table/1/"}                          #{"/db/1/schema/public/" "/db/9/"}]
            [#{"/db/1/schema/public/table/2/" "/db/3/schema//table/4/"} #{"/db/1/" "/db/9/"}]]}

          [perms paths] inputs]
    (testing (pr-str (list 'set-has-partial-permissions-for-set? perms paths))
      (is (= expected
             (perms/set-has-partial-permissions-for-set? perms paths))))))


;;; -------------------------------------- set-has-any-native-query-permissions? ---------------------------------------

(deftest set-has-any-native-query-permissions?-test
  (doseq [[expected inputs]
          {true
           [#{"/"}
            #{"/db/1/"}
            #{"/db/1/native/"}
            #{"/db/1/" "/db/2/schema/PUBLIC/table/1/"}
            #{"/db/1/native/" "/db/2/schema/PUBLIC/table/1/"}]

           false
           [#{}
            #{"/db/1"}
            #{"/db/1/native"}
            #{"/db/1/schema/"}
            #{"/db/1/schema/PUBLIC/table/1/"}]}
          input inputs]
    (testing (pr-str (list 'set-has-any-native-query-permissions?-test input))
      (is (= expected
             (perms/set-has-any-native-query-permissions? input))))))


;;; ------------------------------------ perms-objects-set-for-parent-collection -------------------------------------

(deftest perms-objects-set-for-parent-collection-test
  (doseq [[input expected] {[{:collection_id 1337} :read]  #{"/collection/1337/read/"}
                            [{:collection_id 1337} :write] #{"/collection/1337/"}
                            [{:collection_id nil} :read]   #{"/collection/root/read/"}
                            [{:collection_id nil} :write]  #{"/collection/root/"}}]
    (testing (pr-str (cons 'perms-objects-set-for-parent-collection input))
      (is (= expected
             (apply perms/perms-objects-set-for-parent-collection input)))))

  (testing "invalid input"
    (doseq [[reason inputs] {"map must have `:collection_id` key"
                             [[{} :read]]

                             "must be a map"
                             [[100 :read]
                              [nil :read]]

                             "read-or-write must be `:read` or `:write`"
                             [[{:collection_id nil} :readwrite]]}
            input inputs]
      (testing reason
        (testing (pr-str (cons 'perms-objects-set-for-parent-collection input))
          (is (thrown?
               Exception
               (apply perms/perms-objects-set-for-parent-collection input))))))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                            Permissions Graph Tests                                             |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- test-data-graph [group]
  (get-in (perms/data-perms-graph) [:groups (u/the-id group) (mt/id) :data :schemas "PUBLIC"]))

(deftest graph-set-partial-permissions-for-table-test
  (testing "Test that setting partial permissions for a table retains permissions for other tables -- #3888"
    (t2.with-temp/with-temp [PermissionsGroup group]
      (testing "before"
        ;; first, graph permissions only for VENUES
        (perms/grant-permissions! group (perms/data-perms-path (mt/id) "PUBLIC" (mt/id :venues)))
        (is (= {(mt/id :venues) :all}
               (test-data-graph group))))
      (testing "after"
        ;; next, grant permissions via `update-graph!` for CATEGORIES as well. Make sure permissions for VENUES are
        ;; retained (#3888)
        (perms/update-data-perms-graph! [(u/the-id group) (mt/id) :data :schemas "PUBLIC" (mt/id :categories)] :all)
        (is (= {(mt/id :categories) :all, (mt/id :venues) :all}
               (test-data-graph group)))))))

(deftest graph-for-tables-without-schemas-test
  (testing "Make sure that the graph functions work correctly for DBs with no schemas (#4000)"
    (mt/with-temp* [PermissionsGroup [group]
                    Database         [database]
                    Table            [table    {:db_id (u/the-id database)}]]
      ;; try to grant idential permissions to the table twice
      (perms/update-data-perms-graph! [(u/the-id group) (u/the-id database) :data :schemas] {"" {(u/the-id table) :all}})
      (perms/update-data-perms-graph! [(u/the-id group) (u/the-id database) :data :schemas] {"" {(u/the-id table) :all}})
      ;; now fetch the perms that have been granted
      (is (= {"" {(u/the-id table) :all}}
             (get-in (perms/data-perms-graph) [:groups (u/the-id group) (u/the-id database) :data :schemas]))))))

(deftest broken-out-read-query-perms-in-graph-test
  (testing "Make sure we can set the new broken-out read/query perms for a Table and the graph works as we'd expect"
    (t2.with-temp/with-temp [PermissionsGroup group]
      (perms/grant-permissions! group (perms/table-read-path (t2/select-one Table :id (mt/id :venues))))
      (is (= {(mt/id :venues) {:read :all}}
             (test-data-graph group))))

    (t2.with-temp/with-temp [PermissionsGroup group]
      (perms/grant-permissions! group (perms/table-segmented-query-path (t2/select-one Table :id (mt/id :venues))))
      (is (= {(mt/id :venues) {:query :segmented}}
             (test-data-graph group))))

    (t2.with-temp/with-temp [PermissionsGroup group]
      (perms/update-data-perms-graph! [(u/the-id group) (mt/id) :data :schemas]
                                      {"PUBLIC"
                                       {(mt/id :venues)
                                        {:read :all, :query :segmented}}})
      (is (= {(mt/id :venues) {:read  :all
                               :query :segmented}}
             (test-data-graph group))))))

(deftest root-permissions-graph-test
  (testing "A \"/\" permission grants all dataset permissions"
    (t2.with-temp/with-temp [Database {db-id :id}]
      (let [{:keys [group_id]} (t2/select-one Permissions :object "/")]
        (is (= {db-id {:data       {:native  :write
                                    :schemas :all}
                       :download   {:native  :full
                                    :schemas :full}
                       :data-model {:schemas :all}
                       :details    :yes}}
               (-> (perms/data-perms-graph)
                   (get-in [:groups group_id])
                   (select-keys [db-id :execute]))))))))

(deftest update-graph-validate-db-perms-test
  (testing "Check that validation of DB `:schemas` and `:native` perms doesn't fail if only one of them changes"
    (t2.with-temp/with-temp [Database {db-id :id}]
      (perms/revoke-data-perms! (perms-group/all-users) db-id)
      (let [ks [:groups (u/the-id (perms-group/all-users)) db-id :data]]
        (letfn [(perms []
                  (get-in (perms/data-perms-graph) ks))
                (set-perms! [new-perms]
                  (perms/update-data-perms-graph! (assoc-in (perms/data-perms-graph) ks new-perms))
                  (perms))]
          (testing "Should initially have no perms"
            (is (= nil
                   (perms))))
          (testing "grant schema perms"
            (is (= {:schemas :all}
                   (set-perms! {:schemas :all}))))
          (testing "grant native perms"
            (is (= {:schemas :all, :native :write}
                   (set-perms! {:schemas :all, :native :write}))))
          (testing "revoke native perms"
            (is (= {:schemas :all}
                   (set-perms! {:schemas :all, :native :none}))))
          (testing "revoke schema perms"
            (is (= nil
                   (set-perms! {:schemas :none}))))
          (testing "disallow schemas :none + :native :write"
            (is (thrown-with-msg?
                 Exception
                 #"Invalid DB permissions: If you have write access for native queries, you must have data access to all schemas."
                 (set-perms! {:schemas :none, :native :write})))
            (is (= nil
                   (perms)))))))))

(deftest get-graph-should-unescape-slashes-test
  (testing "If a schema name contains slash, getting graph should unescape it"
    (testing "slash"
      (t2.with-temp/with-temp [PermissionsGroup group]
        (perms/grant-permissions! group (perms/data-perms-path (mt/id) "schema/with_slash" (mt/id :venues)))
        (is (= "schema/with_slash"
               (-> (get-in (perms/data-perms-graph) [:groups (u/the-id group) (mt/id) :data :schemas])
                   keys
                   first)))))

    (testing "back slash"
      (t2.with-temp/with-temp [PermissionsGroup group]
        (perms/grant-permissions! group (perms/data-perms-path (mt/id) "schema\\with_backslash" (mt/id :venues)))
        (is (= "schema\\with_backslash"
               (-> (get-in (perms/data-perms-graph) [:groups (u/the-id group) (mt/id) :data :schemas])
                   keys
                   first)))))))

(deftest no-op-partial-graph-updates
  (testing "Partial permission graphs with no changes to the existing graph do not error when run repeatedly (#25221)"
    (t2.with-temp/with-temp [PermissionsGroup group]
      ;; Bind *current-user* so that permission revisions are written, which was the source of the original error
      (mt/with-current-user (mt/user->id :rasta)
        (is (nil? (perms/update-data-perms-graph! {:groups {(u/the-id group) {(mt/id) {:data {:native :none :schemas :none}}}}
                                                   :revision (:revision (perms/data-perms-graph))})))
        (is (nil? (perms/update-data-perms-graph! {:groups {(u/the-id group) {(mt/id) {:data {:native :none :schemas :none}}}}
                                                   :revision (:revision (perms/data-perms-graph))})))

        (perms/grant-permissions! group (perms/data-perms-path (mt/id)))
        (is (nil? (perms/update-data-perms-graph! {:groups {(u/the-id group) {(mt/id) {:data {:native :write :schemas :all}}}}
                                                   :revision (:revision (perms/data-perms-graph))})))
        (is (nil? (perms/update-data-perms-graph! {:groups {(u/the-id group) {(mt/id) {:data {:native :write :schemas :all}}}}
                                                   :revision (:revision (perms/data-perms-graph))})))))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                 Granting/Revoking Permissions Helper Functions                                 |
;;; +----------------------------------------------------------------------------------------------------------------+

(deftest revoke-permissions-helper-function-test
  (testing "Make sure if you try to use the helper function to *revoke* perms for a Personal Collection, you get an Exception"
    (is (thrown? Exception
                 (perms/revoke-collection-permissions!
                  (perms-group/all-users)
                  (u/the-id (t2/select-one Collection :personal_owner_id (mt/user->id :lucky))))))

    (testing "(should apply to descendants as well)"
      (t2.with-temp/with-temp [Collection collection {:location (collection/children-location
                                                                 (collection/user->personal-collection
                                                                  (mt/user->id :lucky)))}]
        (is (thrown? Exception
                     (perms/revoke-collection-permissions! (perms-group/all-users) collection)))))))

(deftest revoke-collection-permissions-test
  (testing "Should be able to revoke permissions for non-personal Collections"
    (t2.with-temp/with-temp [Collection {collection-id :id}]
      (perms/revoke-collection-permissions! (perms-group/all-users) collection-id)
      (testing "Collection should still exist"
        (is (some? (t2/select-one Collection :id collection-id)))))))

(deftest disallow-granting-personal-collection-perms-test
  (t2.with-temp/with-temp [Collection collection {:location (collection/children-location
                                                             (collection/user->personal-collection
                                                              (mt/user->id :lucky)))}]
    (doseq [[perms-type f] {"read"  perms/grant-collection-read-permissions!
                            "write" perms/grant-collection-readwrite-permissions!}]
      (testing (format "Should throw Exception if you use the helper function to grant %s perms for a Personal Collection"
                       perms-type)
        (is (thrown?
             Exception
             (f (perms-group/all-users)
                (u/the-id (t2/select-one Collection :personal_owner_id (mt/user->id :lucky))))))

        (testing "(should apply to descendants as well)"
          (is (thrown?
               Exception
               (f (perms-group/all-users) collection))))))))

(deftest grant-revoke-root-collection-permissions-test
  (t2.with-temp/with-temp [PermissionsGroup {group-id :id}]
    (letfn [(perms []
              (t2/select-fn-set :object Permissions {:where [:and
                                                             [:like :object "/collection/%"]
                                                             [:= :group_id group-id]]}))]
      (is (= nil
             (perms)))
      (testing "Should be able to grant Root Collection perms"
        (perms/grant-collection-read-permissions! group-id collection/root-collection)
        (is (= #{"/collection/root/read/"}
               (perms))))
      (testing "Should be able to grant non-default namespace Root Collection read perms"
        (perms/grant-collection-read-permissions! group-id (assoc collection/root-collection :namespace "currency"))
        (is (= #{"/collection/root/read/" "/collection/namespace/currency/root/read/"}
               (perms))))
      (testing "Should be able to revoke Root Collection perms (shouldn't affect other namespaces)"
        (perms/revoke-collection-permissions! group-id collection/root-collection)
        (is (= #{"/collection/namespace/currency/root/read/"}
               (perms))))
      (testing "Should be able to grant Root Collection readwrite perms"
        (perms/grant-collection-readwrite-permissions! group-id collection/root-collection)
        (is (= #{"/collection/root/" "/collection/namespace/currency/root/read/"}
               (perms))))
      (testing "Should be able to grant non-default namespace Root Collection readwrite perms"
        (perms/grant-collection-readwrite-permissions! group-id (assoc collection/root-collection :namespace "currency"))
        (is (= #{"/collection/root/" "/collection/namespace/currency/root/read/" "/collection/namespace/currency/root/"}
               (perms))))
      (testing "Should be able to revoke non-default namespace Root Collection perms (shouldn't affect default namespace)"
        (perms/revoke-collection-permissions! group-id (assoc collection/root-collection :namespace "currency"))
        (is (= #{"/collection/root/"}
               (perms)))))))

(deftest grant-revoke-application-permissions-test
  (t2.with-temp/with-temp [PermissionsGroup {group-id :id}]
    (letfn [(perms []
              (t2/select-fn-set :object Permissions
                                {:where [:and [:= :group_id group-id]
                                         [:like :object "/application/%"]]}))]
      (is (= nil (perms)))
      (doseq [[perm-type perm-path] [[:subscription "/application/subscription/"]
                                     [:monitoring "/application/monitoring/"]
                                     [:setting "/application/setting/"]]]
        (testing (format "Able to grant `%s` permission" (name perm-type))
          (perms/grant-application-permissions! group-id perm-type)
          (is (= (perms)  #{perm-path})))
        (testing (format "Able to revoke `%s` permission" (name perm-type))
          (perms/revoke-application-permissions! group-id perm-type)
          (is (not (= (perms) #{perm-path}))))))))

(deftest permission-classify-path
  (is (= :admin           (perms/classify-path "/")))
  (is (= :block           (perms/classify-path "/block/db/0/")))
  (is (= :collection      (perms/classify-path "/collection/7/")))
  (is (= :data            (perms/classify-path "/db/3/")))
  (is (= :data-model      (perms/classify-path "/data-model/db/0/schema/\\/\\/\\/񊏱\\\\\\\\\\\\򍕦/table/4/")))
  (is (= :db-conn-details (perms/classify-path "/details/db/6/")))
  (is (= :download        (perms/classify-path "/download/db/7/")))
  (is (= :execute         (perms/classify-path "/execute/")))
  (is (= :non-scoped      (perms/classify-path "/application/monitoring/")))

  (is (= :query-v2        (perms/classify-path "/query/db/0/native/")))
  (is (= :data-v2         (perms/classify-path "/data/db/3/schema/something/table/3/"))))


(deftest data-permissions-classify-path
  (is (= :data (perms/classify-path "/db/3/")))
  (is (= :data (perms/classify-path "/db/3/native/")))
  (is (= :data (perms/classify-path "/db/3/schema/")))
  (is (= :data (perms/classify-path "/db/3/schema//")))
  (is (= :data (perms/classify-path "/db/3/schema/secret_base/")))
  (is (= :data (perms/classify-path "/db/3/schema/secret_base/table/3/")))
  (is (= :data (perms/classify-path "/db/3/schema/secret_base/table/3/read/")))
  (is (= :data (perms/classify-path "/db/3/schema/secret_base/table/3/query/")))
  (is (= :data (perms/classify-path "/db/3/schema/secret_base/table/3/query/segmented/"))))

(deftest data-permissions-v2-migration-data-perm-classification-test
  (is (= :dk/db                                 (perms/classify-data-path "/db/3/")))
  (is (= :dk/db-native                          (perms/classify-data-path "/db/3/native/")))
  (is (= :dk/db-schema                          (perms/classify-data-path "/db/3/schema/")))
  (is (= :dk/db-schema-name                     (perms/classify-data-path "/db/3/schema//")))
  (is (= :dk/db-schema-name                     (perms/classify-data-path "/db/3/schema/secret_base/")))
  (is (= :dk/db-schema-name-and-table           (perms/classify-data-path "/db/3/schema/secret_base/table/3/")))
  (is (= :dk/db-schema-name-table-and-read      (perms/classify-data-path "/db/3/schema/secret_base/table/3/read/")))
  (is (= :dk/db-schema-name-table-and-query     (perms/classify-data-path "/db/3/schema/secret_base/table/3/query/")))
  (is (= :dk/db-schema-name-table-and-segmented (perms/classify-data-path "/db/3/schema/secret_base/table/3/query/segmented/"))))

(deftest idempotent-move-test
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
    (is (= v2-paths (mapcat #'perms/->v2-path v1-paths)))
    (is (= v2-paths (mapcat #'perms/->v2-path v2-paths)))
    (let [w (partial mapcat #'perms/->v2-path)]
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


(deftest data-permissions-v2-migration-move-test
  (testing "move admin"
    (is (= ["/"] (#'perms/->v2-path "/"))))
  (testing "move block"
    (is (= []
           (#'perms/->v2-path "/block/db/1/"))))
  (testing "move data"
    (is (= ["/data/db/1/" "/query/db/1/"]
           (#'perms/->v2-path "/db/1/")))
    (is (= ["/data/db/1/" "/query/db/1/"]
           (#'perms/->v2-path "/db/1/native/")))
    (is (= ["/data/db/1/" "/query/db/1/schema/"]
           (#'perms/->v2-path "/db/1/schema/")))
    (is (= ["/data/db/1/schema//" "/query/db/1/schema//"]
           (#'perms/->v2-path "/db/1/schema//")))
    (is (= ["/data/db/1/schema/PUBLIC/" "/query/db/1/schema/PUBLIC/"]
           (#'perms/->v2-path "/db/1/schema/PUBLIC/")))
    (is (= ["/data/db/1/schema/PUBLIC/table/1/" "/query/db/1/schema/PUBLIC/table/1/"]
           (#'perms/->v2-path "/db/1/schema/PUBLIC/table/1/")))
    (is (= []
           (#'perms/->v2-path "/db/1/schema/PUBLIC/table/1/read/")))
    (is (= ["/data/db/1/schema/PUBLIC/table/1/" "/query/db/1/schema/PUBLIC/table/1/"]
           (#'perms/->v2-path "/db/1/schema/PUBLIC/table/1/query/")))
    (is (= ["/data/db/1/schema/PUBLIC/table/1/" "/query/db/1/schema/PUBLIC/table/1/"]
           (#'perms/->v2-path "/db/1/schema/PUBLIC/table/1/query/segmented/")))))

(defn- check-fn! [fn-var & [iterations]]
  (let [iterations (or iterations 5000)]
    (if-let [result ((mg/function-checker (:schema (meta fn-var)) {::mg/=>iterations iterations}) @fn-var)]
      result
      {:pass? true :iterations iterations})))

(deftest quickcheck-perm-path-classification-test
  (is (:pass? (check-fn! #'perms/classify-path))))

(deftest quickcheck-data-path-classification-test
  (is (:pass? (check-fn! #'perms/classify-data-path))))

(deftest quickcheck-->v2-path-test
  (is (:pass? (check-fn! #'perms/->v2-path))))

(deftest generate-graph-test
  (is (= {1 {2 {:data {:native :write, :schemas :all}}}}
         (#'perms/generate-graph #{2} {1 ["/db/2/"]})))

  (is (= {1 {2 {:data {:native :write}}}}
         (#'perms/generate-graph #{2} {1 ["/data/db/2/"]})))

  (is (= {1 {2 {:query {:schemas :all, :native :none}}}}
         (#'perms/generate-graph #{2} {1 ["/query/db/2/schema/"]})))

  (is (= {1 {2 {:query {:schemas {"PUBLIC" :all}}}}}
         (#'perms/generate-graph #{2} {1 ["/query/db/2/schema/PUBLIC/"]})))

  (is (= {1 {2 {:query {:schemas {"" :all}}}}}
         (#'perms/generate-graph #{2} {1 ["/query/db/2/schema//"]})))

  (is (= {1 {2 {:data {:schemas :all}}}}
         (#'perms/generate-graph #{2} {1 ["/db/2/schema/"]})))

  (is (= {1 {2 {:query {:schemas :all}, :data {:native :write}}}}
         (#'perms/generate-graph #{2} {1 ["/query/db/2/schema/" "/data/db/2/"]})))

  (is (= {1 {2 {:data {:native :write, :schemas :all}}}}
         (#'perms/generate-graph #{2} {1 ["/db/2/"]}))))
