(ns metabase.driver.generic-sql.sync-test
  (:require [expectations :refer :all]
            [korma.core :refer :all]
            [metabase.db :refer :all]
            (metabase.driver.generic-sql [sync :refer :all]
                                         [util :refer [korma-entity]])
            (metabase.models [field :refer [Field]]
                             [table :refer [Table]])
            [metabase.test-data :refer :all]
            [metabase.test.util :refer [resolve-private-fns]]))

(resolve-private-fns metabase.driver.generic-sql.sync field-avg-length field-percent-urls)

(def users-table
  (delay (sel :one Table :name "USERS")))

(def korma-users-table
  (delay (korma-entity @users-table)))

(def users-name-field
  (delay (sel :one Field :id (field->id :users :name))))



;; ## TEST FIELD-AVG-LENGTH
;; Test that this works if *sql-string-length-fn* is bound as exected
;; NOTE - This assumes test DB is H2
(expect 13
  (binding [*sql-string-length-fn* :LENGTH]
    (field-avg-length @korma-users-table @users-name-field)))


;; The fallback manual count should work as well
(expect 13
  (field-avg-length @korma-users-table @users-name-field))



;; ## TEST CHECK-FOR-URLS
(expect 0.375
  (with-temp-table [table {:url "VARCHAR(254)"}]
    (insert table
            (values [{:url "http://www.google.com"}   ; 1/1 *
                     {:url nil}                       ; 1/1 (ignored)
                     {:url "https://amazon.co.uk"}    ; 2/2 *
                     {:url "http://what.com?ok=true"} ; 3/3 *
                     {:url "http://missing-period"}   ; 3/4
                     {:url "ftp://not-http"}          ; 3/5
                     {:url "http//amazon.com.uk"}     ; 3/6
                     {:url "Not a URL"}               ; 3/7
                     {:url "Not-a-url"}]))            ; 3/8
    (field-percent-urls table {:name :url})))
