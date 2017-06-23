(ns metabase.models.permissions-test
  (:require [expectations :refer :all]
            [metabase.models
             [database :refer [Database]]
             [permissions :as perms]
             [permissions-group :refer [PermissionsGroup]]
             [table :refer [Table]]]
            [metabase.test.data :as data]
            [metabase.util :as u]
            [toucan.util.test :as tt]))

;;; ------------------------------------------------------------ valid-object-path? ------------------------------------------------------------

(expect (perms/valid-object-path? "/db/1/"))
(expect (perms/valid-object-path? "/db/1/native/"))
(expect (perms/valid-object-path? "/db/1/native/read/"))
(expect (perms/valid-object-path? "/db/1/schema/"))
(expect (perms/valid-object-path? "/db/1/schema/public/"))
(expect (perms/valid-object-path? "/db/1/schema/PUBLIC/"))
(expect (perms/valid-object-path? "/db/1/schema//"))
(expect (perms/valid-object-path? "/db/1/schema/1234/"))
(expect (perms/valid-object-path? "/db/1/schema/public/table/1/"))
(expect (perms/valid-object-path? "/db/1/schema/PUBLIC/table/1/"))
(expect (perms/valid-object-path? "/db/1/schema//table/1/"))
(expect (perms/valid-object-path? "/db/1/schema/public/table/1/"))
(expect (perms/valid-object-path? "/db/1/schema/PUBLIC/table/1/"))
(expect (perms/valid-object-path? "/db/1/schema//table/1/"))
(expect (perms/valid-object-path? "/db/1/schema/1234/table/1/"))

;; missing trailing slashes
(expect false (perms/valid-object-path? "/db/1"))
(expect false (perms/valid-object-path? "/db/1/native"))
(expect false (perms/valid-object-path? "/db/1/native/read"))
(expect false (perms/valid-object-path? "/db/1/schema"))
(expect false (perms/valid-object-path? "/db/1/schema/public"))
(expect false (perms/valid-object-path? "/db/1/schema/PUBLIC"))
(expect false (perms/valid-object-path? "/db/1/schema"))
(expect false (perms/valid-object-path? "/db/1/schema/public/db/1"))
(expect false (perms/valid-object-path? "/db/1/schema/PUBLIC/db/1"))
(expect false (perms/valid-object-path? "/db/1/schema//db/1"))
(expect false (perms/valid-object-path? "/db/1/schema/public/db/1/table/2"))
(expect false (perms/valid-object-path? "/db/1/schema/PUBLIC/db/1/table/2"))
(expect false (perms/valid-object-path? "/db/1/schema//db/1/table/2"))

;; too many slashes
(expect false (perms/valid-object-path? "/db/1//"))
(expect false (perms/valid-object-path? "/db/1/native//"))
(expect false (perms/valid-object-path? "/db/1/native/read//"))
(expect false (perms/valid-object-path? "/db/1/schema/public//"))
(expect false (perms/valid-object-path? "/db/1/schema/PUBLIC//"))
(expect false (perms/valid-object-path? "/db/1/schema///"))
(expect false (perms/valid-object-path? "/db/1/schema/public/db/1//"))
(expect false (perms/valid-object-path? "/db/1/schema/PUBLIC/db/1//"))
(expect false (perms/valid-object-path? "/db/1/schema//db/1//"))
(expect false (perms/valid-object-path? "/db/1/schema/public/db/1/table/2//"))
(expect false (perms/valid-object-path? "/db/1/schema/PUBLIC/db/1/table/2//"))
(expect false (perms/valid-object-path? "/db/1/schema//db/1/table/2//"))

;; not referencing a specific object. These might be valid permissions paths but not valid paths to object  s
(expect false (perms/valid-object-path? "/"))
(expect false (perms/valid-object-path? "/db/"))
(expect false (perms/valid-object-path? "/db/1/schema/public/db/"))
(expect false (perms/valid-object-path? "/db/1/schema/public/db/1/table/"))

;; duplicate path components
(expect false (perms/valid-object-path? "/db/db/1/"))
(expect false (perms/valid-object-path? "/db/1/native/native/"))
(expect false (perms/valid-object-path? "/db/1/native/read/read/"))
(expect false (perms/valid-object-path? "/db/1/schema/schema/public/"))
(expect false (perms/valid-object-path? "/db/1/schema/public/public/"))
(expect false (perms/valid-object-path? "/db/1/schema/public/db/1/table/table/"))
(expect false (perms/valid-object-path? "/db/1/schema/public/db/1/table/table/2/"))

