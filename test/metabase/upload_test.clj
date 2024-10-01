(ns metabase.upload-test
  (:require
   [clj-bom.core :as bom]
   [clojure.data.csv :as csv]
   [clojure.java.io :as io]
   [clojure.java.jdbc :as jdbc]
   [clojure.set :as set]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [flatland.ordered.map :as ordered-map]
   [metabase.analytics.snowplow-test :as snowplow-test]
   [metabase.driver :as driver]
   [metabase.driver.ddl.interface :as ddl.i]
   [metabase.driver.mysql :as mysql]
   [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
   [metabase.driver.util :as driver.u]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.metadata.jvm :as lib.metadata.jvm]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.models :refer [Field]]
   [metabase.models.data-permissions :as data-perms]
   [metabase.models.interface :as mi]
   [metabase.models.permissions-group :as perms-group]
   [metabase.query-processor :as qp]
   [metabase.sync.sync-metadata.tables :as sync-tables]
   [metabase.test :as mt]
   [metabase.test.data.impl :as data.impl]
   [metabase.test.data.sql :as sql.tx]
   [metabase.upload :as upload]
   [metabase.upload.parsing :as upload-parsing]
   [metabase.upload.types :as upload-types]
   [metabase.util :as u]
   [metabase.util.malli :as mu]
   [toucan2.core :as t2])
  (:import
   (java.io ByteArrayInputStream File FileOutputStream)))

(set! *warn-on-reflection* true)

(def ^:private bool-type      ::upload-types/boolean)
(def ^:private int-type       ::upload-types/int)
(def ^:private float-type     ::upload-types/float)
(def ^:private vchar-type     ::upload-types/varchar-255)
(def ^:private date-type      ::upload-types/date)
(def ^:private datetime-type  ::upload-types/datetime)
(def ^:private offset-dt-type ::upload-types/offset-datetime)
(def ^:private text-type      ::upload-types/text)

(defn- local-infile-on? []
  (= "ON" (-> (sql-jdbc.conn/db->pooled-connection-spec (mt/db))
              (jdbc/query "show global variables like 'local_infile'")
              first
              :value)))

(defn- set-local-infile! [on?]
  (jdbc/query (sql-jdbc.conn/db->pooled-connection-spec (mt/db)) (str "set global local_infile = " (if on? 1 0))))

