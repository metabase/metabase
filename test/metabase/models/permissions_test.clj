(ns metabase.models.permissions-test
  (:require [clojure.test :refer :all]
            [expectations :refer [expect]]
            [metabase.models
             [collection :as collection :refer [Collection]]
             [database :refer [Database]]
             [permissions :as perms :refer [Permissions]]
             [permissions-group :as group :refer [PermissionsGroup]]
             [table :refer [Table]]]
            [metabase.test
             [data :as data]
             [initialize :as initialize]]
            [metabase.test.data.users :as test-users]
            [metabase.util :as u]
            [toucan.db :as db]
            [toucan.util.test :as tt])
  (:import clojure.lang.ExceptionInfo))

;;; ----------------------------------------------- valid-object-path? -----------------------------------------------

(deftest valid-object-path-test
  (testing "valid paths"
    (doseq [path
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
             "/db/1/schema/1234/table/1/"]]
      (testing path
        (is (= true
               (perms/valid-object-path? path)))))

    ;; TODO -- we need to esacpe forward-slashes as well
    (testing "We should allow backslashes in permissions paths? (#8693)"
      (is (= true
             (perms/valid-object-path? "/db/16/schema/COMPANY-NET\\john.doe/")))))

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
             ["/"
              "/db/"
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
              "/db/1/schema/PUBLIC/TABLE/1/"]}]
      (testing reason
        (doseq [path paths]
          (testing path
            (is (= false
                   (perms/valid-object-path? path)))))))))


;;; -------------------------------------------------- object-path ---------------------------------------------------