;; missing beginning slash
(expect false (perms/valid-object-path? "db/1/"))
(expect false (perms/valid-object-path? "db/1/native/"))
(expect false (perms/valid-object-path? "db/1/native/read/"))
(expect false (perms/valid-object-path? "db/1/schema/public/"))
(expect false (perms/valid-object-path? "db/1/schema/PUBLIC/"))
(expect false (perms/valid-object-path? "db/1/schema//"))
(expect false (perms/valid-object-path? "db/1/schema/public/db/1/"))
(expect false (perms/valid-object-path? "db/1/schema/PUBLIC/db/1/"))
(expect false (perms/valid-object-path? "db/1/schema//db/1/"))
(expect false (perms/valid-object-path? "db/1/schema/public/db/1/table/2/"))
(expect false (perms/valid-object-path? "db/1/schema/PUBLIC/db/1/table/2/"))
(expect false (perms/valid-object-path? "db/1/schema//db/1/table/2/"))

;; non-numeric IDs
(expect false (perms/valid-object-path? "/db/toucans/"))
(expect false (perms/valid-object-path? "/db/1/schema/public/table/orders/"))

;; things that aren't even strings
(expect false (perms/valid-object-path? nil))
(expect false (perms/valid-object-path? {}))
(expect false (perms/valid-object-path? []))
(expect false (perms/valid-object-path? true))
(expect false (perms/valid-object-path? false))
(expect false (perms/valid-object-path? (keyword "/db/1/")))
(expect false (perms/valid-object-path? 1234))

;; other invalid paths
(expect false (perms/valid-object-path? "/db/1/table/"))
(expect false (perms/valid-object-path? "/db/1/table/2/"))
(expect false (perms/valid-object-path? "/db/1/native/schema/"))
(expect false (perms/valid-object-path? "/db/1/native/write/"))
(expect false (perms/valid-object-path? "/db/1/schema/native/read/"))
(expect false (perms/valid-object-path? "/rainforest/"))
(expect false (perms/valid-object-path? "/rainforest/toucans/"))
(expect false (perms/valid-object-path? ""))
(expect false (perms/valid-object-path? "//"))
(expect false (perms/valid-object-path? "/database/1/"))
(expect false (perms/valid-object-path? "/DB/1/"))
(expect false (perms/valid-object-path? "/db/1/SCHEMA/"))
(expect false (perms/valid-object-path? "/db/1/SCHEMA/PUBLIC/"))
(expect false (perms/valid-object-path? "/db/1/schema/PUBLIC/TABLE/1/"))


;;; ------------------------------------------------------------ object-path ------------------------------------------------------------

(expect "/db/1/" (perms/object-path 1))
(expect "/db/1/schema/public/" (perms/object-path 1 "public"))
(expect "/db/1/schema/public/table/2/" (perms/object-path 1 "public" 2))

;; invalid input should throw an exception
(expect clojure.lang.ArityException (perms/object-path))
(expect clojure.lang.ArityException (perms/object-path 1 "public" 2 3))

(expect AssertionError (perms/object-path nil))
(expect AssertionError (perms/object-path "sales"))
(expect AssertionError (perms/object-path :sales))
(expect AssertionError (perms/object-path true))
(expect AssertionError (perms/object-path false))
(expect AssertionError (perms/object-path {}))
(expect AssertionError (perms/object-path []))
(expect AssertionError (perms/object-path :sales))
(expect AssertionError (perms/object-path 1 true))
(expect AssertionError (perms/object-path 1 false))
(expect AssertionError (perms/object-path 1 {}))
(expect AssertionError (perms/object-path 1 []))
(expect AssertionError (perms/object-path 1 :sales))
(expect AssertionError (perms/object-path 1 "public" nil))
(expect AssertionError (perms/object-path 1 "public" "sales"))
(expect AssertionError (perms/object-path 1 "public" :sales))
(expect AssertionError (perms/object-path 1 "public" true))
(expect AssertionError (perms/object-path 1 "public" false))
(expect AssertionError (perms/object-path 1 "public"{}))
(expect AssertionError (perms/object-path 1 "public"[]))