(defn- do-with-mysql-local-infile-on
  [thunk]
  (if (or (not= driver/*driver* :mysql)
          (local-infile-on?))
    (thunk)
    (try
      (set-local-infile! true)
      (thunk)
      (finally
        (set-local-infile! false)))))

(defn- do-with-mysql-local-infile-off
  [thunk]
  (if-not (and (= driver/*driver* :mysql)
               (local-infile-on?))
    (thunk)
    (try
      (set-local-infile! false)
      (thunk)
      (finally
        (set-local-infile! true)))))

(defn- do-with-mysql-local-infile-on-and-off
  "Helper for [[with-mysql-local-infile-on-and-off]]"
  [thunk]
  (if (not= driver/*driver* :mysql)
    (thunk)
    (do
      (testing "with local_infile on"
        (do-with-mysql-local-infile-on thunk))
      (testing "with local_infile off"
        (do-with-mysql-local-infile-off thunk)))))

(defmacro ^:private with-mysql-local-infile-on-and-off
  "Execute the body with local_infile on, and then again with local_infile off"
  [& body]
  `(do-with-mysql-local-infile-on-and-off (fn [] ~@body)))

(defmacro ^:private with-mysql-local-infile-on
  "Exectute the body with local_infile on"
  [& body]
  `(do-with-mysql-local-infile-on (fn [] ~@body)))

(defmacro ^:private with-mysql-local-infile-off
  "Exectute the body with local_infile off"
  [& body]
  `(do-with-mysql-local-infile-off (fn [] ~@body)))

(defn sync-upload-test-table!
  "Creates a table in the app db and syncs it synchronously, setting is_upload=true. Returns the table instance.
  The result is identical to if the table was synced with [[metabase.sync/sync-database!]], but faster because it skips
  syncing every table in the test database."
  [& {:keys [database table-name schema-name]}]
  (let [table-name  (ddl.i/format-name driver/*driver* table-name)
        schema-name (or (some->> schema-name (ddl.i/format-name driver/*driver*))
                        (sql.tx/session-schema driver/*driver*))
        table       (sync-tables/create-or-reactivate-table! database {:name table-name :schema schema-name})]
    (t2/update! :model/Table (:id table) {:is_upload true})
    (binding [upload/*auxiliary-sync-steps* :synchronous]
      (#'upload/scan-and-sync-table! database table))
    (t2/select-one :model/Table (:id table))))

(defn- tmp-file [prefix extension]
  (doto (File/createTempFile prefix extension)
    (.deleteOnExit)))

(defn csv-file-with
  "Create a temp csv file with the given content and return the file"
  (^File [rows]
   (csv-file-with rows "test"))
  (^File [rows file-prefix]
   (csv-file-with rows file-prefix io/writer))
  (^File [rows file-prefix writer-fn]
   (let [contents (str/join "\n" rows)
         csv-file (tmp-file file-prefix ".csv")]
     (with-open [^java.io.Writer w (writer-fn csv-file)]
       (.write w contents))
     csv-file)))

(defn- detect-schema-with-csv-rows
  "Calls detect-schema on rows from a CSV file. `rows` is a vector of strings"
  [rows]
  (with-open [reader (io/reader (csv-file-with rows))]
    (let [[header & rows] (csv/read-csv reader)
          column-names (#'upload/derive-column-names nil header)]
      (#'upload/detect-schema (upload-parsing/get-settings) column-names rows))))

(deftest ^:parallel detect-schema-test
  (mt/test-drivers (mt/normal-drivers-with-feature :uploads)
    (testing "Well-formed CSV file"
      (is (=? {:name             vchar-type
               :age              int-type
               :favorite_pokemon vchar-type}
              (detect-schema-with-csv-rows
               ["Name, Age, Favorite Pokémon"
                "Tim, 12, Haunter"
                "Ryan, 97, Paras"]))))
    (testing "CSV missing data"
      (is (=? {:name       vchar-type
               :height     int-type
               :birth_year float-type}
              (detect-schema-with-csv-rows
               ["Name, Height, Birth Year"
                "Luke Skywalker, 172, -19"
                "Darth Vader, 202, -41.9"
                "Watto, 137"          ; missing column
                "Sebulba, 112,"])))) ; comma, but blank column
    (testing "Type coalescing"
      (is (=? {:name       vchar-type
               :height     float-type
               :birth_year vchar-type}
              (detect-schema-with-csv-rows
               ["Name, Height, Birth Year"
                "Rey Skywalker, 170, 15"
                "Darth Vader, 202.0, 41.9BBY"]))))
    (testing "Boolean coalescing"
      (is (=? {:name                    vchar-type
               :is_jedi_                bool-type
               :is_jedi__int_and_bools_ vchar-type
               :is_jedi__vc_            vchar-type}
              (detect-schema-with-csv-rows
               ["         Name, Is Jedi?, Is Jedi (int and bools), Is Jedi (VC)"
                "Rey Skywalker,      yes,                    true,            t"
                "  Darth Vader,      YES,                    TRUE,            Y"
                "        Grogu,        1,                    9001,    probably?"
                "     Han Solo,       no,                   FaLsE,            0"]))))
    (testing "Boolean and integers together"
      (is (=? {:vchar       vchar-type
               :bool        bool-type
               :bool_or_int bool-type
               :int         int-type}
              (detect-schema-with-csv-rows
               ["vchar,bool,bool-or-int,int"
                " true,true,          1,  1"
                "    1,   1,          0,  0"
                "    2,   0,          0,  0"
                "   no,  no,          1,  2"]))))
    (testing "Order is ensured"
      (let [header "a,b,c,d,e,f,g,h,i,j,k,l,m,n,o,p,q,r,s,t,u,v,w,x,y,z,zz,yy,xx,ww,vv,uu,tt,ss,rr,qq,pp,oo,nn,mm,ll,kk,jj,ii,hh,gg,ff,ee,dd,cc,bb,aa"]
        (is (= (map keyword (str/split header #","))
               (keys
                (detect-schema-with-csv-rows
                 [header
                  "Luke,ah'm,yer,da,,,missing,columns,should,not,matter"]))))))
    (testing "Empty contents (with header) are okay"
      (is (=? {:name     text-type
               :is_jedi_ text-type}
              (detect-schema-with-csv-rows
               ["Name, Is Jedi?"]))))
    (testing "Completely empty contents are okay"
      (is (=? {}
              (detect-schema-with-csv-rows
               [""]))))
    (testing "CSV missing data in the top row"
      (is (=? {:name       vchar-type
               :height     int-type
               :birth_year float-type}
              (detect-schema-with-csv-rows
               ["Name, Height, Birth Year"
                ;; missing column
                "Watto, 137"
                "Luke Skywalker, 172, -19"
                "Darth Vader, 202, -41.9"
                ;; comma, but blank column
                "Sebulba, 112,"]))))))

(deftest ^:parallel detect-schema-dates-test
  (mt/test-drivers (mt/normal-drivers-with-feature :uploads)
    (testing "Dates"
      (is (=? {:date         date-type
               :not_date     vchar-type
               :datetime     datetime-type
               :not_datetime vchar-type}
              (detect-schema-with-csv-rows
               ["Date      ,Not Date  ,Datetime           ,Not datetime       "
                "2022-01-01,2023-02-28,2022-01-01T00:00:00,2023-02-28T00:00:00"
                "2022-02-01,2023-02-29,2022-01-01T00:00:00,2023-02-29T00:00:00"]))))))

(deftest ^:parallel detect-schema-offset-datetimes-test
  (mt/test-drivers (mt/normal-drivers-with-feature :uploads)
    (let [good-versus-bad-rows ["2022-01-01T00:00:00-01:00,2023-02-29T00:00:00-01:00"
                                "2022-01-01T00:00:00-0100,2023-02-29T00:00:00-0100"
                                "2022-01-01T00:00:00Z,2023-02-29T00:00:00-01:00"]]
      (testing "Dates"
        (doseq [additional-row good-versus-bad-rows]
          (is (=? {:offset_datetime offset-dt-type
                   :not_datetime   vchar-type}
                  (detect-schema-with-csv-rows
                   (conj ["Offset Datetime,Not Datetime"
                          "2022-01-01T00:00:00-01:00,2023-02-28T00:00:00-01:00"]
                         additional-row)))))))))

(deftest ^:parallel unique-table-name-test
  (mt/test-drivers (mt/normal-drivers-with-feature :uploads)
    (testing "File name is slugified"
      (is (=? #"my_file_name_\d+" (@#'upload/unique-table-name driver/*driver* "my file name"))))
    (testing "semicolons are removed"
      (is (nil? (re-find #";" (@#'upload/unique-table-name driver/*driver* "some text; -- DROP TABLE.csv")))))
    (testing "No collisions"
      (let [n 50
            names (repeatedly n (partial #'upload/unique-table-name driver/*driver* ""))]
        (is (= 50 (count (distinct names))))))))

(defn last-audit-event [topic]
  (t2/select-one [:model/AuditLog :topic :user_id :model :model_id :details]
                 :topic topic
                 {:order-by [[:id :desc]]}))

(defn create-from-csv-and-sync-with-defaults!
  "Creates a table from a CSV file and syncs using [[upload/create-from-csv-and-sync!]]. Returns the synced Table."
  [& {:keys [table-name file auxiliary-sync-steps]
      :or {table-name (mt/random-name)
           file (csv-file-with
                 ["id, name"
                  "1, Luke Skywalker"
                  "2, Darth Vader"]
                 "example csv file")
           ;; usually we don't care about analyze or field values for tests, so skip by default for speed
           auxiliary-sync-steps :never}}]
  (let [schema (sql.tx/session-schema driver/*driver*)
        db     (t2/select-one :model/Database (mt/id))]
    (binding [upload/*auxiliary-sync-steps* auxiliary-sync-steps]
      (:table (#'upload/create-from-csv-and-sync! {:db         db
                                                   :file       file
                                                   :schema     schema
                                                   :table-name table-name})))))

(mu/defn do-with-uploaded-example-csv!
  "Upload a small CSV file to the given collection ID. `grant-permission?` controls whether the current user is granted
  data permissions to the database.

  Calls

    (f model)

  with the model created for the uploaded CSV. Cleans up created model and table when finished."
  [{:keys [table-prefix collection-id grant-permission? uploads-enabled user-id db-id auxiliary-sync-steps csv-file-prefix file]
    :or {collection-id            nil ;; root collection
         grant-permission?        true
         uploads-enabled          true
         user-id                  (mt/user->id :rasta)
         db-id                    (mt/id)
         ;; usually we don't care about analyze or field values for tests, so skip by default for speed
         auxiliary-sync-steps     :never
         csv-file-prefix          "example csv file"}
    :as options}
   f :- [:=> [:cat [:map [:id ::lib.schema.id/card]]] :any]]
  {:pre [(keyword? driver/*driver*)]}
  (mt/with-discard-model-updates! [:model/Database]
    (t2/update! :model/Database :uploads_enabled true {:uploads_enabled false})
    (t2/update! :model/Database db-id {:uploads_enabled uploads-enabled})
    (mt/with-current-user user-id
      (let [file        (or file (csv-file-with
                                  ["id, name"
                                   "1, Luke Skywalker"
                                   "2, Darth Vader"]
                                  csv-file-prefix))
            db          (t2/select-one :model/Database db-id)
            schema-name (if (contains? options :schema-name)
                          (ddl.i/format-name driver/*driver* (:schema-name options))
                          (sql.tx/session-schema driver/*driver*))
            group-id    (u/the-id (perms-group/all-users))
            grant?      (and db
                             (not (mi/can-read? db))
                             grant-permission?)]
        (mt/with-restored-data-perms-for-group! group-id
          (when grant?
            (data-perms/set-database-permission! group-id db-id :perms/data-access :unrestricted)
            (data-perms/set-database-permission! group-id db-id :perms/create-queries :query-builder))
          (binding [upload/*auxiliary-sync-steps* auxiliary-sync-steps]
            (let [uploaded-model (upload/create-csv-upload! {:collection-id collection-id
                                                             :filename      csv-file-prefix
                                                             :file          file
                                                             :db-id         db-id
                                                             :schema-name   schema-name
                                                             :table-prefix  table-prefix})]
              (try
                (f uploaded-model)
                (finally
                  (let [model-id (u/the-id uploaded-model)
                        table-id (u/the-id (:table_id uploaded-model))
                        table    (t2/select-one :model/Table :id table-id)]
                    (t2/delete! :model/Card :id model-id)
                    (t2/delete! :model/Table :id table-id)
                    (driver/drop-table! driver/*driver*
                                        (u/the-id (:db_id table))
                                        (#'upload/table-identifier table))))))))))))

(defn do-with-uploads-enabled!
  "Set uploads_enabled to true the current database, and as an admin user, run the thunk"
  [thunk]
  (mt/with-discard-model-updates! [:model/Database]
    (t2/update! :model/Database (mt/id) {:uploads_enabled     true
                                         :uploads_schema_name (sql.tx/session-schema driver/*driver*)})
    (mt/with-current-user (mt/user->id :crowberto)
      (thunk))))

(defmacro with-uploads-enabled! [& body]
  `(do-with-uploads-enabled! (fn [] ~@body)))

(defn do-with-uploads-disabled!
  "Set uploads_enabled to false the current database, and as an admin user, run the thunk"
  [thunk]
  (mt/with-discard-model-updates! [:model/Database]
    (t2/update! :model/Database :uploads_enabled true {:uploads_enabled false})
    (mt/with-current-user (mt/user->id :crowberto)
      (thunk))))

(defmacro with-uploads-disabled! [& body]
  `(do-with-uploads-disabled! (fn [] ~@body)))

(defn do-with-upload-table! [table thunk]
  (try (thunk table)
       (finally
         ;; I'm experimenting with disabling this, it seems preposterous that this would actually cause test flakes --
         ;; Cam
         (when true #_(not= driver/*driver* :redshift) ; redshift tests flake when tables are dropped
               (driver/drop-table! driver/*driver*
                                   (:db_id table)
                                   (#'upload/table-identifier table))))))

(defn- table->card [table]
  (t2/select-one :model/Card :table_id (:id table)))

(defn- card->table [card]
  (t2/select-one :model/Table (:table_id card)))

(defmacro with-upload-table!
  "Execute `body` with a table created by evaluating the expression `create-table-expr`. `create-table-expr` must
  evaluate to a toucan Table instance. The instance is bound to `table-sym` in `body`. The table is cleaned up from
  both the test and app DB after the body executes.

    (with-upload-table [table (create-upload-table! ...)]
      ...)"
  {:style/indent :defn}
  [[table-binding create-table-expr] & body]
  `(with-uploads-enabled!
     (mt/with-model-cleanup [:model/Table]
       (do-with-upload-table! ~create-table-expr (fn [~table-binding] ~@body)))))

(declare create-upload-table!)

(deftest with-upload-table!-and-do-with-uploaded-example-csv!-test
  (testing "with-upload-table! and do-with-uploaded-example-csv! should ACTUALLY clean up after themselves"
    (mt/test-drivers (mt/normal-drivers-with-feature :uploads :schemas)
      (letfn [(table-names []
                (into #{} (map :name) (:tables (driver/describe-database driver/*driver* (mt/db)))))]
        (let [original-table-names (table-names)]
          (with-upload-table! [table (create-upload-table!)]
            (do-with-uploaded-example-csv!
             {:grant-permission? false
              :schema-name       (:schema table)
              :table-prefix      "uploaded_magic_"}
             (constantly nil)))
          (is (= original-table-names
                 (table-names))))))))

(deftest create-from-csv-display-name-test
  (mt/test-drivers (mt/normal-drivers-with-feature :uploads)
    (with-mysql-local-infile-on-and-off
      (let [test-names-match (fn [table expected]
                               (is (= expected
                                      (:display_name table)
                                      (:name (table->card table)))))]
        (testing "The table's display name and model's name is humanized from the CSV file name"
          (let [csv-file-prefix "some_FILE-prefix"]
            (do-with-uploaded-example-csv!
             {:csv-file-prefix csv-file-prefix}
             (fn [model]
               (with-upload-table! [table (card->table model)]
                 (test-names-match table "Some File Prefix"))))))
        (testing "Unicode characters are preserved in the display name, even when the table name is slugified"
          (let [csv-file-prefix "出色的"]
            (with-redefs [upload/strictly-monotonic-now (constantly #t "2024-06-28T00:00:00")]
              (do-with-uploaded-example-csv!
               {:csv-file-prefix csv-file-prefix}
               (fn [model]
                 (with-upload-table! [table (card->table model)]
                   (test-names-match table "出色的")
                   (is (= (ddl.i/format-name driver/*driver* "%e5%87%ba%e8%89%b2%e7%9a%84_20240628000000")
                          (:name table)))))))))
        (testing "The names should be truncated to the right size"
         ;; we can assume app DBs use UTF-8 encoding (metabase#11753)
          (let [max-bytes 50]
            (with-redefs [; redef this because the UNIX filename limit is 255 bytes, so we can't test it in CI
                          upload/max-bytes (constantly max-bytes)]
              (doseq [^String c ["a" "出"]]
                (let [long-csv-file-prefix (apply str (repeat (inc max-bytes) c))
                      char-size            (count (.getBytes ^String c "UTF-8"))]
                  (do-with-uploaded-example-csv!
                   {:csv-file-prefix long-csv-file-prefix}
                   (fn [model]
                     (with-upload-table! [table (card->table model)]
                       (testing "The card name should be truncated to max bytes with UTF-8 encoding"
                         (is (= (str/capitalize (apply str (repeat (quot max-bytes char-size) c)))
                                (:name (table->card table)))))
                       (testing "The display name should be truncated to the max bytes with UTF-8 encoding"
                         (is (= (str/capitalize (apply str (repeat (quot max-bytes char-size) c)))
                                (:display_name table))))))))))))))))

(deftest create-from-csv-table-name-test
  (testing "Can upload two files with the same name"
    (mt/test-drivers (mt/normal-drivers-with-feature :uploads)
      (let [csv-file-prefix "some file prefix"]
        (do-with-uploaded-example-csv!
         {:csv-file-prefix csv-file-prefix}
         (fn [model-1]
           (do-with-uploaded-example-csv!
            {:csv-file-prefix csv-file-prefix}
            (fn [model-2]
              (with-upload-table! [table-1 (card->table model-1)]
                (with-upload-table! [table-2 (card->table model-2)]
                  (mt/with-current-user (mt/user->id :crowberto)
                    (testing "both tables have the same display name"
                      (is (= "Some File Prefix"
                             (:display_name table-1)
                             (:display_name table-2))
                          (testing "tables are different between the two uploads"
                            (is (some? (:id table-1)))
                            (is (some? (:id table-2)))
                            (is (not= (:id table-1)
                                      (:id table-2)))))))))))))))))

(defn- query [db-id source-table]
  (qp/process-query {:database db-id
                     :type     :query
                     :query    {:source-table source-table}}))

(defn- query-table [table]
  (query (:db_id table) (:id table)))

(defn- column-display-names-for-table [table]
  (->> (query-table table)
       mt/cols
       (map :display_name)))

(defn- column-names-for-table [table]
  (->> (query-table table)
       mt/cols
       (map (comp u/lower-case-en :name))))

(defn- rows-for-table
  [table]
  (mt/rows (query-table table)))

(defn- rows-for-model [db-id model-id]
  (mt/rows (query db-id (str "card__" model-id))))

(def ^:private example-files
  {:comma      ["id    ,nulls,string ,bool ,number       ,date      ,datetime"
                "2\t   ,,          a ,true ,1.1\t        ,2022-01-01,2022-01-01T00:00:00"
                "\" 3\",,           b,false,\"$ 1,000.1\",2022-02-01,2022-02-01T00:00:00"]

   :semi-colon ["id    ;nulls;string ;bool ;number       ;date      ;datetime"
                "2\t   ;;          a ;true ;1.1\t        ;2022-01-01;2022-01-01T00:00:00"
                "\" 3\";;           b;false;\"$ 1,000.1\";2022-02-01;2022-02-01T00:00:00"]
   :tab        ["id    \tnulls\tstring \tbool \tnumber       \tdate      \tdatetime"
                "2   \t\t          a \ttrue \t1.1        \t2022-01-01\t2022-01-01T00:00:00"
                "\" 3\"\t\t           b\tfalse\t\"$ 1,000.1\"\t2022-02-01\t2022-02-01T00:00:00"]
   :pipe       ["id    |nulls|string |bool |number       |date      |datetime"
                "2\t   ||          a |true |1.1\t        |2022-01-01|2022-01-01T00:00:00"
                "\" 3\"||           b|false|\"$ 1,000.1\"|2022-02-01|2022-02-01T00:00:00"]})

(defn- auto-pk-column? []
  (#'upload/auto-pk-column? driver/*driver* (mt/db)))

(defn- columns-with-auto-pk [columns]
  (cond-> columns
    (auto-pk-column?)
    (#'upload/columns-with-auto-pk)))

(defn- header-with-auto-pk [header]
  (cond->> header
    (auto-pk-column?)
    (cons @#'upload/auto-pk-column-name)))

(defn- rows-with-auto-pk [rows]
  (cond->> rows
    (auto-pk-column?)
    (map-indexed (fn [i row] (cons (inc i) row)))))

(defn- column-position [table column-name]
  (t2/select-one-fn :database_position Field :%lower.name (u/lower-case-en column-name) :table_id (:id table)))

(deftest create-from-csv-test
  (doseq [[separator lines] example-files]
    (testing (format "Upload a CSV file with %s separators." separator)
      (mt/test-drivers (mt/normal-drivers-with-feature :uploads)
        (with-mysql-local-infile-on-and-off
          (with-upload-table!
            [table (create-from-csv-and-sync-with-defaults!
                    :file (csv-file-with lines)
                    :auxiliary-sync-steps :synchronous)]
            (testing "Table and Fields exist after sync"
              (is (=? (cond->> [["id" {:semantic_type :type/PK
                                       :base_type     :type/BigInteger}]
                                ["nulls" {:base_type :type/Text}]
                                ["string" {:base_type :type/Text}]
                                ["bool" {:base_type :type/Boolean}]
                                ["number" {:base_type :type/Float}]
                                ["date" {:base_type :type/Date}]
                                ["datetime" {:base_type :type/DateTime}]]
                        (auto-pk-column?)
                        (cons ["_mb_row_id" {:semantic_type     :type/PK
                                             :base_type         :type/BigInteger}]))
                      (->> (t2/select :model/Field :table_id (:id table))
                           (sort-by :database_position)
                           (map (juxt (comp u/lower-case-en :name) identity))))))
            (testing "Check the data was uploaded into the table"
              (is (= 2
                     (count (rows-for-table table)))))))))))

(deftest create-from-csv-display-name-encodings-test
  (mt/test-drivers (mt/normal-drivers-with-feature :uploads)
    (with-mysql-local-infile-on-and-off
      (doseq [filename ["csv/iso-8859-1.csv"
                        "csv/utf-8.csv"
                        "csv/utf-16.csv"]]
        (testing (str "Filename: " filename "\n")
          (with-upload-table!
            [table (create-from-csv-and-sync-with-defaults!
                    :file (io/file (io/resource filename))
                    :auxiliary-sync-steps :synchronous)]
            (testing "Headers are displayed correctly"
              (is (= (header-with-auto-pk ["Dirección" "País"])
                     (column-display-names-for-table table))))))))))

(deftest infer-separator-catch-exception-test
  (testing "errors in [[upload/infer-separator]] should not prevent the upload (#44034)"
    (mt/test-drivers (mt/normal-drivers-with-feature :uploads)
      (with-mysql-local-infile-on-and-off
        (with-upload-table!
          [table (create-from-csv-and-sync-with-defaults!
                  :file (csv-file-with ["\"c1\",\"c2\""
                                        "\"a,b,c\",\"d\""]))]
          (testing "Check the data was uploaded into the table correctly"
            (is (= (header-with-auto-pk ["c1", "c2"])
                   (column-names-for-table table)))
            (is (= (rows-with-auto-pk [["a,b,c" "d"]])
                   (rows-for-table table)))))))))

(defn reusable-string-reader
  "Because life is too short for zillions of temp files."
  [^String s]
  (let [bytes (.getBytes s "UTF-8")]
    (reify
      io/IOFactory
      (make-input-stream [_ _opts]
        (ByteArrayInputStream. bytes))
      (make-reader [this opts]
        (io/reader (io/make-input-stream this opts))))))

(defn- infer-separator [rows]
  (#'upload/infer-separator (reusable-string-reader (str/join "\n" rows))))

(deftest infer-separator-test
  (testing "doesn't error when checking alternative separators (#44034)"
    (let [rows ["\"c1\",\"c2\""
                "\"a,b,c\",\"d\""]]
      (is (= \, (infer-separator rows)))))
  (doseq [[separator lines] example-files]
    (testing (str "inferring " separator)
      (let [s ({:tab \tab :semi-colon \; :comma \, :pipe \|} separator)]
        (is (= s (infer-separator lines))))))
  ;; it's actually decently hard to make it not stumble on comma or semicolon. The strategy here is that the data
  ;; column count is greater than the header column count regardless of the separators we choose
  (let [lines [","
               ",,,;;;\t\t"]]
    (testing "will defer data width errors to insertion time if other separators are degenerate"
      (is (= \, (infer-separator lines))))))

(deftest infer-separator-priority-test
  (testing "Multiple header columns"
    ;; Despite inconsistent counts, we pick \;
    (is (= \; (infer-separator ["a;b" "1"]))))
  (testing "Consistent column counts"
    ;; despite more data columns for the other separators, we pick \;
    (is (= \; (infer-separator ["a;b,c\td"
                                "1;2,3,4\t5\t6"]))))
  (testing "Headers for every column"
    ;; despite more data columns for other separators, we pick \;
    (is (= \; (infer-separator ["a,b;c\td"
                                "1,2,3;4\t5"]))))
  (testing "Greatest number of data columns"
    ;; despite more headers for \, we pick \;
    (is (= \; (infer-separator ["a;b;c;d,e,f,g,h\ti\tj"
                                "1;2;3,4\t5"]))))
  (testing "Greatest number of header columns"
    (is (= \; (infer-separator ["a,b;c;d\te"]))))
  (testing "Precedence"
    (is (= \, (infer-separator [])))
    (is (= \; (infer-separator ["a\tb;c"
                                "1\t2;3"])))))

(deftest infer-separator-multiline-test
  (testing "it picks the only viable separator forced by a quote"
    (is (= \; (infer-separator ["name, first;surname"
                                "bond, james;bond"
                                "\"semi;\";colon"]))))
  (testing "it considers consistency across the split count"
    (is (= \; (infer-separator ["product name; amount, in dollars"
                                "blunderbuss;  1,000"
                                "cyberwagon;   1,000,000"])))))

(deftest create-from-csv-date-test
  (testing "Upload a CSV file with a datetime column"
    (mt/test-drivers (mt/normal-drivers-with-feature :uploads)
      (with-mysql-local-infile-on-and-off
        (with-upload-table!
          [table (create-from-csv-and-sync-with-defaults!
                  :file (csv-file-with ["datetime"
                                        "2022-01-01"
                                        "2022-01-01 00:00"
                                        "2022-01-01T00:00:00"
                                        "2022-01-01T00:00"]))]
          (testing "Fields exists after sync"
            (testing "Check the datetime column the correct base_type"
              (is (=? :type/DateTime
                      (t2/select-one-fn :base_type Field :%lower.name "datetime" :table_id (:id table)))))
            (is (some? table))))))))

(deftest create-from-csv-offset-datetime-test
  (testing "Upload a CSV file with an offset datetime column"
    (mt/test-drivers (mt/normal-drivers-with-feature :uploads)
      (when (driver/upload-type->database-type driver/*driver* :metabase.upload/offset-datetime)
        (with-mysql-local-infile-on-and-off
          (with-redefs [driver/db-default-timezone (constantly "Z")
                        upload/current-database    (constantly (mt/db))]
            (let [transpose  (fn [m] (apply mapv vector m))
                  [csv-strs expected] (transpose [["2022-01-01T12:00:00-07"    "2022-01-01T19:00:00Z"]
                                                  ["2022-01-01T12:00:00-07:00" "2022-01-01T19:00:00Z"]
                                                  ["2022-01-01T12:00:00-07:30" "2022-01-01T19:30:00Z"]
                                                  ["2022-01-01T12:00:00Z"      "2022-01-01T12:00:00Z"]
                                                  ["2022-01-01T12:00:00-00:00" "2022-01-01T12:00:00Z"]
                                                  ["2022-01-01T12:00:00+07"    "2022-01-01T05:00:00Z"]
                                                  ["2022-01-01T12:00:00+07:00" "2022-01-01T05:00:00Z"]
                                                  ["2022-01-01T12:00:00+07:30" "2022-01-01T04:30:00Z"]
                                                  ["2022-01-01T12:00:00+0730"  "2022-01-01T04:30:00Z"]])]
              (testing "Fields exists after sync"
                (with-upload-table!
                  [table (create-from-csv-and-sync-with-defaults!
                          :file (csv-file-with (into ["offset_datetime"] csv-strs)))]
                  (testing "Check the offset datetime column the correct base_type"
                    (is (=? :type/DateTimeWithLocalTZ
                            (t2/select-one-fn :base_type Field :%lower.name "offset_datetime" :table_id (:id table)))))
                  (let [position (column-position table "offset_datetime")
                        values   (map #(nth % position) (rows-for-table table))]
                    (is (= expected
                           values))))))))))))

(deftest create-from-csv-boolean-test
  (testing "Upload a CSV file"
    (mt/test-drivers (mt/normal-drivers-with-feature :uploads)
      (with-mysql-local-infile-on-and-off
        (with-upload-table!
          [table (create-from-csv-and-sync-with-defaults!
                  :file (csv-file-with ["id,bool"
                                        "1,true"
                                        "2,false"
                                        "3,TRUE"
                                        "4,FALSE"
                                        "5,t    "
                                        "6,   f"
                                        "7,\tT"
                                        "8,F\t"
                                        "9,y"
                                        "10,n"
                                        "11,Y"
                                        "12,N"
                                        "13,yes"
                                        "14,no"
                                        "15,YES"
                                        "16,NO"
                                        "17,1"
                                        "18,0"]))]
          (testing "Table and Fields exist after sync"
            (testing "Check the boolean column has a boolean base_type"
              (is (= :type/Boolean
                     (t2/select-one-fn :base_type Field :%lower.name "bool" :table_id (:id table)))))
            (testing "Check the data was uploaded into the table correctly"
              (let [position    (column-position table "bool")
                    bool-column (map #(nth % position) (rows-for-table table))
                    alternating (map even? (range (count bool-column)))]
                (is (= alternating bool-column))))))))))

(deftest create-from-csv-length-test
  (testing "Upload a CSV file with large names and numbers"
    (mt/test-drivers (mt/normal-drivers-with-feature :uploads)
      (with-mysql-local-infile-on-and-off
        (let [length-limit (driver/table-name-length-limit driver/*driver*)
              ;; Ensure the name is unique as table names can collide when using redshift
              long-name    (->> "abc" str cycle (take (inc length-limit)) shuffle (apply str))
              short-name   (subs long-name 0 (- length-limit (count "_yyyyMMddHHmmss")))
              table-name   (u/upper-case-en (@#'upload/unique-table-name driver/*driver* long-name))]
          (is (pos? length-limit) "driver/table-name-length-limit has been set")
          (with-upload-table!
            [table (create-from-csv-and-sync-with-defaults!
                    :table-name table-name
                    :file (csv-file-with ["number,bool"
                                          "1,true"
                                          "2,false"
                                          (format "%d,true" Long/MAX_VALUE)]))]
            (let [table-re (re-pattern (str "(?i)" short-name "_\\d{14}"))]
              (testing "It truncates it to the right number of characters, allowing for the timestamp"
                (is (re-matches table-re (:name table))))
              (testing "Check the data was uploaded into the table correctly"
                (is (= (rows-with-auto-pk
                        [[1 true]
                         [2 false]
                         [Long/MAX_VALUE true]])
                       (rows-for-table table)))))))))))

(deftest create-from-csv-non-ascii-test
  (testing "Upload a CSV file with a datetime column"
    (mt/test-drivers (mt/normal-drivers-with-feature :uploads)
      (with-mysql-local-infile-on-and-off
        (with-upload-table!
          [table (create-from-csv-and-sync-with-defaults!
                  :file (csv-file-with ["ID,名前,年齢,職業,都市,Дтв ызд"
                                        "1,佐藤太郎,25,エンジニア,東京,9"
                                        "2,鈴木花子,30,デザイナー,大阪,8"
                                        "3,田中一郎,28,マーケター,名古屋,7"
                                        "4,山田次郎,35,プロジェクトマネージャー,福岡,6"
                                        "5,中村美咲,32,データサイエンティスト,札幌,5"]))]
          (testing "Check the data was uploaded into the table correctly"
            (is (= (header-with-auto-pk ["ID" "名前" "年齢" "職業" "都市" "Дтв Ызд"])
                   (column-display-names-for-table table)))
            (is (= (rows-with-auto-pk
                    [[1 "佐藤太郎" 25 "エンジニア" "東京" 9]
                     [2 "鈴木花子" 30 "デザイナー" "大阪" 8]
                     [3 "田中一郎" 28 "マーケター" "名古屋" 7]
                     [4 "山田次郎" 35 "プロジェクトマネージャー" "福岡" 6]
                     [5 "中村美咲" 32 "データサイエンティスト" "札幌" 5]])
                   (rows-for-table table)))))))))

(deftest create-from-csv-empty-header-test
  (testing "Upload a CSV file with a blank column name"
    (mt/test-drivers (mt/normal-drivers-with-feature :uploads)
      (with-upload-table!
        [table (create-from-csv-and-sync-with-defaults!
                :file (csv-file-with [",ship name,"
                                      "1,Serenity,Malcolm Reynolds"
                                      "2,Millennium Falcon, Han Solo"]))]
        (testing "Check the data was uploaded into the table correctly"
          (is (= (header-with-auto-pk ["Unnamed Column" "Ship Name" "Unnamed Column 2"])
                 (column-display-names-for-table table))))))))

(deftest create-from-csv-duplicate-names-test
  (testing "Upload a CSV file with duplicate column names"
    (mt/test-drivers (mt/normal-drivers-with-feature :uploads)
      (with-mysql-local-infile-on-and-off
        (with-upload-table!
          [table (create-from-csv-and-sync-with-defaults!
                  :file (csv-file-with ["unknown,unknown,unknown,unknown_2"
                                        "1,Serenity,Malcolm Reynolds,Pistol"
                                        "2,Millennium Falcon, Han Solo,Blaster"]))]
          (testing "Table and Fields exist after sync"
            (testing "Check the data was uploaded into the table correctly"
              (is (= (header-with-auto-pk ["unknown" "unknown_2" "unknown_3" "unknown_2_2"])
                     (column-names-for-table table)))
              (is (= (header-with-auto-pk ["Unknown" "Unknown 2" "Unknown 3" "Unknown 2 2"])
                     (column-display-names-for-table table))))))))))

(deftest create-from-csv-sanitize-to-duplicate-names-test
  (testing "Upload a CSV file with unique column names that get sanitized to the same string"
    (mt/test-drivers (mt/normal-drivers-with-feature :uploads)
      (with-mysql-local-infile-on-and-off
        (with-upload-table!
          [table (create-from-csv-and-sync-with-defaults!
                  :file (csv-file-with ["cost $, cost %, cost #"
                                        "$123,12.3, 100"]))]
          (testing "Table and Fields exist after sync"
            (testing "Check the data was uploaded into the table correctly"
              (is (= (header-with-auto-pk ["Cost $" "Cost %" "Cost #"])
                     (column-display-names-for-table table)))
              (is (= (header-with-auto-pk ["cost__" "cost___2" "cost___3"])
                     (column-names-for-table table))))))))))

(deftest create-from-csv-bool-and-int-test
  (testing "Upload a CSV file with integers and booleans in the same column"
    (mt/test-drivers (mt/normal-drivers-with-feature :uploads)
      (with-mysql-local-infile-on-and-off
        (with-upload-table!
          [table (create-from-csv-and-sync-with-defaults!
                  :file (csv-file-with ["vchar,bool,bool-or-int,int"
                                        " true,true,          1,  1"
                                        "    1,   1,          0,  0"
                                        "    2,   0,          0,  0"
                                        "   no,  no,          1,  2"]))]
          (testing "Check the data was uploaded into the table correctly"
            (is (= (rows-with-auto-pk
                    [[" true"  true true  1]
                     ["    1"  true false 0]
                     ["    2" false false 0]
                     ["   no" false true  2]])
                   (rows-for-table table)))))))))

(deftest create-from-csv-existing-id-column-test
  (testing "Upload a CSV file with an existing ID column"
    (mt/test-drivers (mt/normal-drivers-with-feature :uploads)
      (with-mysql-local-infile-on-and-off
        (with-upload-table!
          [table (binding [upload/*auxiliary-sync-steps* :synchronous]
                   (create-from-csv-and-sync-with-defaults!
                    :file (csv-file-with ["id,ship,name,weapon"
                                          "1,Serenity,Malcolm Reynolds,Pistol"
                                          "2,Millennium Falcon,Han Solo,Blaster"
                                          ;; A huge ID to make extra sure we're using bigints
                                          "9000000000,Razor Crest,Din Djarin,Spear"])
                    :auxiliary-sync-steps :synchronous))]
          (testing "Check the data was uploaded into the table correctly"
            (is (= (header-with-auto-pk ["id" "ship" "name" "weapon"])
                   (column-names-for-table table)))
            (is (=? {:name                       #"(?i)id"
                     :semantic_type              :type/PK
                     :base_type                  :type/BigInteger
                     :database_is_auto_increment false}
                    (let [pos (if (auto-pk-column?) 1 0)]
                      (t2/select-one Field :database_position pos :table_id (:id table)))))))))))

(deftest create-from-csv-auto-pk-column-test
  (mt/test-drivers (mt/normal-drivers-with-feature :uploads :upload-with-auto-pk)
    (with-mysql-local-infile-on-and-off
      (testing "Upload a CSV file with column names that are reserved by the DB, ignoring them"
        (testing "A single column whose name normalizes to _mb_row_id"
          (with-upload-table!
            [table (create-from-csv-and-sync-with-defaults!
                    :file (csv-file-with ["_mb_ROW-id,ship,captain"
                                          "100,Serenity,Malcolm Reynolds"
                                          "3,Millennium Falcon, Han Solo"]))]
            (testing "Check the data was uploaded into the table correctly"
              (is (= ["_mb_row_id", "ship", "captain"]
                     (column-names-for-table table)))
              (is (= (rows-with-auto-pk
                      [["Serenity" "Malcolm Reynolds"]
                       ["Millennium Falcon" " Han Solo"]])
                     (rows-for-table table)))))))
      (testing "Multiple identical column names that normalize to _mb_row_id"
        (with-upload-table!
          [table (create-from-csv-and-sync-with-defaults!
                  :file (csv-file-with ["_mb row id,ship,captain,_mb row id"
                                        "100,Serenity,Malcolm Reynolds,200"
                                        "3,Millennium Falcon, Han Solo,4"]))]
          (testing "Check the data was uploaded into the table correctly"
            (is (= ["_mb_row_id", "ship", "captain"]
                   (column-names-for-table table)))
            (is (= (rows-with-auto-pk
                    [["Serenity" "Malcolm Reynolds"]
                     ["Millennium Falcon" " Han Solo"]])
                   (rows-for-table table))))))
      (testing "Multiple different column names that normalize to _mb_row_id"
        (with-upload-table!
          [table (create-from-csv-and-sync-with-defaults!
                  :file (csv-file-with ["_mb row id,ship,captain,_MB_ROW_ID"
                                        "100,Serenity,Malcolm Reynolds,200"
                                        "3,Millennium Falcon, Han Solo,4"]))]
          (testing "Check the data was uploaded into the table correctly"
            (is (= ["_mb_row_id", "ship", "captain"]
                   (column-names-for-table table)))
            (is (= (rows-with-auto-pk
                    [["Serenity" "Malcolm Reynolds"]
                     ["Millennium Falcon" " Han Solo"]])
                   (rows-for-table table)))))))))

(deftest load-from-csv-auto-pk-column-non-supporting-test
  (mt/test-drivers (mt/normal-drivers-with-feature :uploads)
    ;; There aren't any officially supported databases yet that don't support `:upload-with-auto-pk`
    ;; So we'll fake it here to test it for 3rd party drivers
    (let [original-supports?-fn driver.u/supports?]
      (with-redefs [driver.u/supports? (fn [driver feature db]
                                         (if (= feature :upload-with-auto-pk)
                                           false
                                           (original-supports?-fn driver feature db)))]
        (with-mysql-local-infile-on-and-off
          (testing "Upload a CSV file with column names that are reserved by the DB, NOT ignoring them"
            (testing "A single column whose name normalizes to _mb_row_id"
              (with-upload-table!
                [table (create-from-csv-and-sync-with-defaults!
                        :file (csv-file-with ["_mb_ROW-id,ship,captain"
                                              "100,Serenity,Malcolm Reynolds"
                                              "3,Millennium Falcon, Han Solo"]))]
                (testing "Check the data was uploaded into the table correctly"
                  (is (= ["_mb_row_id", "ship", "captain"]
                         (column-names-for-table table)))
                  (is (= (rows-with-auto-pk
                          [[100 "Serenity" "Malcolm Reynolds"]
                           [3   "Millennium Falcon" " Han Solo"]])
                         (rows-for-table table)))))))
          (testing "Multiple identical column names that normalize to _mb_row_id"
            (with-upload-table!
              [table (create-from-csv-and-sync-with-defaults!
                      :file (csv-file-with ["_mb row id,ship,captain,_mb row id"
                                            "100,Serenity,Malcolm Reynolds,200"
                                            "3,Millennium Falcon, Han Solo,4"]))]
              (testing "Check the data was uploaded into the table correctly"
                (is (= ["_mb_row_id", "ship", "captain" "_mb_row_id_2"]
                       (column-names-for-table table)))
                (is (= (rows-with-auto-pk
                        [[100 "Serenity"          "Malcolm Reynolds" 200]
                         [3   "Millennium Falcon" " Han Solo"        4]])
                       (rows-for-table table))))))
          (testing "Multiple different column names that normalize to _mb_row_id"
            (with-upload-table!
              [table (create-from-csv-and-sync-with-defaults!
                      :file (csv-file-with ["_mb row id,ship,captain,_MB_ROW_ID"
                                            "100,Serenity,Malcolm Reynolds,200"
                                            "3,Millennium Falcon, Han Solo,4"]))]
              (testing "Check the data was uploaded into the table correctly"
                (is (= ["_mb_row_id", "ship", "captain" "_mb_row_id_2"]
                       (column-names-for-table table)))
                (is (= (rows-with-auto-pk
                        [[100 "Serenity" "Malcolm Reynolds" 200]
                         [3 "Millennium Falcon" " Han Solo" 4]])
                       (rows-for-table table)))))))))))

(deftest create-from-csv-missing-values-test
  (mt/test-drivers (mt/normal-drivers-with-feature :uploads)
    (with-mysql-local-infile-on-and-off
      (testing "Can upload a CSV with missing values"
        (with-upload-table!
          [table (create-from-csv-and-sync-with-defaults!
                  :file (csv-file-with ["column_that_has_one_value,column_that_doesnt_have_a_value"
                                        "2"
                                        "  ,\n"]))]
          (testing "Check the data was uploaded into the table correctly"
            (is (= (header-with-auto-pk ["column_that_has_one_value", "column_that_doesnt_have_a_value"])
                   (column-names-for-table table)))
            (is (= (rows-with-auto-pk
                    [[2 nil]
                     [nil nil]])
                   (rows-for-table table)))))))))

(deftest create-from-csv-tab-test
  (testing "Upload a CSV file with tabs in the values"
    (mt/test-drivers (mt/normal-drivers-with-feature :uploads)
      (with-mysql-local-infile-on-and-off
        (with-upload-table!
          [table (create-from-csv-and-sync-with-defaults!
                  :file (csv-file-with ["ship,captain"
                                        "Serenity,Malcolm\tReynolds"
                                        "Millennium\tFalcon,Han\tSolo"]))]
          (testing "Check the data was uploaded into the table correctly"
            (is (= (header-with-auto-pk ["ship", "captain"])
                   (column-names-for-table table)))
            (is (= (rows-with-auto-pk
                    [["Serenity" "Malcolm\tReynolds"]
                     ["Millennium\tFalcon" "Han\tSolo"]])
                   (rows-for-table table)))))))))

(deftest create-from-csv-carriage-return-test
  (testing "Upload a CSV file with carriage returns in the values"
    (mt/test-drivers (mt/normal-drivers-with-feature :uploads)
      (with-mysql-local-infile-on-and-off
        (with-upload-table!
          [table (create-from-csv-and-sync-with-defaults!
                  :file (csv-file-with ["ship,captain"
                                        "Serenity,\"Malcolm\rReynolds\""
                                        "\"Millennium\rFalcon\",\"Han\rSolo\""]))]
          (testing "Check the data was uploaded into the table correctly"
            (is (= (header-with-auto-pk ["ship", "captain"])
                   (column-names-for-table table)))
            (is (= (rows-with-auto-pk
                    [["Serenity" "Malcolm\rReynolds"]
                     ["Millennium\rFalcon" "Han\rSolo"]])
                   (rows-for-table table)))))))))

(deftest create-from-csv-BOM-test
  (testing "Upload a CSV file with a byte-order mark (BOM)"
    (mt/test-drivers (mt/normal-drivers-with-feature :uploads)
      (with-mysql-local-infile-on-and-off
        (with-upload-table!
          [table (create-from-csv-and-sync-with-defaults!
                  :file (csv-file-with ["ship,captain"
                                        "Serenity,Malcolm Reynolds"
                                        "Millennium Falcon, Han Solo"]
                                       "star-wars"
                                       (partial bom/bom-writer "UTF-8")))]
          (testing "Check the data was uploaded into the table correctly"
            (is (= (header-with-auto-pk ["ship", "captain"])
                   (column-names-for-table table)))))))))

(deftest create-from-csv-injection-test
  (testing "Upload a CSV file with very rude values"
    (mt/test-drivers (mt/normal-drivers-with-feature :uploads)
      (with-mysql-local-infile-on-and-off
        (with-upload-table!
          [table (create-from-csv-and-sync-with-defaults!
                  :file (csv-file-with ["id integer); --,ship,captain"
                                        "1,Serenity,--Malcolm Reynolds"
                                        "2,;Millennium Falcon,Han Solo\""]
                                       "\"; -- Very rude filename"))]
          (testing "Check the data was uploaded into the table correctly"
            (is (= (header-with-auto-pk ["id_integer_____" "ship" "captain"])
                   (column-names-for-table table)))
            (is (= (rows-with-auto-pk
                    [[1 "Serenity"           "--Malcolm Reynolds"]
                     [2 ";Millennium Falcon" "Han Solo\""]])
                   (rows-for-table table)))))))))

(deftest create-from-csv-eof-marker-test
  (testing "Upload a CSV file with Postgres's 'end of input' marker"
    (mt/test-drivers [:postgres]
      (with-upload-table!
        [table (create-from-csv-and-sync-with-defaults!
                :file (csv-file-with ["name"
                                      "Malcolm"
                                      "\\."
                                      "Han"]))]
        (testing "Check the data was uploaded into the table correctly"
          (is (= (rows-with-auto-pk
                  [["Malcolm"] ["\\."] ["Han"]])
                 (rows-for-table table))))))))

(deftest mysql-settings-test
  (testing "Ensure that local_infile is set to true for better MySQL testing"
    (mt/test-drivers [:mysql]
      (do-with-mysql-local-infile-on
       (fn []
         (is (= "ON" (-> (sql-jdbc.conn/db->pooled-connection-spec (mt/db))
                         (jdbc/query "show global variables like 'local_infile'")
                         first
                         :value)))))))
  (testing "Ensure that local_infile is set to false for better MySQL testing"
    (mt/test-drivers [:mysql]
      (do-with-mysql-local-infile-off
       (fn []
         (is (= "OFF" (-> (sql-jdbc.conn/db->pooled-connection-spec (mt/db))
                          (jdbc/query "show global variables like 'local_infile'")
                          first
                          :value))))))))

(defn- update-csv-synchronously!
  "Wraps [[upload/upload-csv!]] setting [[upload/*auxiliary-sync-steps*]] to `synchronous` for test purposes."
  [options]
  (binding [upload/*auxiliary-sync-steps* :synchronous]
    (upload/update-csv! options)))

(defn- update-csv!
  "Shorthand for synchronously updating a CSV"
  [action options]
  (update-csv-synchronously! (merge {:filename "test.csv" :action action} options)))

(deftest create-csv-upload!-schema-test
  (mt/test-drivers (mt/normal-drivers-with-feature :uploads :schemas)
    (let [db                   (mt/db)
          db-id                (u/the-id db)
          original-sync-values (select-keys db [:is_on_demand :is_full_sync])
          schema-name          (sql.tx/session-schema driver/*driver*)
          _                    (t2/update! :model/Database db-id {:is_on_demand false
                                                                  :is_full_sync false})]
      (try
        (testing "Happy path with schema, and without table-prefix"
          (do-with-uploaded-example-csv!
           {:schema-name schema-name, :auxiliary-sync-steps :synchronous}
           (fn [model]
             (with-upload-table! [new-table (card->table model)]
               (is (=? {:display          :table
                        :database_id      db-id
                        :dataset_query    {:database db-id
                                           :query    {:source-table (:id new-table)}
                                           :type     :query}
                        :creator_id       (mt/user->id :rasta)
                        :name             #"(?i)example csv file(.*)"
                        :collection_id    nil}
                       (t2/select-one :model/Card :table_id (:id new-table)))
                   "A new model is created")
               (is (=? {:name      #"(?i)example(.*)"
                        :schema    (re-pattern (str "(?i)" schema-name))
                        :is_upload true}
                       new-table)
                   "A new table is created")
               (is (= "complete"
                      (:initial_sync_status (t2/select-one :model/Table (:id new-table))))
                   "The table is synced and marked as complete")
               (is (t2/exists? Field :table_id (:id new-table) :%lower.name "name" :semantic_type :type/Name)
                   "The sync actually runs")))))
        (finally
          (t2/update! :model/Database db-id original-sync-values))))))

(deftest create-csv-upload!-table-prefix-test
  (mt/test-drivers (mt/normal-drivers-with-feature :uploads)
    (testing "Happy path with table prefix, and without schema"
      (if (driver.u/supports? driver/*driver* :schemas (mt/db))
        (is (thrown-with-msg?
             java.lang.Exception
             #"^A schema has not been set."
             (do-with-uploaded-example-csv!
              {:table-prefix "uploaded_magic_" :schema-name nil}
              identity)))
        (do-with-uploaded-example-csv!
         {:table-prefix "uploaded_magic_"}
         (fn [model]
           (with-upload-table! [table (card->table model)]
             (is (=? {:name #"(?i)example csv file(.*)"}
                     (table->card table)))
             (is (=? {:name #"(?i)uploaded_magic_example(.*)"}
                     table))
             (is (nil? (:schema table))))))))))

(deftest create-csv-upload!-auto-pk-column-display-name-test
  (testing "The auto-generated column display_name should be the same as its name"
    (mt/test-drivers (mt/normal-drivers-with-feature :uploads :upload-with-auto-pk)
      (do-with-uploaded-example-csv!
       {}
       (fn [model]
         (with-upload-table! [table (card->table model)]
           (let [new-field (t2/select-one Field :table_id (:id table) :name "_mb_row_id")]
             (is (= "_mb_row_id"
                    (:name new-field)
                    (:display_name new-field))))))))))

(deftest ^:mb/once csv-upload-snowplow-test
  (mt/test-drivers (mt/normal-drivers-with-feature :uploads)
    (snowplow-test/with-fake-snowplow-collector
      (do-with-uploaded-example-csv!
       {}
       (fn [model]
         (with-upload-table! [_table (card->table model)]
           (testing "Successfully creating a CSV Upload publishes statistics to Snowplow"
             (is (=? {:data    {"event"             "csv_upload_successful"
                                "model_id"          pos?
                                "size_mb"           3.910064697265625E-5
                                "num_columns"       2
                                "num_rows"          2
                                "generated_columns" (if (auto-pk-column?) 1 0)
                                "upload_seconds"    pos?}
                      :user-id (str (mt/user->id :rasta))}
                     (last (snowplow-test/pop-event-data-and-user-id!)))))

           (testing "Failures when creating a CSV Upload will publish statistics to Snowplow"
             (mt/with-dynamic-redefs [upload/create-from-csv! (fn [_ _ _ _] (throw (Exception.)))]
               (try (do-with-uploaded-example-csv! {} identity)
                    (catch Throwable _
                      nil))
               (is (= {:data    {"event"             "csv_upload_failed"
                                 "size_mb"           3.910064697265625E-5
                                 "num_columns"       2
                                 "num_rows"          2
                                 "generated_columns" 0}
                       :user-id (str (mt/user->id :rasta))}
                      (last (snowplow-test/pop-event-data-and-user-id!))))))))))))

(deftest ^:mb/once csv-upload-audit-log-test
  (mt/test-drivers (mt/normal-drivers-with-feature :uploads)
    (mt/with-premium-features #{:audit-app}
      (do-with-uploaded-example-csv!
       {}
       (fn [model]
         (with-upload-table!
           [_table (card->table model)]
           (is (=? {:topic    :upload-create
                    :user_id  (:id (mt/fetch-user :rasta))
                    :model    "Table"
                    :model_id pos?
                    :details  {:db-id       pos?
                               :schema-name (sql.tx/session-schema driver/*driver*)
                               :table-name  string?
                               :model-id    pos?
                               :stats       {:num-rows          2
                                             :num-columns       2
                                             :generated-columns (if (auto-pk-column?) 1 0)
                                             :size-mb           3.910064697265625E-5
                                             :upload-seconds    pos?}}}
                   (last-audit-event :upload-create)))))))))

(defn- write-empty-gzip
  "Writes the data for an empty gzip file"
  [^File file]
  (with-open [out (FileOutputStream. file)]
    (.write out (byte-array
                 [0x1F 0x8B ; GZIP magic number
                  0x08      ; Compression method (deflate)
                  0         ; Flags
                  0 0 0 0   ; Modification time (none)
                  0         ; Extra flags
                  0xFF      ; Operating system (unknown)
                  0x03 0    ; Compressed data (empty block)
                  0 0 0 0   ; CRC32
                  0 0 0 0   ; Input size
                  ]))
    file))

(deftest ^:mb/once create-csv-upload!-failure-test
  (mt/test-drivers (mt/normal-drivers-with-feature :uploads)
    (mt/with-empty-db
      (testing "Uploads must be enabled"
        (is (thrown-with-msg?
             java.lang.Exception
             #"^Uploads are not enabled\.$"
             (do-with-uploaded-example-csv!
              {:uploads-enabled false :schema-name "public", :table-prefix "uploaded_magic_"}
              identity))))
      (testing "Database ID must be valid"
        (is (thrown-with-msg?
             java.lang.Exception
             #"^The uploads database does not exist\.$"
             (do-with-uploaded-example-csv!
              {:db-id Integer/MAX_VALUE, :schema-name "public", :table-prefix "uploaded_magic_"}
              identity))))
      (testing "Uploads must be supported"
        (mt/with-dynamic-redefs [driver.u/supports? (constantly false)]
          (is (thrown-with-msg?
               java.lang.Exception
               #"^Uploads are not supported on \w+ databases\."
               (do-with-uploaded-example-csv!
                {:schema-name "public", :table-prefix "uploaded_magic_"}
                identity)))))
      (testing "User must have write permissions on the collection"
        (mt/with-non-admin-groups-no-root-collection-perms
          (is (thrown-with-msg?
               java.lang.Exception
               #"^You do not have curate permissions for this Collection\.$"
               (do-with-uploaded-example-csv!
                {:user-id (mt/user->id :lucky) :schema-name "public", :table-prefix "uploaded_magic_"}
                identity)))))
      (testing "File type must be allowed"
        (is (thrown-with-msg?
             clojure.lang.ExceptionInfo
             #"Unsupported File Type"
             (do-with-uploaded-example-csv!
              {:file (tmp-file "illegal" ".jpg")}
              identity)))
        (is (thrown-with-msg?
             clojure.lang.ExceptionInfo
             #"Unsupported File Type"
             (do-with-uploaded-example-csv!
              {:file (write-empty-gzip (tmp-file "sneaky" ".csv"))}
              identity)))))))

(defn- find-schema-filters-prop [driver]
  (first (filter (fn [conn-prop]
                   (= :schema-filters (keyword (:type conn-prop))))
                 (driver/connection-properties driver))))

(deftest ^:mb/once create-csv-upload!-schema-does-not-sync-test
  ;; We only need to test this for a single driver, and the way this test has been written is coupled to Postgres
  (mt/test-driver :postgres
    (mt/with-empty-db
      (let [driver             (driver.u/database->driver (mt/db))
            schema-filter-prop (find-schema-filters-prop driver)
            filter-type-prop   (keyword (str (:name schema-filter-prop) "-type"))
            patterns-type-prop (keyword (str (:name schema-filter-prop) "-patterns"))]
        (t2/update! :model/Database (mt/id) {:details (-> (mt/db)
                                                          :details
                                                          (assoc filter-type-prop "exclusion"
                                                                 patterns-type-prop "public"))})
        (testing "Upload should fail if table can't be found after sync, for example because of schema filters"
          (try (do-with-uploaded-example-csv!
                {:schema-name "public"}
                (fn [_model]
                  (is (false? :should-not-be-reached))))
               (catch Exception e
                 (is (= {:status-code 422}
                        (ex-data e)))
                 (is (re-matches #"^The schema public is not syncable\.$"
                                 (.getMessage e))))))
        (testing "\nThe table should be deleted"
          (is (false? (let [details (mt/dbdef->connection-details driver/*driver* :db data.impl/*dbdef-used-to-create-db*)]
                        (-> (jdbc/query (sql-jdbc.conn/connection-details->spec driver/*driver* details)
                                        ["SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public')"])
                            first vals first)))))))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                           append-csv!                                                          |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn create-upload-table!
  "Creates a table and syncs it in the current test database, as if it were uploaded as a CSV upload.
  `col->upload-type` should be an ordered map of column names (keywords) to upload types.
  `rows` should be a vector of vectors of values, one for each row.
  Returns the table.

  Defaults to a table with an auto-incrementing integer ID column, and a name column."
  [& {:keys [schema-name table-name col->upload-type rows]
      :or {table-name       (mt/random-name)
           schema-name      (sql.tx/session-schema driver/*driver*)
           col->upload-type (cond->> (ordered-map/ordered-map :name ::upload-types/varchar-255)
                              (auto-pk-column?)
                              (merge (ordered-map/ordered-map
                                      upload/auto-pk-column-keyword ::upload-types/auto-incrementing-int-pk)))
           rows             [["Obi-Wan Kenobi"]]}}]
  (let [driver            driver/*driver*
        db-id             (mt/id)
        table-name        (ddl.i/format-name driver table-name)
        schema-name       (ddl.i/format-name driver schema-name)
        schema+table-name (#'upload/table-identifier {:schema schema-name :name table-name})
        ->normalized-col  (comp keyword (partial #'upload/normalize-column-name driver) name)
        name->display     (->> (keys col->upload-type)
                               (map name)
                               (remove #{upload/auto-pk-column-name})
                               ((juxt
                                 (partial map (comp name ->normalized-col))
                                 (partial #'upload/derive-display-names driver)))
                               (apply zipmap))
        col->upload-type  (update-keys col->upload-type ->normalized-col)
        insert-col-names  (remove #{upload/auto-pk-column-keyword} (keys col->upload-type))
        col-definitions   (#'upload/column-definitions driver col->upload-type)]
    (driver/create-table! driver/*driver*
                          db-id
                          schema+table-name
                          col-definitions
                          (if (contains? col-definitions upload/auto-pk-column-keyword)
                            {:primary-key [upload/auto-pk-column-keyword]}
                            {}))
    (driver/insert-into! driver db-id schema+table-name insert-col-names rows)
    (let [table (sync-upload-test-table! :database (mt/db) :table-name table-name :schema-name schema-name)]
      ;; ensure we have the same display name for the auto-pk-column that a real upload would have
      (t2/update! :model/Field
                  {:table_id (:id table), :name upload/auto-pk-column-name}
                  {:display_name upload/auto-pk-column-name})
      ;; and preserve the other display names from the CSV
      (doseq [[nm dn] name->display]
        (t2/update! :model/Field {:table_id (:id table), :name nm} {:display_name dn}))
      table)))

(defn catch-ex-info* [f]
  (try
    (f)
    (catch Exception e
      {:message (ex-message e) :data (ex-data e)})))

(defmacro catch-ex-info
  [& body]
  `(catch-ex-info* (fn [] ~@body)))

(defn- actions-to-test [driver]
  (case driver
    :h2 [::upload/append ::upload/replace]
    ;; It's too slow to run all these tests for both for redshift, and adds little value for the other drivers.
    ;; Since ::replace is basically ::append with an extra driver method being called, only test the latter.
    [::upload/replace]))

(defn- action-testing-str [action]
  (format "Can %s an existing upload\n"
          (case action
            ::upload/append "append to"
            ::upload/replace "replace")))

(defn- updated-contents [action initial added]
  ;; TODO fix inconsistent mysql semantics
  (case action
    ::upload/append (rows-with-auto-pk (into initial added))
    ::upload/replace (if (= driver/*driver* :mysql)
                       (rows-with-auto-pk added)
                       (drop (count initial) (rows-with-auto-pk (into initial added))))))

(defn update-csv-with-defaults!
  "Upload a small CSV file to a newly created default table, or an existing table if `table-id` is provided. Default args can be overridden."
  [action & {:keys [user-id file table-id is-upload]
             :or {user-id         (mt/user->id :crowberto)
                  file            (csv-file-with
                                   ["name"
                                    "Luke Skywalker"
                                    "Darth Vader"])
                  is-upload       true}}]
  (mt/with-current-user user-id
    (mt/with-model-cleanup [:model/Table]
      (let [new-table (when (nil? table-id)
                        (create-upload-table!))
            table-id (or table-id (:id new-table))]
        (t2/update! :model/Table table-id {:is_upload is-upload})
        (try (update-csv! action {:table-id table-id, :file file})
             (finally
                 ;; Drop the table in the testdb if a new one was created.
               (when (and new-table (not= driver/*driver* :redshift)) ; redshift tests flake when tables are dropped
                 (driver/drop-table! driver/*driver*
                                     (mt/id)
                                     (#'upload/table-identifier new-table)))))))))

(deftest can-update-test
  (mt/test-drivers (mt/normal-drivers-with-feature :uploads)
    (doseq [action (actions-to-test driver/*driver*)]
      (testing (action-testing-str action)
        (mt/with-discard-model-updates! [:model/Database]
          ;; start with uploads disabled for all databases
          (t2/update! :model/Database :uploads_enabled true {:uploads_enabled false})
          (testing "Updates fail if uploads are disabled for all databases."
            (is (= {:message "Uploads are not enabled."
                    :data    {:status-code 422}}
                   (catch-ex-info (update-csv-with-defaults! action)))))
          (mt/with-temp [:model/Database _ {:uploads_enabled true}]
            (testing "Updates succeed if uploads are enabled for one database, even if it is not the current one."
              (is (= {:row-count 2}
                     (update-csv-with-defaults! action))))
            (testing "The table must exist"
              (is (= {:message "Not found."
                      :data    {:status-code 404}}
                     (catch-ex-info (update-csv-with-defaults! action :table-id Integer/MAX_VALUE)))))
            (testing "The table must be an uploaded table"
              (is (= {:message "The table must be an uploaded table."
                      :data    {:status-code 422}}
                     (catch-ex-info (update-csv-with-defaults! action :is-upload false)))))
            (testing "The CSV file must not be empty"
              (is (= {:message "The CSV file is missing columns that are in the table:\n- name",
                      :data    {:status-code 422}}
                     (catch-ex-info (update-csv-with-defaults! action :file (csv-file-with []))))))
            (testing "Uploads must be supported"
              (mt/with-dynamic-redefs [driver.u/supports? (constantly false)]
                (is (= {:message (format "Uploads are not supported on %s databases." (str/capitalize (name driver/*driver*)))
                        :data    {:status-code 422}}
                       (catch-ex-info (update-csv-with-defaults! action))))))))))))

(deftest update-column-match-test
  (mt/test-drivers (mt/normal-drivers-with-feature :uploads)
    (doseq [action (actions-to-test driver/*driver*)]
      (testing (action-testing-str action)
        (testing "Append should succeed regardless of CSV column order or case"
          (doseq [csv-rows [["id,name" "20,Luke Skywalker" "30,Darth Vader"]
                            ["Id\t,NAmE " "20,Luke Skywalker" "30,Darth Vader"] ;; the same name when normalized
                            ["name,id" "Luke Skywalker,20" "Darth Vader,30"]]] ;; different order
            (with-upload-table!
              [table (create-upload-table! {:col->upload-type (columns-with-auto-pk
                                                               (ordered-map/ordered-map
                                                                :id int-type
                                                                :name vchar-type))
                                            :rows             [[10 "Obi-Wan Kenobi"]]})]
              (let [file (csv-file-with csv-rows)]
                (is (some? (update-csv! action {:file file, :table-id (:id table)})))
                (testing "Check the data was uploaded into the table correctly"
                  (is (= (set (updated-contents action
                                                [[10 "Obi-Wan Kenobi"]]
                                                [[20 "Luke Skywalker"]
                                                 [30 "Darth Vader"]]))
                         (set (rows-for-table table)))))
                (io/delete-file file)))))))))

(defn- trim-lines [s]
  (->> (str/split-lines s)
       (map str/trim)
       (str/join "\n")))

(deftest update-column-mismatch-test
  (mt/test-drivers (mt/normal-drivers-with-feature :uploads)
    (doseq [action (actions-to-test driver/*driver*)]
      (testing (action-testing-str action)
        (with-uploads-enabled!
          (testing "Append should fail only if there are missing columns in the CSV file"
            (doseq [[csv-rows error-message]
                    {[""]
                     (trim-lines "The CSV file is missing columns that are in the table:
                              - id
                              - name")

                    ;; Extra columns are fine, as long as none are missing.
                     ["_mb_row_id,id,extra 1, extra 2,name"]
                     nil
                     ["extra 1, extra 2"]
                     ;; TODO note that the order of the fields is reversed
                     ;; It would be better if they were alphabetical, or matched the order in the database / file.
                     (trim-lines "The CSV file is missing columns that are in the table:
                              - id
                              - name

                              There are new columns in the CSV file that are not in the table:
                              - extra_2
                              - extra_1")

                     ["_mb_row_id,id, extra 2"]
                     (if (auto-pk-column?)
                       (trim-lines "The CSV file is missing columns that are in the table:
                                   - name

                                   There are new columns in the CSV file that are not in the table:
                                   - extra_2")
                       (trim-lines "The CSV file is missing columns that are in the table:
                                  - name

                                  There are new columns in the CSV file that are not in the table:
                                  - extra_2
                                  - _mb_row_id"))}]
              (with-upload-table!
                [table (create-upload-table!
                        {:col->upload-type (ordered-map/ordered-map
                                            :id int-type
                                            :name vchar-type)
                         :rows             [[1, "some_text"]]})]

                (let [file (csv-file-with csv-rows)]
                  (when error-message
                    (is (= {:message error-message
                            :data    {:status-code 422}}
                           (catch-ex-info (update-csv! action {:file file :table-id (:id table)}))))
                    (testing "Check the data was not uploaded into the table"
                      (is (= [[1 "some_text"]]
                             (rows-for-table table)))))

                  (when-not error-message
                    (testing "Check the data was uploaded into the table"
                     ;; No exception is thrown - but there were also no rows in the table to check
                      (update-csv! action {:file file :table-id (:id table)})))

                  (io/delete-file file))))))))))

(deftest update-common-types-test
  (mt/test-drivers (mt/normal-drivers-with-feature :uploads)
    (doseq [action (actions-to-test driver/*driver*)]
      (testing (action-testing-str action)
        (with-mysql-local-infile-on-and-off
          (mt/with-report-timezone-id! "UTC"
            (testing "Append should succeed for all possible CSV column types"
              (mt/with-dynamic-redefs [driver/db-default-timezone (constantly "Z")
                                       upload/current-database    (constantly (mt/db))]
                (with-upload-table!
                  [table (create-upload-table!
                          {:col->upload-type (columns-with-auto-pk
                                              (ordered-map/ordered-map
                                               :biginteger      int-type
                                               :float           float-type
                                               :text            vchar-type
                                               :boolean         bool-type
                                               :date            date-type
                                               :datetime        datetime-type))
                           :rows [[1000000,1.0,"some_text",false,#t "2020-01-01",#t "2020-01-01T00:00:00"]]})]
                  (let [csv-rows ["biginteger,float,text,boolean,date,datetime"
                                  "2000000,2.0,some_text,true,2020-02-02,2020-02-02T02:02:02"]
                        file  (csv-file-with csv-rows)]
                    (is (some? (update-csv! action {:file file, :table-id (:id table)})))
                    (testing "Check the data was uploaded into the table correctly"
                      (is (= (set (updated-contents
                                   action
                                   [[1000000 1.0 "some_text" false "2020-01-01T00:00:00Z" "2020-01-01T00:00:00Z"]]
                                   [[2000000 2.0 "some_text" true "2020-02-02T00:00:00Z" "2020-02-02T02:02:02Z"]]))
                             (set (rows-for-table table)))))
                    (io/delete-file file)))))))))))

(deftest update-offset-datetime-test
  (mt/test-drivers (mt/normal-drivers-with-feature :uploads)
    (doseq [action (actions-to-test driver/*driver*)]
      (testing (action-testing-str action)
        (with-mysql-local-infile-on-and-off
          (mt/with-report-timezone-id! "UTC"
            (testing "Append should succeed for offset datetime columns"
              (with-redefs [driver/db-default-timezone (constantly "Z")
                            upload/current-database    (constantly (mt/db))]
                (with-upload-table!
                  [table (create-upload-table!
                          {:col->upload-type (columns-with-auto-pk
                                              (ordered-map/ordered-map :offset_datetime offset-dt-type))
                           :rows []})]
                  (let [csv-rows ["offset_datetime"
                                  "2020-02-02T02:02:02+02:00"]
                        file  (csv-file-with csv-rows (mt/random-name))]
                    (is (some? (update-csv! action {:file file, :table-id (:id table)})))
                    (testing "Check the data was uploaded into the table correctly"
                      (is (= (set (updated-contents
                                   action
                                   []
                                   [[(if (driver/upload-type->database-type driver/*driver* ::upload/offset-datetime)
                                       "2020-02-02T00:02:02Z"
                                       "2020-02-02T02:02:02+02:00")]]))
                             (set (rows-for-table table)))))
                    (io/delete-file file)))))))))))

(deftest update-no-rows-test
  (mt/test-drivers (mt/normal-drivers-with-feature :uploads)
    (doseq [action (actions-to-test driver/*driver*)]
      (testing (action-testing-str action)
        (with-uploads-enabled!
          (testing "Append should succeed with a CSV with only the header"
            (let [csv-rows ["name"]]
              (with-upload-table!
                [table (create-upload-table!)]
                (let [file (csv-file-with csv-rows)]
                  (is (= {:row-count 0}
                         (update-csv! action {:file file, :table-id (:id table)})))
                  (testing "Check the data was not uploaded into the table"
                    (is (= (set (updated-contents action [["Obi-Wan Kenobi"]] []))
                           (set (rows-for-table table)))))
                  (io/delete-file file))))))))))

(deftest update-mb-row-id-csv-only-test
  (mt/test-drivers (mt/normal-drivers-with-feature :uploads)
    (when (auto-pk-column?)
      (doseq [action (actions-to-test driver/*driver*)]
        (testing (action-testing-str action)
          (testing "If the table doesn't have _mb_row_id but the CSV does, ignore the CSV _mb_row_id but create the column anyway"
            (with-upload-table!
              [table (create-upload-table! {:col->upload-type (ordered-map/ordered-map
                                                               :name vchar-type)
                                            :rows             [["Obi-Wan Kenobi"]]})]
              (let [csv-rows ["_MB-row ID,name" "1000,Luke Skywalker"]
                    file     (csv-file-with csv-rows)]
                (is (= {:row-count 1}
                       (update-csv! action {:file file, :table-id (:id table)})))
                ;; Only create auto-pk columns for drivers that supported uploads before auto-pk columns
                ;; were introduced by metabase#36249. Otherwise we can assume that the table was created
                ;; with an auto-pk column.
                (if (driver/create-auto-pk-with-append-csv? driver/*driver*)
                  (do
                    (testing "Check a _mb_row_id column was created"
                      (is (= ["name" "_mb_row_id"]
                             (column-names-for-table table))))
                    (testing "Check a _mb_row_id column was sync'd"
                      (is (=? {:semantic_type :type/PK
                               :base_type     :type/BigInteger
                               :name          "_mb_row_id"
                               :display_name  "_mb_row_id"}
                              (t2/select-one :model/Field :table_id (:id table) :name upload/auto-pk-column-name))))
                    (testing "Check the data was uploaded into the table, but the _mb_row_id column values were ignored"
                      (case action
                        ::upload/append
                        (is (= [["Obi-Wan Kenobi" 1]
                                ["Luke Skywalker" 2]]
                               (rows-for-table table)))
                        ::upload/replace
                        (is (= [["Luke Skywalker" 1]]
                               (rows-for-table table))))))
                  (do
                    (testing "Check a _mb_row_id column wasn't created"
                      (is (= ["name"]
                             (column-names-for-table table))))
                    (case action
                      ::upload/append
                      (is (= [["Obi-Wan Kenobi"]
                              ["Luke Skywalker"]]
                             (rows-for-table table)))
                      ::upload/replace
                      (is (= [["Luke Skywalker"]]
                             (rows-for-table table))))))
                (io/delete-file file)))))))))

(deftest update-no-mb-row-id-failure-test
  (mt/test-drivers (mt/normal-drivers-with-feature :uploads)
    (doseq [action (actions-to-test driver/*driver*)]
      (testing (action-testing-str action)
        (testing "If the table doesn't have _mb_row_id and a failure occurs, we shouldn't create a _mb_row_id column"
          (with-upload-table!
            [table (create-upload-table! {:col->upload-type (ordered-map/ordered-map
                                                             :bool_column bool-type)
                                          :rows [[true]]})]
            (let [csv-rows    ["bool_column" "not a bool"]
                  file        (csv-file-with csv-rows)
                  get-auto-pk (fn []
                                (t2/select-one :model/Field :table_id (:id table) :name upload/auto-pk-column-name))]
              (is (nil? (get-auto-pk)))
              (is (thrown? Exception
                           (update-csv! action {:file file, :table-id (:id table)})))
              (testing "Check a _mb_row_id column was not created"
                (is (= ["bool_column"]
                       (column-names-for-table table))))
              (testing "Check a _mb_row_id column was not sync'd"
                (is (nil? (get-auto-pk))))
              (testing "Check the data was not uploaded into the table"
                ;; TODO in future it would be good to enhance ::replace to be atomic, i.e. to preserve the existing row
                (case action
                  ::upload/append
                  (is (= [[true]] (rows-for-table table)))
                  ::upload/replace
                  (is (= [] (rows-for-table table)))))
              (io/delete-file file))))))))

(deftest update-mb-row-id-table-only-test
  (mt/test-drivers (mt/normal-drivers-with-feature :uploads)
    (doseq [action (actions-to-test driver/*driver*)]
      (testing (action-testing-str action)
        (testing "Append succeeds if the table has _mb_row_id but the CSV doesn't"
          (with-upload-table! [table (create-upload-table!)]
            (let [csv-rows ["name" "Luke Skywalker"]
                  file     (csv-file-with csv-rows (mt/random-name))]
              (is (= {:row-count 1}
                     (update-csv! action {:file file, :table-id (:id table)})))
              (testing "Check the data was uploaded into the table, but the _mb_row_id was ignored"
                (is (= (set (updated-contents action
                                              [["Obi-Wan Kenobi"]]
                                              [["Luke Skywalker"]]))
                       (set (rows-for-table table)))))
              (io/delete-file file))))))))

(deftest append-duplicate-test
  (mt/test-drivers (mt/normal-drivers-with-feature :uploads)
    (testing "Append should add new rows even if it is the same as the original upload."
      (let [csv-rows    ["id,name" "10,Luke Skywalker" "20,Darth Vader"]
            parsed-rows [[10 "Luke Skywalker"]
                         [20 "Darth Vader"]]]
        (with-upload-table!
          [table (create-upload-table! {:col->upload-type (columns-with-auto-pk
                                                           (ordered-map/ordered-map
                                                            :id int-type
                                                            :name vchar-type))
                                        :rows             parsed-rows})]
          (let [file (csv-file-with csv-rows)]
            (is (some? (update-csv! ::upload/append {:file file, :table-id (:id table)})))
            (testing "Check the data was uploaded into the table correctly"
              (if (mysql/mariadb? (mt/db))
                ;; For MariaDB, the auto-incrementing column isn't continuous if the insert is duplicated. So this test
                ;; skips checking the auto-incrementing column.
                (let [drop-auto-pk #(map rest %)]
                  (is (= (concat parsed-rows parsed-rows)
                         (drop-auto-pk (rows-for-table table)))))
                (is (= (rows-with-auto-pk (concat parsed-rows parsed-rows))
                       (rows-for-table table)))))
            (io/delete-file file)))))))

(deftest ^:mb/once update-snowplow-test
  (mt/test-drivers (mt/normal-drivers-with-feature :uploads)
    (doseq [action (actions-to-test driver/*driver*)]
      (testing (action-testing-str action)
        (snowplow-test/with-fake-snowplow-collector

          (with-upload-table! [table (create-upload-table!)]
            (testing "Successfully appending to CSV Uploads publishes statistics to Snowplow"
              (let [csv-rows ["name" "Luke Skywalker"]
                    file     (csv-file-with csv-rows (mt/random-name))]
                (update-csv! action {:file file, :table-id (:id table)})

                (is (=? {:data    {"event"             "csv_append_successful"
                                   "size_mb"           1.811981201171875E-5
                                   "num_columns"       1
                                   "num_rows"          1
                                   "generated_columns" 0
                                   "upload_seconds"    pos?}
                         :user-id (str (mt/user->id :crowberto))}
                        (last (snowplow-test/pop-event-data-and-user-id!))))

                (io/delete-file file)))

            (testing "Failures when appending to CSV Uploads will publish statistics to Snowplow"
              (mt/with-dynamic-redefs [upload/create-from-csv! (fn [_ _ _ _] (throw (Exception.)))]
                (let [csv-rows ["mispelled_name, unexpected_column" "Duke Cakewalker, r2dj"]
                      file     (csv-file-with csv-rows (mt/random-name))]
                  (try
                    (update-csv! action {:file file, :table-id (:id table)})
                    (catch Throwable _)
                    (finally
                      (io/delete-file file))))

                (is (= {:data    {"event"             "csv_append_failed"
                                  "size_mb"           5.245208740234375E-5
                                  "num_columns"       2
                                  "num_rows"          1
                                  "generated_columns" 0}
                        :user-id (str (mt/user->id :crowberto))}
                       (last (snowplow-test/pop-event-data-and-user-id!))))))))))))

(deftest ^:mb/once update-audit-log-test
  (mt/test-drivers (mt/normal-drivers-with-feature :uploads)
    (doseq [action (actions-to-test driver/*driver*)]
      (testing (action-testing-str action)
        (mt/with-premium-features #{:audit-app}
          (with-upload-table! [table (create-upload-table!)]
            (let [csv-rows ["name" "Luke Skywalker"]
                  file     (csv-file-with csv-rows)]
              (update-csv! action {:file file, :table-id (:id table)})

              (is (=? {:topic    :upload-append
                       :user_id  (:id (mt/fetch-user :crowberto))
                       :model    "Table"
                       :model_id (:id table)
                       :details  {:db-id       pos?
                                  :schema-name (sql.tx/session-schema driver/*driver*)
                                  :table-name  string?
                                  :stats       {:num-rows          1
                                                :num-columns       1
                                                :generated-columns 0
                                                :size-mb           1.811981201171875E-5
                                                :upload-seconds    pos?}}}
                      (last-audit-event :upload-append)))

              (io/delete-file file))))))))

(defn- mbql [mp table]
  (let [table-metadata (lib.metadata/table mp (:id table))]
    (lib/query mp table-metadata)))

(defn- join-mbql [mp base-table join-table]
  (let [base-table-metadata (lib.metadata/table mp (:id base-table))
        join-table-metadata (lib.metadata/table mp (:id join-table))
        ;; We use the primary keys as the join fields as we know they will exist and have compatible types.
        pk-metadata         (fn [table]
                              (let [field-id (t2/select-one-pk :model/Field
                                                               :table_id (:id table)
                                                               :semantic_type :type/PK)]
                                (lib.metadata/field mp field-id)))
        base-id-metadata         (pk-metadata base-table)
        join-id-metadata         (pk-metadata join-table)]

    (-> (lib/query mp base-table-metadata)
        (lib/join (lib/join-clause join-table-metadata
                                   [(lib/= (lib/ref base-id-metadata)
                                           (lib/ref join-id-metadata))])))))

(defn- cached-model-ids []
  (into #{} (map :card_id) (t2/select [:model/PersistedInfo :card_id] :active true)))

(deftest update-invalidate-model-cache-test
  (mt/test-drivers (mt/normal-drivers-with-feature :uploads :persist-models)
    (doseq [action (actions-to-test driver/*driver*)]
      (testing (action-testing-str action)
        (with-upload-table! [table (create-upload-table!)]
          (let [table-id    (:id table)
                csv-rows    ["name" "Luke Skywalker"]
                file        (csv-file-with csv-rows)
                other-id    (mt/id :venues)
                other-table (t2/select-one :model/Table other-id)
                mp          (lib.metadata.jvm/application-database-metadata-provider (:db_id table))]

            (mt/with-temp [:model/Card {question-id        :id} {:table_id table-id, :dataset_query (mbql mp table)}
                           :model/Card {model-id           :id} {:table_id table-id, :type :model, :dataset_query (mbql mp table)}
                           :model/Card {complex-model-id   :id} {:table_id table-id, :type :model, :dataset_query (join-mbql mp table other-table)}
                           :model/Card {archived-model-id  :id} {:table_id table-id, :type :model, :archived true, :dataset_query (mbql mp table)}
                           :model/Card {unrelated-model-id :id} {:table_id other-id, :type :model, :dataset_query (mbql mp other-table)}
                           :model/Card {joined-model-id    :id} {:table_id other-id, :type :model, :dataset_query (join-mbql mp other-table table)}]

              (is (= #{question-id model-id complex-model-id}
                     (into #{} (map :id) (t2/select :model/Card :table_id table-id :archived false))))

              (mt/with-persistence-enabled! [persist-models!]
                (persist-models!)

                (let [cached-before (cached-model-ids)
                      _             (update-csv! action {:file file, :table-id (:id table)})
                      cached-after  (cached-model-ids)]

                  (testing "The models are cached"
                    (let [active-model-ids #{model-id complex-model-id unrelated-model-id joined-model-id}]
                      (is (= active-model-ids (set/intersection cached-before (conj active-model-ids archived-model-id))))))
                  (testing "The cache is invalidated by the update"
                    (is (not (contains? cached-after model-id))))
                  (testing "No unwanted caches were invalidated"
                    (is (= #{model-id} (set/difference cached-before cached-after))))
                  (testing "We can see the new row when querying the model"
                    (is (some (fn [[_ row-name]] (= "Luke Skywalker" row-name))
                              (rows-for-model (:db_id table) model-id)))))))

            (io/delete-file file)))))))

(deftest update-mb-row-id-csv-and-table-test
  (mt/test-drivers (mt/normal-drivers-with-feature :uploads)
    (when (auto-pk-column?)
      (doseq [action (actions-to-test driver/*driver*)]
        (testing (action-testing-str action)
          (testing "Append succeeds if the table has _mb_row_id and the CSV does too"
            (with-upload-table! [table (create-upload-table!)]
              (let [csv-rows ["_mb_row_id,name" "1000,Luke Skywalker"]
                    file     (csv-file-with csv-rows (mt/random-name))]
                (is (= {:row-count 1}
                       (update-csv! action {:file file, :table-id (:id table)})))
                (testing "Check the data was uploaded into the table, but the _mb_row_id was ignored"
                  (is (= (set (updated-contents action
                                                [["Obi-Wan Kenobi"]]
                                                [["Luke Skywalker"]]))
                         (set (rows-for-table table)))))
                (io/delete-file file)))

            ;; TODO we can deduplicate a lot of code in this test
            (testing "with duplicate normalized _mb_row_id columns in the CSV file"
              (with-upload-table! [table (create-upload-table!)]
                (let [csv-rows ["_mb_row_id,name,-MB-ROW-ID" "1000,Luke Skywalker,1001"]
                      file     (csv-file-with csv-rows)]
                  (is (= {:row-count 1}
                         (update-csv! action {:file file, :table-id (:id table)})))
                  (testing "Check the data was uploaded into the table, but the _mb_row_id was ignored"
                    (is (= (set (updated-contents action
                                                  [["Obi-Wan Kenobi"]]
                                                  [["Luke Skywalker"]]))
                           (set (rows-for-table table)))))
                  (io/delete-file file))))))))))

(deftest update-duplicate-header-csv-test
  (mt/test-drivers (mt/normal-drivers-with-feature :uploads)
    (doseq [action (actions-to-test driver/*driver*)]
      (testing (action-testing-str action)
        (testing "Update should fail if the CSV file contains duplicate column names"
          (with-upload-table! [table (create-upload-table!)]
            (let [csv-rows ["name,name" "Luke Skywalker,Darth Vader"]
                  file     (csv-file-with csv-rows (mt/random-name))]
              (is (= {:message "The CSV file contains duplicate column names."
                      :data    {:status-code 422}}
                     (catch-ex-info (update-csv! action {:file file, :table-id (:id table)}))))
              (testing "Check the data was not uploaded into the table"
                (is (= (rows-with-auto-pk
                        [["Obi-Wan Kenobi"]])
                       (rows-for-table table))))
              (io/delete-file file))))))))

(deftest update-reorder-header-csv-test
  (mt/test-drivers (mt/normal-drivers-with-feature :uploads)
    (doseq [action (actions-to-test driver/*driver*)]
      (testing (action-testing-str action)
        (testing "Append should handle the columns in the CSV file being reordered"
          (with-upload-table! [table (create-upload-table!
                                      :col->upload-type (columns-with-auto-pk
                                                         (ordered-map/ordered-map
                                                          :name vchar-type
                                                          :shame vchar-type))
                                      :rows [["Obi-Wan Kenobi" "No one really knows me"]])]
            (let [csv-rows ["shame,name" "Nothing - you can't prove it,Puke Nightstalker"]
                  file     (csv-file-with csv-rows)]

              (testing "The new row is inserted with the values correctly reordered"
                (is (= {:row-count 1} (update-csv! action {:file file, :table-id (:id table)})))
                (is (= (set (updated-contents action
                                              [["Obi-Wan Kenobi" "No one really knows me"]]
                                              [["Puke Nightstalker" "Nothing - you can't prove it"]]))
                       (set (rows-for-table table)))))
              (io/delete-file file))))))))

(deftest update-new-column-test
  (mt/test-drivers (mt/normal-drivers-with-feature :uploads)
    (doseq [action (actions-to-test driver/*driver*)]
      (testing (action-testing-str action)
        (with-uploads-enabled!
          (testing "Append should handle new columns being added in the latest CSV"
            (with-upload-table! [table (create-upload-table!)]
             ;; Reorder as well for good measure
              (let [csv-rows ["game,name" "Witticisms,Fluke Skytalker"]
                    file     (csv-file-with csv-rows)]
                (testing "The new row is inserted with the values correctly reordered"
                  (is (= {:row-count 1} (update-csv! action {:file file, :table-id (:id table)})))
                  (is (= (set (updated-contents action
                                                [["Obi-Wan Kenobi" nil]]
                                                [["Fluke Skytalker" "Witticisms"]]))
                         (set (rows-for-table table)))))
                (io/delete-file file)))))))))

(deftest update-new-non-ascii-column-test
  (mt/test-drivers (mt/normal-drivers-with-feature :uploads)
    (doseq [action (actions-to-test driver/*driver*)]
      (testing (action-testing-str action)
        (with-uploads-enabled!
          (testing "Append should handle new non-ascii columns being added in the latest CSV"
            (with-upload-table! [table (create-upload-table!)]
              (is (= (header-with-auto-pk ["Name"])
                     (column-display-names-for-table table)))
             ;; Reorder as well for good measure
              (let [csv-rows ["α,name"
                              "omega,Everything"]
                    file     (csv-file-with csv-rows)]
                (testing "The new row is inserted with the values correctly reordered"
                  (is (= {:row-count 1} (update-csv! action {:file file, :table-id (:id table)})))
                  (is (= (header-with-auto-pk ["name" "α"])
                         (column-display-names-for-table table)))
                  (is (= (set (updated-contents action
                                                [["Obi-Wan Kenobi" nil]]
                                                [["Everything" "omega"]]))
                         (set (rows-for-table table)))))
                (io/delete-file file)))))))))

(deftest update-new-non-ascii-column-onto-non-ascii-test
  (mt/test-drivers (mt/normal-drivers-with-feature :uploads)
    (doseq [action (actions-to-test driver/*driver*)]
      (testing (action-testing-str action)
        (with-uploads-enabled!
         (testing "Append should handle new non-ascii columns being added in the latest CSV"
           (with-upload-table! [table (create-upload-table!
                                       :col->upload-type (columns-with-auto-pk {"α" ::upload-types/varchar-255}))]
             ;; We can't type a literal uppercase Alpha, as our whitespace linter will complain.
             (is (= (header-with-auto-pk [(u/upper-case-en "α")])
                    (column-display-names-for-table table)))
             ;; Reorder as well for good measure
             (let [csv-rows ["α,name"
                             "omega,Everything"]
                   file     (csv-file-with csv-rows)]
               (testing "The new row is inserted with the values correctly reordered"
                 (is (= {:row-count 1} (update-csv! action {:file file, :table-id (:id table)})))
                 (is (= (header-with-auto-pk [(u/upper-case-en "α") "name"])
                        (column-display-names-for-table table)))
                 (is (= (set (updated-contents action
                                               [["Obi-Wan Kenobi" nil]]
                                               [["omega" "Everything"]]))
                        (set (rows-for-table table)))))
               (io/delete-file file)))))))))

(deftest update-type-mismatch-test
  (mt/test-drivers (mt/normal-drivers-with-feature :uploads)
    (doseq [action (actions-to-test driver/*driver*)]
      (testing (action-testing-str action)
        (with-mysql-local-infile-on-and-off
          (testing "Append fails if the CSV file contains values that don't match the column types"
            ;; for drivers that insert rows in chunks, we change the chunk size to 1 so that we can test that the
            ;; inserted rows are rolled back
            (binding [driver/*insert-chunk-rows* 1]
              (doseq [auto-pk-column? (if (auto-pk-column?)
                                        [true false]
                                        [false])]
                (testing (str "\nFor a table that has " (if auto-pk-column? "an" " no") " automatically generated PK already")
                  (doseq [{:keys [upload-type valid invalid msg]}
                          (cond-> [{:upload-type int-type
                                    :valid       1
                                    :invalid     "not an int"
                                    :msg         "'not an int' is not a recognizable number"}
                                   {:upload-type float-type
                                    :valid       1.1
                                    :invalid     "not a float"
                                    :msg         "'not a float' is not a recognizable number"}
                                   {:upload-type bool-type
                                    :valid       true
                                    :invalid     "correct"
                                    :msg         "'correct' is not a recognizable boolean"}
                                   {:upload-type date-type
                                    :valid       #t "2000-01-01"
                                    :invalid     "2023-01-01T00:00:00"
                                    :msg         "'2023-01-01T00:00:00' is not a recognizable date"}
                                   {:upload-type datetime-type
                                    :valid       #t "2000-01-01T00:00:00"
                                    :invalid     "2023-01-01T00:00:00+01"
                                    :msg         "'2023-01-01T00:00:00+01' is not a recognizable datetime"}]
                            (driver/upload-type->database-type driver/*driver* ::upload/offset-datetime)
                            (conj {:upload-type offset-dt-type
                                   :valid       #t "2000-01-01T00:00:00+01"
                                   :invalid     "2023-01-01T00:00:00[Europe/Helsinki]"
                                   :msg         "'2023-01-01T00:00:00[Europe/Helsinki]' is not a recognizable zoned datetime"}))]
                    (testing (str "\nTry to upload an invalid value for " upload-type)
                      (with-upload-table!
                        [table (create-upload-table!
                                {:col->upload-type (columns-with-auto-pk
                                                    (ordered-map/ordered-map
                                                     :test_column upload-type
                                                     :name        vchar-type))
                                 :rows             [[valid "Obi-Wan Kenobi"]]})]
                        (let [;; The CSV contains 50 valid rows and 1 invalid row
                              csv-rows `["test_column,name" ~@(repeat 50 (str valid ",Darth Vadar")) ~(str invalid ",Luke Skywalker")]
                              file  (csv-file-with csv-rows)]
                          (testing "\nShould return an appropriate error message"
                            (is (= {:message msg
                                    :data    {:status-code 422}}
                                   (catch-ex-info (update-csv! action {:file file, :table-id (:id table)})))))
                          ;; TODO in future it would be good to enhance ::replace to be atomic, i.e. to preserve the existing row
                          (testing "\nCheck the data was not uploaded into the table"
                            (is (= (case action ::upload/append 1 ::upload/replace 0)
                                   (count (rows-for-table table)))))
                          (io/delete-file file))))))))))))))

;; FIXME: uploading to a varchar-255 column can fail if the text is too long
;; We ideally want to change the column type to text if we detect this will happen, but that's difficult
;; currently because we don't store the character length of the column. e.g. a varchar(255) column in postgres
;; will have `varchar` as the database_type in metabase_field.
;; In any case, this test documents the current behaviour
(deftest update-too-long-for-varchar-255-test
  (mt/test-drivers (filter (fn [driver]
                             ;; use of varchar(255) is not universal for all drivers, so only test drivers that
                             ;; have different database types for varchar(255) and text
                             (apply not= (->> [vchar-type text-type]
                                              (map #(keyword "metabase.upload" (name %)))
                                              (map (partial driver/upload-type->database-type driver)))))
                           (mt/normal-drivers-with-feature :uploads))
    (doseq [action (actions-to-test driver/*driver*)]
      (testing (action-testing-str action)
        (with-mysql-local-infile-off
          (testing "Fails if the CSV file contains string values that are too long for the column"
            ;; for drivers that insert rows in chunks, we change the chunk size to 1 so that we can test that the
            ;; inserted rows are rolled back
            (binding [driver/*insert-chunk-rows* 1]
              (with-upload-table!
                [table (create-upload-table! {:col->upload-type (columns-with-auto-pk
                                                                 (ordered-map/ordered-map
                                                                  :test_column vchar-type))
                                              :rows             [["valid"]]})]
                (let [csv-rows `["test_column" ~@(repeat 50 "valid too") ~(apply str (repeat 256 "x"))]
                      file  (csv-file-with csv-rows)]
                  (testing "\nShould return an appropriate error message"
                    (is (=? {;; the error message is different for different drivers, but postgres and mysql have "too long" in the message
                             :message #"[\s\S]*too long[\s\S]*"
                             :data    {:status-code 422}}
                            (catch-ex-info (update-csv! action {:file file, :table-id (:id table)})))))
                  (testing "\nCheck the data was not uploaded into the table"
                    ;; TODO in future it would be good to enhance ::replace to be atomic, i.e. to preserve the existing row
                    (is (= (case action ::upload/append 1 ::upload/replace 0)
                           (count (rows-for-table table))))))))))))))

(deftest update-too-long-for-varchar-255-mysql-local-infile-test
  (mt/test-driver :mysql
    (doseq [action (actions-to-test driver/*driver*)]
      (testing (action-testing-str action)
        (with-mysql-local-infile-on
          (testing "Append succeeds if the CSV file is uploaded to MySQL and contains a string value that is too long for the column"
            ;; for drivers that insert rows in chunks, we change the chunk size to 1 so that we can test that the
            ;; inserted rows are rolled back
            (binding [driver/*insert-chunk-rows* 1]
              (let [upload-type vchar-type,
                    uncoerced   (apply str (repeat 256 "x"))
                    coerced     (apply str (repeat 255 "x"))]
                (testing (format "\nUploading %s into a column of type %s should be coerced to %s"
                                 uncoerced (name upload-type) coerced)
                  (with-upload-table!
                    [table (create-upload-table! {:col->upload-type (columns-with-auto-pk
                                                                     (ordered-map/ordered-map :test_column upload-type))
                                                  :rows             []})]
                    (let [csv-rows ["test_column" uncoerced]
                          file (csv-file-with csv-rows)]
                      (testing "\nAppend should succeed"
                        (is (= {:row-count 1}
                               (update-csv! action {:file file, :table-id (:id table)}))))
                      (testing "\nCheck the value was coerced correctly"
                        (is (= (rows-with-auto-pk [[coerced]])
                               (rows-for-table table))))
                      (io/delete-file file))))))))))))

(defn- round-floats
  "Round all floats to have n digits of precision."
  [digits-precision rows]
  (let [round-if-float #(if (float? %) (u/round-to-decimals digits-precision %) %)]
    (mapv (partial mapv round-if-float) rows)))

(deftest update-type-coercion-test
  (mt/test-drivers (mt/normal-drivers-with-feature :uploads)
    (doseq [action (actions-to-test driver/*driver*)]
      (testing (action-testing-str action)
        (with-mysql-local-infile-on-and-off
          (testing "Append succeeds if the CSV file contains values that don't match the column types, but are coercible"
            ;; for drivers that insert rows in chunks, we change the chunk size to 1 so that we can test that the
            ;; inserted rows are rolled back
            (binding [driver/*insert-chunk-rows* 1]
              (doseq [{:keys [upload-type uncoerced coerced fail-msg] :as args}
                      [(merge
                        {:upload-type int-type, :uncoerced "2.1"}
                        (if (= driver/*driver* :redshift)
                          ;; TODO: redshift doesn't allow promotion of ints to floats
                          {:fail-msg "There's a value with the wrong type \\('double precision'\\) in the 'test_column' column"}
                          {:coerced 2.1})) ; column is promoted to float
                       {:upload-type int-type,   :uncoerced "2.0",        :coerced 2} ; value is coerced to int
                       {:upload-type float-type, :uncoerced "2",          :coerced 2.0}
                       {:upload-type bool-type,  :uncoerced "0",          :coerced false}
                       {:upload-type bool-type,  :uncoerced "1.0",        :fail-msg "'1.0' is not a recognizable boolean"}
                       {:upload-type bool-type,  :uncoerced "0.0",        :fail-msg "'0.0' is not a recognizable boolean"}
                       {:upload-type int-type,   :uncoerced "01/01/2012", :fail-msg "'01/01/2012' is not a recognizable number"}]]
                (with-upload-table!
                  [table (create-upload-table! {:col->upload-type (columns-with-auto-pk
                                                                   (ordered-map/ordered-map :test_column upload-type))
                                                :rows             []})]
                  (let [csv-rows ["test_column" uncoerced]
                        file     (csv-file-with csv-rows)
                        update!  (fn []
                                   (update-csv! action {:file file, :table-id (:id table)}))]
                    (if (contains? args :coerced)
                      (testing (format "\nUploading %s into a column of type %s should be coerced to %s"
                                       uncoerced (name upload-type) coerced)
                        (testing "\nAppend should succeed"
                          (is (= {:row-count 1}
                                 (update!))))
                        (is (= (rows-with-auto-pk [[coerced]])
                               ;; Clickhouse uses 32-bit floats, so we must account for that loss in precision.
                               ;; In this case, 2.1 ⇒ 2.0999999046325684
                               (round-floats 6 (rows-for-table table)))))
                      (testing (format "\nUploading %s into a column of type %s should fail to coerce"
                                       uncoerced (name upload-type))
                        (is (thrown-with-msg?
                             clojure.lang.ExceptionInfo
                             (re-pattern (str "^" fail-msg "$"))
                             (update!)))))
                    (io/delete-file file)))))))))))

(deftest update-promotion-multiple-columns-test
  (mt/test-drivers (disj (mt/normal-drivers-with-feature :uploads) :redshift) ; redshift doesn't support promotion
    (doseq [action (actions-to-test driver/*driver*)]
      (testing (action-testing-str action)
        (with-mysql-local-infile-on-and-off
          (testing "Append succeeds if the CSV file contains multiple columns that don't match the existing column types, but are coercible"
            (binding [driver/*insert-chunk-rows* 1]
              (let [upload-type int-type
                    uncoerced   "2.1"
                    coerced     2.1]
                (with-upload-table!
                  [table (create-upload-table! {:col->upload-type (columns-with-auto-pk
                                                                   (ordered-map/ordered-map
                                                                    :column_1 upload-type
                                                                    :column_2 upload-type))
                                                :rows             []})]
                  (let [csv-rows ["column_1,column_2"
                                  (str uncoerced "," uncoerced)]
                        file     (csv-file-with csv-rows)
                        update!  #(update-csv! action {:file file, :table-id (:id table)})]
                    (testing (format "\nUploading %s into a column of type %s should be coerced to %s"
                                     uncoerced (name upload-type) coerced)
                      (testing "\nAppend should succeed"
                        (is (= {:row-count 1}
                               (update!))))
                      (is (= (rows-with-auto-pk [[coerced coerced]])
                             ;; Clickhouse uses 32-bit floats, so we must account for that loss in precision.
                             ;; In this case, 2.1 ⇒ 2.0999999046325684
                             (round-floats 6 (rows-for-table table)))))))))))))))

(deftest create-from-csv-int-and-float-test
  (testing "Creation should handle a mix of int and float-or-int values in any order"
    (mt/test-drivers (mt/normal-drivers-with-feature :uploads)
      (with-mysql-local-infile-on-and-off
        (with-upload-table!
          [table (create-from-csv-and-sync-with-defaults!
                  :file (csv-file-with ["float-1,float-2"
                                        "1,   1.0"
                                        "1.0, 1"]))]
          (testing "Check the data was uploaded into the table correctly"
            (is (= (rows-with-auto-pk [[1.0 1.0]
                                       [1.0 1.0]])
                   (rows-for-table table)))))))))

(deftest create-from-csv-int-and-non-integral-float-test
  (testing "Creation should handle a mix of int and float values in any order"
    (mt/test-drivers (mt/normal-drivers-with-feature :uploads)
      (with-mysql-local-infile-on-and-off
        (with-upload-table!
          [table (create-from-csv-and-sync-with-defaults!
                  :file (csv-file-with ["float-1,float-2"
                                        "1,   1.1"
                                        "1.1, 1"]))]
          (testing "Check the data was uploaded into the table correctly"
            (is (= (rows-with-auto-pk [[1.0 1.1]
                                       [1.1 1.0]])
                   ;; Clickhouse uses 32-bit floats, so we must account for that loss in precision.
                   ;; In this case, 1.1 ⇒ 1.10000002384185791015625
                   (round-floats 7 (rows-for-table table))))))))))

(deftest update-from-csv-int-and-float-test
  (mt/test-drivers (mt/normal-drivers-with-feature :uploads)
    (doseq [action (actions-to-test driver/*driver*)]
      (testing (action-testing-str action)
        (testing "Append should handle a mix of int and float-or-int values being appended to an int column"
          (with-upload-table! [table (create-upload-table!
                                      :col->upload-type (columns-with-auto-pk
                                                         (ordered-map/ordered-map
                                                          :number_1 int-type
                                                          :number_2 int-type))
                                      :rows [[1, 1]])]

            (let [csv-rows ["number-1, number-2"
                            "1.0, 1"
                            "1  , 1.0"]
                  file     (csv-file-with csv-rows)]
              (is (some? (update-csv! action {:file file, :table-id (:id table)})))
              (is (= (set (updated-contents action
                                            [[1 1]]
                                            [[1 1]
                                             [1 1]]))
                     (set (rows-for-table table))))
              (io/delete-file file))))))))

(defn- upload-table-exists? [table]
  ;; we don't need to worry about sql injection here
  (-> (format "SELECT 1 FROM information_schema.tables WHERE table_name = '%s'" (:name table))
      ((fn [sql] {:database (:db_id table), :type :native, :native {:query sql}}))
      qp/process-query
      :row_count
      pos?))

(deftest delete-upload!-test
  (mt/test-drivers (mt/normal-drivers-with-feature :uploads)
    (doseq [archive-cards? [true false]]
      (with-upload-table! [table (create-upload-table!
                                  :col->upload-type (columns-with-auto-pk
                                                     (ordered-map/ordered-map
                                                      :number_1 int-type
                                                      :number_2 int-type))
                                  :rows [[1, 1]])]

        (testing "The upload table and the expected application data are created\n"
          (is (upload-table-exists? table))
          (is (seq (t2/select :model/Table :id (:id table))))
          (testing "The expected metadata is synchronously sync'd"
            (is (seq (t2/select :model/Field :table_id (:id table))))))

        (mt/with-temp [:model/Card {card-id :id} {:table_id (:id table)}]
          (is (false? (:archived (t2/select-one :model/Card :id card-id))))

          (upload/delete-upload! table :archive-cards? archive-cards?)

          (testing (format "We %s the related cards if archive-cards? is %s"
                           (if archive-cards? "archive" "do not archive")
                           archive-cards?)
            (is (= archive-cards? (:archived (t2/select-one :model/Card :id card-id)))))

          (testing "The upload table and related application data are deleted\n"
            (is (not (upload-table-exists? table)))
            (is (= [false] (mapv :active (t2/select :model/Table :id (:id table)))))
            (testing "We do not clean up any of the child resources synchronously (yet?)"
              (is (seq (t2/select :model/Field :table_id (:id table)))))))))))

(deftest create-csv-from-really-long-names-test
  (testing "Upload a CSV file with unique column names that get sanitized to the same string"
    (mt/test-drivers (mt/normal-drivers-with-feature :uploads)
      (with-mysql-local-infile-on-and-off
        (let [long-string (str (str/join (repeat 1000 "really_")) "long")
              header      (str (str "a_" long-string ",")
                               (str "b_" long-string ",")
                               (str "b_" long-string "_with_a"))]
          (with-upload-table!
            [table (create-from-csv-and-sync-with-defaults!
                    :file (csv-file-with [header
                                          "a,b1,b2"]))]
            (testing "Table and Fields exist after sync"
              (testing "Check the data was uploaded into the table correctly"
                (let [column-names (column-names-for-table table)]
                  (testing "We preserve names where possible"
                    (let [header-names (->> (str/split header #",")
                                            (map (partial #'upload/normalize-column-name driver/*driver*)))]
                      (is (every? (set column-names) header-names))))
                  (testing "We preserve prefixes where_possible"
                    (is (= {"a_really" 1
                            "b_really" 2}
                           (dissoc (frequencies (map #(subs % 0 8) column-names))
                                   "_mb_row_")))))))))))))

(deftest append-with-really-long-names-test
  (testing "Upload a CSV file with unique column names that get sanitized to the same string"
    (mt/test-drivers (mt/normal-drivers-with-feature :uploads)
      (with-mysql-local-infile-on-and-off
        (let [long-string  (str (str/join (repeat 1000 "really_")) "long")
              header       (str (str "a_" long-string ",")
                                (str "b_" long-string))
              original-row "a,b"
              appended-row "A,B"]
          (with-upload-table!
            [table (create-from-csv-and-sync-with-defaults!
                    :file (csv-file-with [header original-row]))]
            (let [csv-rows [header appended-row]
                  file     (csv-file-with csv-rows (mt/random-name))]
              (is (= {:row-count 1}
                     (update-csv! ::upload/append {:file file, :table-id (:id table)})))
              (testing "Check the data was appended into the table"
                (is (= (set
                        (rows-with-auto-pk
                         (concat
                          (csv/read-csv original-row)
                          (csv/read-csv appended-row))))
                       (set (rows-for-table table)))))
              (io/delete-file file))))))))

(deftest append-with-preserved-display-name-test
  (testing "Upload a CSV file with unique column names that get sanitized to the same string\n"
    (mt/test-drivers (mt/normal-drivers-with-feature :uploads)
      (with-mysql-local-infile-on-and-off
        (let [data         ["a" 1]
              bespoke-name "i put a lot of effort into this display name"]
          (with-upload-table!
            [table (create-from-csv-and-sync-with-defaults!
                    :file (csv-file-with data))]
            (testing "Initially, we get the inferred name"
              (is (= (header-with-auto-pk ["A"])
                     (column-display-names-for-table table))))
            (testing "But we can configure it"
              (t2/update! :model/Field {:name "a" :table_id (:id table)}
                          {:display_name bespoke-name})
              (is (= (header-with-auto-pk [bespoke-name])
                     (column-display-names-for-table table))))
            (let [file (csv-file-with data (mt/random-name))]
              (is (= {:row-count 1}
                     (update-csv! ::upload/append {:file file, :table-id (:id table)})))
              (testing "And our configuration is preserved when we append more data"
                (is (= (header-with-auto-pk [bespoke-name])
                       (column-display-names-for-table table))))
              (io/delete-file file))))))))

(deftest append-with-really-long-names-that-duplicate-test
  (testing "Upload a CSV file with unique column names that get sanitized to the same string"
    (mt/test-drivers (mt/normal-drivers-with-feature :uploads)
      (with-mysql-local-infile-on-and-off
        (let [long-string  (str (str/join (repeat 1000 "really_")) "long")
              header       (str (str "a_" long-string ",")
                                (str "b_" long-string ",")
                                (str "b_" long-string "_with_a"))
              original-row "a,b1,b2"
              appended-row "A,B1,B2"]
          (with-upload-table!
            [table (create-from-csv-and-sync-with-defaults!
                    :file (csv-file-with [header original-row]))]
            (let [csv-rows [header appended-row]
                  file     (csv-file-with csv-rows (mt/random-name))]
             ;; TODO: we should be able to make this work with smarter truncation
              (is (= {:message "The CSV file contains duplicate column names."
                      :data    {:status-code 422}}
                     (catch-ex-info (update-csv! ::upload/append {:file file, :table-id (:id table)}))))
              (testing "Check the data was not uploaded into the table"
                (is (= (rows-with-auto-pk (csv/read-csv original-row))
                       (rows-for-table table))))
              (io/delete-file file))))))))

(driver/register! ::short-column-test-driver)
(defmethod driver/column-name-length-limit ::short-column-test-driver [_] 10)

(deftest unique-long-column-names-test
  (let [original ["αbcdεf_αbcdεf"     "αbcdεfg_αbcdεf"   "αbc_2_etc_αbcdεf" "αbc_3_xyz_αbcdεf"]
        expected [:%CE%B1bcd%  :%_852c229f :%CE%B1bc_2 :%CE%B1bc_3]
        displays ["αbcdεf" "αbcdεfg" "αbc 2 etc" "αbc 3 xyz"]]
    (is (= expected (#'upload/derive-column-names ::short-column-test-driver original)))
    (mt/with-dynamic-redefs [upload/max-bytes (constantly 10)]
      (is (= displays
             ;; The whitespace linter rejects capital greek characters that look like their roman equivalents.
             ;; This is the easiest way to work around the capitalization of alpha.
             (map u/lower-case-en
                  (#'upload/derive-display-names ::short-column-test-driver original)))))))