(deftest object-path-test
  (testing "valid paths"
    (doseq [[expected args] {"/db/1/"                       [1]
                             "/db/1/schema/public/"         [1 "public"]
                             "/db/1/schema/public/table/2/" [1 "public" 2]}]
      (testing (pr-str (cons 'perms/object-path args))
        (is (= expected
               (apply perms/object-path args))))))

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
        (testing (pr-str (cons 'perms/object-path args))
          (is (thrown? Exception
                       (apply perms/object-path args))))))))


;;; ---------------------------------- Generating permissions paths for Collections ----------------------------------

(expect "/collection/1/read/" (perms/collection-read-path 1))
(expect "/collection/1/read/" (perms/collection-read-path {:id 1}))
(expect Exception             (perms/collection-read-path {}))
(expect Exception             (perms/collection-read-path nil))
(expect Exception             (perms/collection-read-path "1"))

(expect "/collection/1/" (perms/collection-readwrite-path 1))
(expect "/collection/1/" (perms/collection-readwrite-path {:id 1}))
(expect Exception        (perms/collection-readwrite-path {}))
(expect Exception        (perms/collection-readwrite-path nil))
(expect Exception        (perms/collection-readwrite-path "1"))

(expect "/collection/root/read/" (perms/collection-read-path      collection/root-collection))
(expect "/collection/root/"      (perms/collection-readwrite-path collection/root-collection))


;;; ------------------------------------------- is-permissions-for-object? -------------------------------------------

(expect (perms/is-permissions-for-object? "/"                            "/db/1/schema/PUBLIC/table/1/"))
(expect (perms/is-permissions-for-object? "/db/"                         "/db/1/schema/PUBLIC/table/1/"))
(expect (perms/is-permissions-for-object? "/db/1/"                       "/db/1/schema/PUBLIC/table/1/"))
(expect (perms/is-permissions-for-object? "/db/1/schema/"                "/db/1/schema/PUBLIC/table/1/"))
(expect (perms/is-permissions-for-object? "/db/1/schema/PUBLIC/"         "/db/1/schema/PUBLIC/table/1/"))
(expect (perms/is-permissions-for-object? "/db/1/schema/PUBLIC/table/1/" "/db/1/schema/PUBLIC/table/1/"))

(expect false (perms/is-permissions-for-object? "/db/2/"                       "/db/1/schema/PUBLIC/table/1/"))
(expect false (perms/is-permissions-for-object? "/db/2/native/"                "/db/1/schema/PUBLIC/table/1/"))
(expect false (perms/is-permissions-for-object? "/db/1/schema/public/"         "/db/1/schema/PUBLIC/table/1/")) ; different case
(expect false (perms/is-permissions-for-object? "/db/1/schema/private/"        "/db/1/schema/PUBLIC/table/1/"))
(expect false (perms/is-permissions-for-object? "/db/1/schema/PUBLIC/table/2/" "/db/1/schema/PUBLIC/table/1/"))


;;; --------------------------------------- is-partial-permissions-for-object? ---------------------------------------

(expect (perms/is-partial-permissions-for-object? "/"                                    "/db/1/"))
(expect (perms/is-partial-permissions-for-object? "/db/"                                 "/db/1/"))
(expect (perms/is-partial-permissions-for-object? "/db/1/"                               "/db/1/"))
(expect (perms/is-partial-permissions-for-object? "/db/1/schema/"                        "/db/1/"))
(expect (perms/is-partial-permissions-for-object? "/db/1/schema/PUBLIC/"                 "/db/1/"))
(expect (perms/is-partial-permissions-for-object? "/db/1/schema/PUBLIC/table/"           "/db/1/"))
(expect (perms/is-partial-permissions-for-object? "/db/1/schema/PUBLIC/table/1/"         "/db/1/"))
(expect (perms/is-partial-permissions-for-object? "/db/1/schema/PUBLIC/table/1/field/"   "/db/1/"))
(expect (perms/is-partial-permissions-for-object? "/db/1/schema/PUBLIC/table/1/field/2/" "/db/1/"))

(expect false (perms/is-partial-permissions-for-object? "/db/2/"             "/db/1/"))
(expect false (perms/is-partial-permissions-for-object? "/db/2/native/"      "/db/1/"))


;;; ---------------------------------------------- is-permissions-set? -----------------------------------------------

(deftest is-permissions-set-test
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
      (testing (pr-str (list 'perms/is-permissions-set? perms-set))
        (is (= true
               (perms/is-permissions-set? perms-set))))))

  (testing "invalid permissions sets"
    (doseq [[group sets] {"things that aren't sets"
                          [nil {} [] true false "" 1234 :wow]

                          "things that contain invalid paths"
                          [#{"/" "/toucans/"}
                           #{"/db/1/" "//"}
                           #{"/db/1/" "/db/1/table/2/"}
                           #{"/db/1/native/schema/"}
                           #{"/db/1/schema/public/" "/kanye/"}
                           #{"/db/1/schema/public/table/1/" "/ocean/"}]}]
      (testing group
        (doseq [perms-set sets]
          (testing (pr-str (list 'perms/is-permissions-set? perms-set))
            (is (= false
                   (perms/is-permissions-set? perms-set)))))))))


;;; ------------------------------------------- set-has-full-permissions? --------------------------------------------

(expect (perms/set-has-full-permissions? #{"/"}
          "/db/1/schema/public/table/2/"))

(expect (perms/set-has-full-permissions? #{"/db/1/" "/db/3/"}
                                         "/db/1/schema/public/table/2/"))

(expect (perms/set-has-full-permissions? #{"/db/1/" "/db/3/"}
                                         "/db/1/schema/public/table/2/"))

(expect (perms/set-has-full-permissions? #{"/db/1/schema/public/" "/db/3/schema//"}
                                         "/db/1/schema/public/table/2/"))

(expect (perms/set-has-full-permissions? #{"/db/1/schema/public/table/2/" "/db/3/schema//table/4/"}
                                         "/db/1/schema/public/table/2/"))

(expect (perms/set-has-full-permissions? #{"/db/1/native/"}
                                         "/db/1/native/"))

(expect false (perms/set-has-full-permissions? #{}
                                               "/db/1/schema/public/table/2/"))

(expect false (perms/set-has-full-permissions? #{"/db/1/native/"}
                                               "/db/1/"))

(expect false (perms/set-has-full-permissions? #{"/db/1/schema/public/"}
                                               "/db/1/schema/"))

(expect false (perms/set-has-full-permissions? #{"/db/1/schema/public/table/1/"}
                                               "/db/1/schema/public/"))

(expect false (perms/set-has-full-permissions? #{"/db/2/"}
                                               "/db/1/schema/public/table/2/"))

(expect false (perms/set-has-full-permissions? #{"/db/2/" "/db/3/"}
                                               "/db/1/schema/public/table/2/"))

(expect false (perms/set-has-full-permissions? #{"/db/2/schema/public/" "/db/3/schema/public/"}
                                               "/db/1/schema/public/table/2/"))


;;; ------------------------------------------ set-has-partial-permissions? ------------------------------------------

(expect (perms/set-has-partial-permissions? #{"/"}
                                            "/db/1/schema/public/table/2/"))

(expect (perms/set-has-partial-permissions? #{"/db/1/" "/db/3/"}
                                            "/db/1/schema/public/table/2/"))

(expect (perms/set-has-partial-permissions? #{"/db/1/" "/db/3/"}
                                            "/db/1/schema/public/table/2/"))

(expect (perms/set-has-partial-permissions? #{"/db/1/schema/public/" "/db/3/schema//"}
                                            "/db/1/schema/public/table/2/"))

(expect (perms/set-has-partial-permissions? #{"/db/1/schema/public/table/2/" "/db/3/schema//table/4/"}
                                            "/db/1/schema/public/table/2/"))

(expect (perms/set-has-partial-permissions? #{"/db/1/schema/public/"}
                                            "/db/1/"))

(expect (perms/set-has-partial-permissions? #{"/db/1/schema/"}
                                            "/db/1/"))

(expect (perms/set-has-partial-permissions? #{"/db/1/schema/public/"}
                                            "/db/1/"))

(expect (perms/set-has-partial-permissions? #{"/db/1/schema/public/table/1/"}
                                            "/db/1/"))

(expect (perms/set-has-partial-permissions? #{"/db/1/schema/public/"}
                                            "/db/1/schema/"))

(expect (perms/set-has-partial-permissions? #{"/db/1/schema/public/table/1/"}
                                            "/db/1/schema/"))

(expect (perms/set-has-partial-permissions? #{"/db/1/schema/public/table/1/"}
                                            "/db/1/schema/public/"))

(expect (perms/set-has-partial-permissions? #{"/db/1/schema/public/table/2/" "/db/3/schema//table/4/"}
                                            "/db/1/"))

(expect false (perms/set-has-partial-permissions? #{}
                                                  "/db/1/schema/public/table/2/"))

(expect false (perms/set-has-partial-permissions? #{"/db/1/schema/"}
                                                  "/db/1/native/"))

(expect false (perms/set-has-partial-permissions? #{"/db/1/native/"}
                                                  "/db/1/schema/"))

(expect false (perms/set-has-partial-permissions? #{"/db/2/"}
                                                  "/db/1/schema/public/table/2/"))

(expect false (perms/set-has-partial-permissions? #{"/db/2/" "/db/3/"}
                                                  "/db/1/schema/public/table/2/"))

(expect false (perms/set-has-partial-permissions? #{"/db/2/schema/public/" "/db/3/schema/public/"}
                                                  "/db/1/schema/public/table/2/"))


;;; --------------------------------------- set-has-full-permissions-for-set? ----------------------------------------

(expect (perms/set-has-full-permissions-for-set? #{"/"}
                                                 #{"/db/1/schema/public/table/2/" "/db/3/schema//table/4/"}))

(expect (perms/set-has-full-permissions-for-set? #{"/db/1/" "/db/3/"}
                                                 #{"/db/1/schema/public/table/2/" "/db/3/schema//table/4/"}))

(expect (perms/set-has-full-permissions-for-set? #{"/db/1/" "/db/3/"}
                                                 #{"/db/1/schema/public/table/2/" "/db/3/schema//table/4/"}))

(expect (perms/set-has-full-permissions-for-set? #{"/db/1/schema/public/" "/db/3/schema//"}
                                                 #{"/db/1/schema/public/table/2/" "/db/3/schema//table/4/"}))

(expect (perms/set-has-full-permissions-for-set? #{"/db/1/schema/public/table/2/" "/db/3/schema//table/4/"}
                                                 #{"/db/1/schema/public/table/2/" "/db/3/schema//table/4/"}))

(expect false (perms/set-has-full-permissions-for-set? #{}
                                                       #{"/db/1/schema/public/table/2/" "/db/3/schema//table/4/"}))

(expect false (perms/set-has-full-permissions-for-set? #{"/db/2/"}
                                                       #{"/db/1/schema/public/table/2/" "/db/3/schema//table/4/"}))

(expect false (perms/set-has-full-permissions-for-set? #{"/db/1/" "/db/2/"}
                                                       #{"/db/1/schema/public/table/2/" "/db/3/schema//table/4/"}))

(expect false (perms/set-has-full-permissions-for-set? #{"/db/1/schema/public/" "/db/3/schema/public/"}
                                                       #{"/db/1/schema/public/table/2/" "/db/3/schema//table/4/"}))

(expect false (perms/set-has-full-permissions-for-set? #{"/db/1/schema/public/table/2/" "/db/3/schema//table/5/"}
                                                       #{"/db/1/schema/public/table/2/" "/db/3/schema//table/4/"}))

;; If either set is invalid, it should throw an exception

(expect ExceptionInfo (perms/set-has-full-permissions-for-set? #{"/" "/toucans/"}
                        #{"/db/1/"}))

(expect ExceptionInfo (perms/set-has-full-permissions-for-set? #{"/db/1/" "//"}
                        #{"/db/1/"}))

(expect ExceptionInfo (perms/set-has-full-permissions-for-set? #{"/db/1/" "/db/1/table/2/"}
                        #{"/db/1/"}))

(expect ExceptionInfo (perms/set-has-full-permissions-for-set? #{"/db/1/"}
                        #{"/db/1/native/schema/"}))

(expect ExceptionInfo (perms/set-has-full-permissions-for-set? #{"/db/1/"}
                        #{"/db/1/schema/public/" "/kanye/"}))

(expect ExceptionInfo (perms/set-has-full-permissions-for-set? #{"/db/1/"}
                        #{"/db/1/schema/public/table/1/" "/ocean/"}))


;;; -------------------------------------- set-has-partial-permissions-for-set? --------------------------------------

(expect (perms/set-has-partial-permissions-for-set? #{"/"}
                                                    #{"/db/1/schema/public/table/2/" "/db/2/"}))

(expect (perms/set-has-partial-permissions-for-set? #{"/db/1/schema/public/table/2/" "/db/3/schema/public/"}
                                                    #{"/db/1/" "/db/3/"}))

(expect (perms/set-has-partial-permissions-for-set? #{"/db/1/schema/public/table/2/" "/db/3/"}
                                                    #{"/db/1/"}))

(expect (perms/set-has-partial-permissions-for-set? #{"/db/1/schema/public/" "/db/3/schema//"}
                                                    #{"/db/1/" "/db/3/"}))

(expect (perms/set-has-partial-permissions-for-set? #{"/db/1/schema/public/table/2/" "/db/3/schema//table/4/"}
                                                    #{"/db/1/"}))

(expect (perms/set-has-partial-permissions-for-set? #{"/db/1/schema/public/"}
                                                    #{"/db/1/"}))

(expect (perms/set-has-partial-permissions-for-set? #{"/db/1/schema/"}
                                                    #{"/db/1/"}))

(expect (perms/set-has-partial-permissions-for-set? #{"/db/1/schema/public/"}
                                                    #{"/db/1/"}))

(expect (perms/set-has-partial-permissions-for-set? #{"/db/1/schema/public/"}
                                                    #{"/db/1/" "/db/1/schema/"}))

(expect (perms/set-has-partial-permissions-for-set? #{"/db/1/schema/public/"}
                                                    #{"/db/1/" "/db/1/schema/public/"}))

(expect (perms/set-has-partial-permissions-for-set? #{"/db/1/schema/public/table/1/"}
                                                    #{"/db/1/" "/db/1/schema/public/table/1/"}))

(expect (perms/set-has-partial-permissions-for-set? #{"/db/1/native/"}
                                                    #{"/db/1/native/"}))

(expect (perms/set-has-partial-permissions-for-set? #{"/db/1/schema/public/"}
                                                    #{"/db/1/schema/"}))

(expect (perms/set-has-partial-permissions-for-set? #{"/db/1/schema/public/table/1/"}
                                                    #{"/db/1/schema/"}))

(expect (perms/set-has-partial-permissions-for-set? #{"/db/1/schema/public/table/1/"}
                                                    #{"/db/1/schema/public/"}))

(expect (perms/set-has-partial-permissions-for-set? #{"/db/1/schema/public/table/2/" "/db/3/schema//table/4/"}
                                                    #{"/db/1/"}))

(expect false (perms/set-has-partial-permissions-for-set? #{}
                                                          #{"/db/1/schema/public/table/2/"}))

(expect false (perms/set-has-partial-permissions-for-set? #{"/db/1/schema/"}
                                                          #{"/db/1/native/"}))

(expect false (perms/set-has-partial-permissions-for-set? #{"/db/1/native/"}
                                                          #{"/db/1/schema/"}))

(expect false (perms/set-has-partial-permissions-for-set? #{"/db/2/"}
                                                          #{"/db/1/schema/public/table/2/"}))

(expect false (perms/set-has-partial-permissions-for-set? #{"/db/2/" "/db/3/"}
                                                          #{"/db/1/schema/public/table/2/"}))

(expect false (perms/set-has-partial-permissions-for-set? #{"/db/2/schema/public/" "/db/3/schema/public/"}
                                                          #{"/db/1/schema/public/table/2/"}))

(expect false (perms/set-has-partial-permissions-for-set? #{"/db/1/schema/public/table/2/" "/db/3/schema/public/"}
                                                          #{"/db/1/" "/db/3/" "/db/9/"}))

(expect false (perms/set-has-partial-permissions-for-set? #{"/db/1/schema/public/table/2/" "/db/3/"}
                                                          #{"/db/1/" "/db/9/"}))

(expect false (perms/set-has-partial-permissions-for-set? #{"/db/1/schema/public/" "/db/3/schema//"}
                                                          #{"/db/1/" "/db/3/" "/db/9/"}))

(expect false (perms/set-has-partial-permissions-for-set? #{"/db/1/schema/public/table/2/" "/db/3/schema//table/4/"}
                                                          #{"/db/1/" "/db/9/"}))

(expect false (perms/set-has-partial-permissions-for-set? #{"/db/1/schema/public/"}
                                                          #{"/db/1/" "/db/9/"}))

(expect false (perms/set-has-partial-permissions-for-set? #{"/db/1/schema/"}
                                                          #{"/db/1/" "/db/9/"}))

(expect false (perms/set-has-partial-permissions-for-set? #{"/db/1/schema/public/"}
                                                          #{"/db/1/" "/db/9/"}))

(expect false (perms/set-has-partial-permissions-for-set? #{"/db/1/schema/public/"}
                                                          #{"/db/1/" "/db/1/schema/" "/db/9/"}))

(expect false (perms/set-has-partial-permissions-for-set? #{"/db/1/schema/public/"}
                                                          #{"/db/1/" "/db/1/schema/public/" "/db/9/"}))

(expect false (perms/set-has-partial-permissions-for-set? #{"/db/1/schema/public/table/1/"}
                                                          #{"/db/1/" "/db/1/schema/public/table/1/" "/db/9/"}))

(expect false (perms/set-has-partial-permissions-for-set? #{"/db/1/native/"}
                                                          #{"/db/1/native/" "/db/9/"}))

(expect false (perms/set-has-partial-permissions-for-set? #{"/db/1/schema/public/"}
                                                          #{"/db/1/schema/" "/db/9/"}))

(expect false (perms/set-has-partial-permissions-for-set? #{"/db/1/schema/public/table/1/"}
                                                          #{"/db/1/schema/" "/db/9/"}))

(expect false (perms/set-has-partial-permissions-for-set? #{"/db/1/schema/public/table/1/"}
                                                          #{"/db/1/schema/public/" "/db/9/"}))

(expect false (perms/set-has-partial-permissions-for-set? #{"/db/1/schema/public/table/2/" "/db/3/schema//table/4/"}
                                                          #{"/db/1/" "/db/9/"}))


;;; ------------------------------------ perms-objects-set-for-parent-collection -------------------------------------

(expect
  #{"/collection/1337/read/"}
  (perms/perms-objects-set-for-parent-collection {:collection_id 1337} :read))

(expect
  #{"/collection/1337/"}
  (perms/perms-objects-set-for-parent-collection {:collection_id 1337} :write))

(expect
 #{"/collection/root/read/"}
 (perms/perms-objects-set-for-parent-collection {:collection_id nil} :read))

(expect
  #{"/collection/root/"}
  (perms/perms-objects-set-for-parent-collection {:collection_id nil} :write))

;; map must have `:collection_id` key
(expect
  Exception
  (perms/perms-objects-set-for-parent-collection {} :read))

;; must be a map
(expect
  Exception
  (perms/perms-objects-set-for-parent-collection 100 :read))

(expect
  Exception
  (perms/perms-objects-set-for-parent-collection nil :read))

;; `read-or-write` must be `:read` or `:write`
(expect
  Exception
  (perms/perms-objects-set-for-parent-collection {:collection_id nil} :readwrite))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                            Permissions Graph Tests                                             |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- test-data-graph [group]
  (get-in (perms/graph) [:groups (u/get-id group) (data/id) :schemas "PUBLIC"]))

;; Test that setting partial permissions for a table retains permissions for other tables -- #3888
(expect
  [{(data/id :venues) :all}
   {(data/id :categories) :all, (data/id :venues) :all}]
  (tt/with-temp PermissionsGroup [group]
    ;; first, graph permissions only for VENUES
    (perms/grant-permissions! group (perms/object-path (data/id) "PUBLIC" (data/id :venues)))
    [(test-data-graph group)
     ;; next, grant permissions via `update-graph!` for CATEGORIES as well. Make sure permissions for VENUES are
     ;; retained (#3888)
     (do
       (perms/update-graph! [(u/get-id group) (data/id) :schemas "PUBLIC" (data/id :categories)] :all)
       (test-data-graph group))]))

;; Make sure that the graph functions work correctly for DBs with no schemas
;; See https://github.com/metabase/metabase/issues/4000
(tt/expect-with-temp [PermissionsGroup [group]
                      Database         [database]
                      Table            [table    {:db_id (u/get-id database)}]]
  {"" {(u/get-id table) :all}}
  (do
    ;; try to grant idential permissions to the table twice
    (perms/update-graph! [(u/get-id group) (u/get-id database) :schemas] {"" {(u/get-id table) :all}})
    (perms/update-graph! [(u/get-id group) (u/get-id database) :schemas] {"" {(u/get-id table) :all}})
    ;; now fetch the perms that have been granted
    (get-in (perms/graph) [:groups (u/get-id group) (u/get-id database) :schemas])))

;; The data permissions graph should never return permissions for the MetaBot, because the MetaBot can only have
;; collection permissions
(expect
  false
  ;; need to swap out the perms check function because otherwise we couldn't even insert the object we want to insert
  (with-redefs [perms/assert-valid-metabot-permissions (constantly nil)]
    (tt/with-temp* [Database    [db]
                    Permissions [perms {:group_id (u/get-id (group/metabot)), :object (perms/object-path db)}]]
      (contains? (:groups (perms/graph)) (u/get-id (group/metabot))))))

;; Make sure we can set the new broken-out read/query perms for a Table and the graph works as we'd expect
(expect
  {(data/id :venues) {:read :all}}
  (tt/with-temp PermissionsGroup [group]
    (perms/grant-permissions! group (perms/table-read-path (Table (data/id :venues))))
    (test-data-graph group)))

(expect
  {(data/id :venues) {:query :segmented}}
  (tt/with-temp PermissionsGroup [group]
    (perms/grant-permissions! group (perms/table-segmented-query-path (Table (data/id :venues))))
    (test-data-graph group)))

(expect
  {(data/id :venues) {:read  :all
                      :query :segmented}}
  (tt/with-temp PermissionsGroup [group]
    (perms/update-graph! [(u/get-id group) (data/id) :schemas]
                         {"PUBLIC"
                          {(data/id :venues)
                           {:read :all, :query :segmented}}})
    (test-data-graph group)))

;; A "/" permission grants all dataset permissions
(tt/expect-with-temp [Database [{db_id :id}]]
  {db_id {:native  :write
          :schemas :all}}
  (let [{:keys [group_id]} (db/select-one 'Permissions {:object "/"})]
    (-> (perms/graph)
        (get-in [:groups group_id])
        (select-keys [db_id]))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                 Granting/Revoking Permissions Helper Functions                                 |
;;; +----------------------------------------------------------------------------------------------------------------+

(deftest revoke-permissions-helper-function-test
  (initialize/initialize-if-needed! :test-users-personal-collections)
  (testing "Make sure if you try to use the helper function to *revoke* perms for a Personal Collection, you get an Exception"
    (is (thrown? Exception
                 (perms/revoke-collection-permissions!
                  (group/all-users)
                  (u/get-id (db/select-one Collection :personal_owner_id (test-users/user->id :lucky))))))

    (testing "(should apply to descendants as well)"
      (tt/with-temp Collection [collection {:location (collection/children-location
                                                       (collection/user->personal-collection
                                                        (test-users/user->id :lucky)))}]
        (is (thrown? Exception
                     (perms/revoke-collection-permissions! (group/all-users) collection)))))))

(deftest revoke-collection-permissions-test
  (testing "Should be able to revoke permissions for non-personal Collections"
    (tt/with-temp Collection [{collection-id :id}]
      (perms/revoke-collection-permissions! (group/all-users) collection-id)
      (testing "Collection should still exist"
        (is (some? (db/select-one Collection :id collection-id)))))))

;; Make sure if you try to use the helper function to grant read perms for a Personal Collection, you get an Exception
(expect
 Exception
 (do
   (initialize/initialize-if-needed! :test-users-personal-collections)
   (perms/grant-collection-read-permissions!
    (group/all-users)
    (u/get-id (db/select-one Collection :personal_owner_id (test-users/user->id :lucky))))))

;; (should apply to descendants as well)
(expect
  Exception
  (tt/with-temp Collection [collection {:location (collection/children-location
                                                   (collection/user->personal-collection
                                                    (test-users/user->id :lucky)))}]
    (perms/grant-collection-read-permissions!
     (group/all-users)
     collection)))

;; Make sure if you try to use the helper function to grant readwrite perms for a Personal Collection, you get an
;; Exception
(expect
  Exception
  (do
    (initialize/initialize-if-needed! :test-users-personal-collections)
    (perms/grant-collection-readwrite-permissions!
     (group/all-users)
     (u/get-id (db/select-one Collection :personal_owner_id (test-users/user->id :lucky))))))

;; (should apply to descendants as well)
(expect
  Exception
  (tt/with-temp Collection [collection {:location (collection/children-location
                                                   (collection/user->personal-collection
                                                    (test-users/user->id :lucky)))}]
    (perms/grant-collection-readwrite-permissions!
     (group/all-users)
     collection)))