;;; ------------------------------------------------------------ is-permissions-for-object? ------------------------------------------------------------

(expect (perms/is-permissions-for-object? "/"                            "/db/1/schema/PUBLIC/table/1/"))
(expect (perms/is-permissions-for-object? "/db/"                         "/db/1/schema/PUBLIC/table/1/"))
(expect (perms/is-permissions-for-object? "/db/1/"                       "/db/1/schema/PUBLIC/table/1/"))
(expect (perms/is-permissions-for-object? "/db/1/schema/"                "/db/1/schema/PUBLIC/table/1/"))
(expect (perms/is-permissions-for-object? "/db/1/schema/PUBLIC/"         "/db/1/schema/PUBLIC/table/1/"))
(expect (perms/is-permissions-for-object? "/db/1/schema/PUBLIC/table/1/" "/db/1/schema/PUBLIC/table/1/"))

(expect false (perms/is-permissions-for-object? "/db/2/"                       "/db/1/schema/PUBLIC/table/1/"))
(expect false (perms/is-permissions-for-object? "/db/2/native/"                "/db/1/schema/PUBLIC/table/1/"))
(expect false (perms/is-permissions-for-object? "/db/2/native/read/"           "/db/1/schema/PUBLIC/table/1/"))
(expect false (perms/is-permissions-for-object? "/db/1/schema/public/"         "/db/1/schema/PUBLIC/table/1/")) ; different case
(expect false (perms/is-permissions-for-object? "/db/1/schema/private/"        "/db/1/schema/PUBLIC/table/1/"))
(expect false (perms/is-permissions-for-object? "/db/1/schema/PUBLIC/table/2/" "/db/1/schema/PUBLIC/table/1/"))


;;; ------------------------------------------------------------ is-partial-permissions-for-object? ------------------------------------------------------------

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
(expect false (perms/is-partial-permissions-for-object? "/db/2/native/read/" "/db/1/"))


;;; ------------------------------------------------------------ is-permissions-set? ------------------------------------------------------------

