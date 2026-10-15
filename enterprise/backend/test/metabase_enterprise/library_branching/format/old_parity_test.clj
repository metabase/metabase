(ns metabase-enterprise.library-branching.format.old-parity-test
  "The old-format decoder against the old module: the files that remote sync writes for content of the app DB decode
  to the items that library branching reads from that content."
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.library-branching.format.claims :as claims]
   [metabase-enterprise.library-branching.format.codec :as codec]
   [metabase-enterprise.library-branching.format.kinds :as kinds]
   [metabase-enterprise.library-branching.instance.app-db :as app-db]
   [metabase-enterprise.library-branching.instance.golden-test :as golden]
   [metabase-enterprise.remote-sync.impl :as remote-sync.impl]
   [metabase-enterprise.remote-sync.source.protocol :as source.p]
   [metabase-enterprise.remote-sync.test-helpers :as remote-sync.th]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2])
  (:import
   (java.nio.charset StandardCharsets)))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db))

(def ^:private library-tree
  "The entity ids of the collections of the Library in the golden content, each after its parent."
  ["LiBrArYcOlLeCtIoN0001" "dAtAcOlLeCtIoNiD00000" "mEtRiCsCoLlEcTiOnId00" "cOlQuErIeS0ExAmPlE2x1"
   "dAsHbOaRdScOlLeCtIoN1"])

(defn- remote-sync-export!
  "`{path bytes}`: the files of a full push of remote sync, with the Library synced and transforms on."
  []
  (doseq [eid library-tree]
    (t2/update! :model/Collection :entity_id eid {:is_remote_synced true}))
  (mt/with-model-cleanup [:model/RemoteSyncTask :model/RemoteSyncObject]
    (mt/with-temporary-setting-values [remote-sync-type :read-write remote-sync-transforms true]
      (let [task-id (t2/insert-returning-pk! :model/RemoteSyncTask {:sync_task_type "export"
                                                                    :initiated_by   (mt/user->id :rasta)})
            source  (remote-sync.th/create-mock-source)]
        (is (= :success (:status (remote-sync.impl/export! (source.p/snapshot source) task-id "Export" :force? true))))
        (update-vals (get @(:files-atom source) "main") #(.getBytes ^String % StandardCharsets/UTF_8))))))

(defn- model-of
  [^bytes b]
  (-> (codec/read-yaml b) :serdes/meta last :model))

(defn- sync-display-names
  "`{table-key display-name}`: the display name that warehouse sync gave each table of `table-keys`."
  [table-keys]
  (into {}
        (map (fn [[db schema table :as k]]
               [k (t2/select-one-fn :display_name :model/Table
                                    :db_id (t2/select-one-pk :model/Database :name db) :schema schema :name table)]))
        table-keys))

(deftest remote-sync-export-decodes-to-the-read-test
  (golden/do-with-golden-content
   (fn [golden]
     (let [files   (remote-sync-export!)
           python? #(= "PythonLibrary" (model-of (val %)))
           opts    {:table-names (sync-display-names (filter vector? (keys golden)))}]
       (testing "the files of remote sync decode to the items that a read of the same content gives"
         (is (= {:snapshot golden}
                (claims/decode kinds/codecs (into {} (remove python?) files) opts)))
         (is (= golden (select-keys (app-db/read-current) (keys golden)))))
       (testing "the built-in Python library is of a kind with no codec yet: its file is an item that does not decode"
         (is (= [:unknown-kind]
                (map :type (:findings (claims/decode kinds/codecs (into {} (filter python?) files) opts))))))))))
