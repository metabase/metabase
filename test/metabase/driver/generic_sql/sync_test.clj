;; (ns metabase.driver.generic-sql.sync-test
;;   (:require [expectations :refer :all]
;;             [korma.core :refer :all]
;;             [metabase.db :refer :all]
;;             (metabase.driver.generic-sql [sync :refer :all]
;;                                          [util :refer [korma-entity]])
;;             (metabase.models [field :refer [Field]]
;;                              [foreign-key :refer [ForeignKey]]
;;                              [table :refer [Table]])
;;             [metabase.test-data :refer :all]
;;             [metabase.test.util :refer [resolve-private-fns]]))


;; (resolve-private-fns metabase.driver.generic-sql.sync determine-fk-type field-avg-length field-percent-urls set-table-pks-if-needed!)

;; (def users-table
;;   (delay (sel :one Table :name "USERS")))

;; (def korma-users-table
;;   (delay (korma-entity @users-table)))

;; (def users-name-field
;;   (delay (sel :one Field :id (field->id :users :name))))

;; ;; TABLE-NAMES
;; (expect
;;     #{"CATEGORIES" "VENUES" "CHECKINS" "USERS"}
;;   (table-names @test-db))

;; ;; JDBC-COLUMNS
;; (expect
;;     #{{:type_name "INTEGER", :column_name "CATEGORY_ID"}
;;       {:type_name "DOUBLE", :column_name "LONGITUDE"}
;;       {:type_name "INTEGER", :column_name "PRICE"}
;;       {:type_name "BIGINT", :column_name "ID"}
;;       {:type_name "VARCHAR", :column_name "NAME"}
;;       {:type_name "DOUBLE", :column_name "LATITUDE"}}
;;     (jdbc-columns @test-db "VENUES"))


;; ;; ## TEST TABLE-PK-NAMES
;; ;; Pretty straightforward
;; (expect #{"ID"}
;;   (table-pk-names @test-db "VENUES"))

;; ;; ## TEST SET-TABLE-PK-IF-NEEDED!
;; (expect [:id
;;          nil
;;          :id
;;          :latitude
;;          :id]
;;   (let [table (sel :one Table :id (table->id :venues))
;;         get-special-type (fn [] (sel :one :field [Field :special_type] :id (field->id :venues :id)))]
;;     [;; Special type should be :id to begin with
;;      (get-special-type)
;;      ;; Clear out the special type
;;      (do (upd Field (field->id :venues :id) :special_type nil)
;;          (get-special-type))
;;      ;; Calling set-table-pks-if-needed! Should set the special type again
;;      (do (set-table-pks-if-needed! table)
;;          (get-special-type))
;;      ;; set-table-pks-if-needed! should *not* change the special type of fields that are marked with a different type
;;      (do (upd Field (field->id :venues :id) :special_type :latitude)
;;          (get-special-type))
;;      ;; Make sure that sync-table runs set-table-pks-if-needed!
;;      (do (upd Field (field->id :venues :id) :special_type nil)
;;          (sync-table table)
;;          (get-special-type))]))

;; ;; ## TEST TABLE-FKs

;; (expect [#{}
;;          #{{:fk-column-name "VENUE_ID", :dest-table-name "VENUES", :dest-column-name "ID"}
;;            {:fk-column-name "USER_ID", :dest-table-name "USERS", :dest-column-name "ID"}}
;;          #{}
;;          #{{:fk-column-name "CATEGORY_ID", :dest-table-name "CATEGORIES", :dest-column-name "ID"}}]
;;   (map (partial table-fks @test-db)
;;        ["CATEGORIES" "CHECKINS" "USERS" "VENUES"]))

;; ;; Check that Foreign Key relationships were created on sync as we expect

;; (expect (field->id :venues :id)
;;   (sel :one :field [ForeignKey :destination_id] :origin_id (field->id :checkins :venue_id)))

;; (expect (field->id :users :id)
;;   (sel :one :field [ForeignKey :destination_id] :origin_id (field->id :checkins :user_id)))

;; (expect (field->id :categories :id)
;;   (sel :one :field [ForeignKey :destination_id] :origin_id (field->id :venues :category_id)))

;; ;; Check that sync-table causes FKs to be set like we'd expect
;; (expect [[:fk true]
;;          [nil false]
;;          [:fk true]]
;;   (let [field-id (field->id :checkins :user_id)
;;         get-special-type-and-fk-exists? (fn []
;;                                           [(sel :one :field [Field :special_type] :id field-id)
;;                                            (exists? ForeignKey :origin_id field-id)])]
;;     [;; FK should exist to start with
;;      (get-special-type-and-fk-exists?)
;;      ;; Clear out FK / special_type
;;      (do (del ForeignKey :origin_id field-id)
;;          (upd Field field-id :special_type nil)
;;          (get-special-type-and-fk-exists?))
;;      ;; Run sync-table and they should be set again
;;      (let [table (sel :one Table :id (table->id :checkins))]
;;        (sync-table table)
;;        (get-special-type-and-fk-exists?))]))

;; ;; ## Tests for DETERMINE-FK-TYPE
;; ;; Since COUNT(category_id) > COUNT(DISTINCT(category_id)) the FK relationship should be Mt1
;; (expect :Mt1
;;   (determine-fk-type (korma-entity (sel :one Table :id (table->id :venues))) "CATEGORY_ID"))

;; ;; Since COUNT(id) == COUNT(DISTINCT(id)) the FK relationship should be 1t1
;; ;; (yes, ID isn't really a FK field, but determine-fk-type doesn't need to know that)
;; (expect :1t1
;;   (determine-fk-type (korma-entity (sel :one Table :id (table->id :venues))) "ID"))


;; ;; ## TEST FIELD-AVG-LENGTH
;; ;; Test that this works if *sql-string-length-fn* is bound as exected
;; ;; NOTE - This assumes test DB is H2
;; (expect 13
;;   (binding [*sql-string-length-fn* :LENGTH]
;;     (field-avg-length @korma-users-table @users-name-field)))


;; ;; The fallback manual count should work as well
;; (expect 13
;;   (field-avg-length @korma-users-table @users-name-field))



;; ;; ## TEST CHECK-FOR-URLS
;; (expect 0.375
;;   (with-temp-table [table {:url "VARCHAR(254)"}]
;;     (insert table
;;             (values [{:url "http://www.google.com"}   ; 1/1 *
;;                      {:url nil}                       ; 1/1 (ignored)
;;                      {:url "https://amazon.co.uk"}    ; 2/2 *
;;                      {:url "http://what.com?ok=true"} ; 3/3 *
;;                      {:url "http://missing-period"}   ; 3/4
;;                      {:url "ftp://not-http"}          ; 3/5
;;                      {:url "http//amazon.com.uk"}     ; 3/6
;;                      {:url "Not a URL"}               ; 3/7
;;                      {:url "Not-a-url"}]))            ; 3/8
;;     (field-percent-urls table {:name :url})))