(expect (perms/is-permissions-set? #{}))
(expect (perms/is-permissions-set? #{"/"}))
(expect (perms/is-permissions-set? #{"/db/1/"}))
(expect (perms/is-permissions-set? #{"/db/1/"}))
(expect (perms/is-permissions-set? #{"/db/1/schema/"}))
(expect (perms/is-permissions-set? #{"/db/1/schema/public/"}))
(expect (perms/is-permissions-set? #{"/db/1/schema/public/table/1/"}))
(expect (perms/is-permissions-set? #{"/" "/db/2/"}))
(expect (perms/is-permissions-set? #{"/db/1/" "/db/2/schema/"}))
(expect (perms/is-permissions-set? #{"/db/1/schema/" "/db/2/schema/public/"}))
(expect (perms/is-permissions-set? #{"/db/1/schema/public/" "/db/2/schema/public/table/3/"}))
(expect (perms/is-permissions-set? #{"/db/1/schema/public/table/2/" "/db/3/schema/public/table/4/"}))

;; things that aren't sets
(expect false (perms/is-permissions-set? nil))
(expect false (perms/is-permissions-set? {}))
(expect false (perms/is-permissions-set? []))
(expect false (perms/is-permissions-set? true))
(expect false (perms/is-permissions-set? false))
(expect false (perms/is-permissions-set? ""))
(expect false (perms/is-permissions-set? 1234))
(expect false (perms/is-permissions-set? :wow))

;; things that contain invalid paths
(expect false (perms/is-permissions-set? #{"/" "/toucans/"}))
(expect false (perms/is-permissions-set? #{"/db/1/" "//"}))
(expect false (perms/is-permissions-set? #{"/db/1/" "/db/1/table/2/"}))
(expect false (perms/is-permissions-set? #{"/db/1/native/schema/"}))
(expect false (perms/is-permissions-set? #{"/db/1/schema/public/" "/kanye/"}))
(expect false (perms/is-permissions-set? #{"/db/1/schema/public/table/1/" "/ocean/"}))


;;; ------------------------------------------------------------ set-has-full-permissions? ------------------------------------------------------------

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

(expect (perms/set-has-full-permissions? #{"/db/1/native/"}
                                         "/db/1/native/read/"))

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


;;; ------------------------------------------------------------ set-has-partial-permissions? ------------------------------------------------------------

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

(expect (perms/set-has-partial-permissions? #{"/db/1/native/read/"}
                                            "/db/1/"))

(expect (perms/set-has-partial-permissions? #{"/db/1/schema/"}
                                            "/db/1/"))

(expect (perms/set-has-partial-permissions? #{"/db/1/schema/public/"}
                                            "/db/1/"))

(expect (perms/set-has-partial-permissions? #{"/db/1/schema/public/table/1/"}
                                            "/db/1/"))

(expect (perms/set-has-partial-permissions? #{"/db/1/native/read/"}
                                            "/db/1/native/"))

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


;;; ------------------------------------------------------------ set-has-full-permissions-for-set? ------------------------------------------------------------

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

(expect AssertionError (perms/set-has-full-permissions-for-set? #{"/" "/toucans/"}
                                                                #{"/db/1/"}))

(expect AssertionError (perms/set-has-full-permissions-for-set? #{"/db/1/" "//"}
                                                                #{"/db/1/"}))

(expect AssertionError (perms/set-has-full-permissions-for-set? #{"/db/1/" "/db/1/table/2/"}
                                                                #{"/db/1/"}))

(expect AssertionError (perms/set-has-full-permissions-for-set? #{"/db/1/"}
                                                                #{"/db/1/native/schema/"}))

(expect AssertionError (perms/set-has-full-permissions-for-set? #{"/db/1/"}
                                                                #{"/db/1/schema/public/" "/kanye/"}))

(expect AssertionError (perms/set-has-full-permissions-for-set? #{"/db/1/"}
                                                                #{"/db/1/schema/public/table/1/" "/ocean/"}))


;;; ------------------------------------------------------------ set-has-partial-permissions-for-set? ------------------------------------------------------------

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

(expect (perms/set-has-partial-permissions-for-set? #{"/db/1/native/read/"}
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

(expect (perms/set-has-partial-permissions-for-set? #{"/db/1/native/read/"}
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

(expect false (perms/set-has-partial-permissions-for-set? #{"/db/1/native/read/"}
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

(expect false (perms/set-has-partial-permissions-for-set? #{"/db/1/native/read/"}
                                                          #{"/db/1/native/" "/db/9/"}))

(expect false (perms/set-has-partial-permissions-for-set? #{"/db/1/schema/public/"}
                                                          #{"/db/1/schema/" "/db/9/"}))

(expect false (perms/set-has-partial-permissions-for-set? #{"/db/1/schema/public/table/1/"}
                                                          #{"/db/1/schema/" "/db/9/"}))

(expect false (perms/set-has-partial-permissions-for-set? #{"/db/1/schema/public/table/1/"}
                                                          #{"/db/1/schema/public/" "/db/9/"}))

(expect false (perms/set-has-partial-permissions-for-set? #{"/db/1/schema/public/table/2/" "/db/3/schema//table/4/"}
                                                          #{"/db/1/" "/db/9/"}))


;;; +----------------------------------------------------------------------------------------------------------------------------------------------------------------+
;;; |                                                                    Permissions Graph Tests                                                                     |
;;; +----------------------------------------------------------------------------------------------------------------------------------------------------------------+

(defn- test-data-graph [group]
  (get-in (perms/graph) [:groups (u/get-id group) (data/id) :schemas "PUBLIC"]))

;; Test that setting partial permissions for a table retains permissions for other tables -- #3888
(expect
  [{(data/id :categories) :none, (data/id :checkins) :none, (data/id :users) :none, (data/id :venues) :all}
   {(data/id :categories) :all,  (data/id :checkins) :none, (data/id :users) :none, (data/id :venues) :all}]
  (tt/with-temp PermissionsGroup [group]
    ;; first, graph permissions only for VENUES
    (perms/grant-permissions! group (perms/object-path (data/id) "PUBLIC" (data/id :venues)))
    [(test-data-graph group)
     ;; next, grant permissions via `update-graph!` for CATEGORIES as well. Make sure permissions for VENUES are retained (#3888)
     (do
       (perms/update-graph! [(u/get-id group) (data/id) :schemas "PUBLIC" (data/id :categories)] :all)
       (test-data-graph group))]))

;;; Make sure that the graph functions work correctly for DBs with no schemas
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
