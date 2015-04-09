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


(resolve-private-fns metabase.driver.generic-sql.sync field-avg-length field-percent-urls set-table-pks-if-needed!)

(def users-table
  (delay (sel :one Table :name "USERS")))

(def korma-users-table
  (delay (korma-entity @users-table)))

(def users-name-field
  (delay (sel :one Field :id (field->id :users :name))))


;; ## TEST TABLE-PK-NAMES
;; Pretty straightforward
(expect #{"ID"}
  (table-pk-names @test-db "VENUES"))

;; ## TEST SET-TABLE-PK-IF-NEEDED!
(expect [:id
         nil
         :id
         :latitude
         :id]
  (let [table (sel :one Table :id (table->id :venues))
        get-special-type (fn [] (sel :one :field [Field :special_type] :id (field->id :venues :id)))]
    [;; Special type should be :id to begin with
     (get-special-type)
     ;; Clear out the special type
     (do (upd Field (field->id :venues :id) :special_type nil)
         (get-special-type))
     ;; Calling set-table-pks-if-needed! Should set the special type again
     (do (set-table-pks-if-needed! table)
         (get-special-type))
     ;; set-table-pks-if-needed! should *not* change the special type of fields that are marked with a different type
     (do (upd Field (field->id :venues :id) :special_type :latitude)
         (get-special-type))
     ;; Make sure that sync-table runs set-table-pks-if-needed!
     (do (upd Field (field->id :venues :id) :special_type nil)
         (sync-table table)
         (get-special-type))]))


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
