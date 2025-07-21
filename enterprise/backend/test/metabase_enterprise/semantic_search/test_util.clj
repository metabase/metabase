(ns metabase-enterprise.semantic-search.test-util
  (:require
   [metabase-enterprise.semantic-search.db :as semantic.db]
   [metabase-enterprise.semantic-search.embedding :as semantic.embedding]
   [metabase-enterprise.semantic-search.index :as semantic.index]
   [metabase.search.core :as search.core]
   [metabase.search.ingestion :as search.ingestion]
   [metabase.test :as mt]
   [metabase.util.log :as log]
   [nano-id.core :as nano-id]
   [next.jdbc :as jdbc]))

(def ^:private init-delay
  (delay
    (when-not @semantic.db/data-source
      (semantic.db/init-db!))))

(defn once-fixture [f]
  (when semantic.db/db-url
    @init-delay
    (f)))

(def mock-embeddings
  "Static mapping from strings to (made-up) 4-dimensional embedding vectors for testing. Each pair of strings represents a
  document and a search query that should be most semantically similar to it, according to the embeddings."
  {"Dog Training Guide"    [0.12 -0.34  0.56 -0.78]
   "puppy"                 [0.13 -0.33  0.57 -0.77]
   "Bird Watching Tips"    [0.23  0.45 -0.67  0.89]
   "avian"                 [0.24  0.46 -0.66  0.88]
   "Cat Behavior Study"    [0.11 -0.22  0.33 -0.44]
   "feline"                [0.12 -0.21  0.34 -0.43]
   "Horse Racing Analysis" [0.55  0.66 -0.77  0.88]
   "equine"                [0.56  0.67 -0.76  0.87]
   "Fish Tank Setup"       [0.10  0.20 -0.30  0.40]
   "aquatic"               [0.11  0.21 -0.29  0.39]
   "Elephant Migration"    [0.15 -0.25  0.35 -0.45]
   "pachyderm"             [0.16 -0.24  0.36 -0.44]
   "Lion Pride Dynamics"   [0.31  0.42 -0.53  0.64]
   "predator"              [0.32  0.43 -0.52  0.63]
   "Penguin Colony Study"  [0.75 -0.86  0.97 -0.18]
   "Antarctic wildlife"    [0.76 -0.85  0.96 -0.17]
   "Whale Communication"   [0.29  0.38 -0.47  0.56]
   "marine mammal"         [0.30  0.39 -0.46  0.55]
   "Tiger Conservation"    [0.65 -0.74  0.83 -0.92]
   "endangered species"    [0.66 -0.73  0.84 -0.91]
   "Butterfly Migration"   [0.17  0.28 -0.39  0.50]
   "insect patterns"       [0.18  0.29 -0.38  0.49]})

(defn get-mock-embedding
  "Lookup the embedding for `text` in [[mock-embeddings]]."
  [text]
  (get mock-embeddings text [0.01 0.02 0.03 0.04]))

(defn get-mock-embeddings-batch
  "Lookup embeddings for multiple texts in [[mock-embeddings]]."
  [texts]
  (mapv get-mock-embedding texts))

(def mock-documents
  [{:model "card"
    :id "123"
    :searchable_text "Dog Training Guide"
    :created_at #t "2025-01-01T12:00:00Z"
    :creator_id 1
    :archived false
    :legacy_input {:model "card" :id "123"}
    :metadata {:title "Dog Training Guide" :description "How to teach an old dog new tricks"}}
   {:model "dashboard"
    :id "456"
    :searchable_text "Elephant Migration"
    :created_at #t "2025-02-01T12:00:00Z"
    :creator_id 2
    :archived true
    :legacy_input {:model "dashboard" :id "456"}
    :metadata {:title "Elephant Migration" :description "How do elephants deal with schema upgrades?"}}])

(defn filter-for-mock-embeddings
  "Filter results to only include items whose names are keys in mock-embeddings map."
  [results]
  (filter #(contains? mock-embeddings (:name %)) results))

(defmacro with-mocked-embeddings! [& body]
  ;; TODO: it's warning about not using with-redefs outside of tests but we *are* using it in tests
  #_:clj-kondo/ignore
  `(with-redefs [semantic.embedding/model-dimensions (constantly 4)
                 semantic.embedding/pull-model (constantly nil)
                 semantic.embedding/get-embeddings-batch get-mock-embeddings-batch
                 semantic.embedding/get-embedding get-mock-embedding]
     ~@body))

(defmacro with-temp-index-table! [& body]
  `(let [test-table-name# (keyword (str "test_search_index_" (nano-id/nano-id)))]
     (binding [semantic.index/*index-table-name* test-table-name#
               search.ingestion/*force-sync* true]
       (try
         (mt/as-admin
           (semantic.index/create-index-table! {:force-reset? true}))
         ~@body
         (finally
           (try
             (mt/as-admin
               (semantic.index/drop-index-table!))
             (catch Exception e#
               (log/error "Warning: failed to clean up test table" test-table-name# ":" (.getMessage e#)))))))))

(defmacro with-indexable-documents!
  "Add a collection of test documents to that can be indexed to the appdb."
  [& body]
  `(mt/dataset ~(symbol "test-data")
     (mt/with-temp [:model/Collection       {col1# :id}  {:name "Wildlife Collection" :archived false}

                    :model/Collection       {col2# :id}  {:name "Archived Animals" :archived true}

                    :model/Collection       {col3# :id}  {:name "Cryptozoology", :archived false}

                    :model/Card             {card1# :id} {:name "Dog Training Guide" :collection_id col1# :creator_id (mt/user->id :crowberto) :archived false}

                    :model/Card             {}           {:name "Bird Watching Tips" :collection_id col1# :creator_id (mt/user->id :rasta) :archived false}

                    :model/Card             {}           {:name "Cat Behavior Study" :collection_id col2# :creator_id (mt/user->id :crowberto) :archived true}

                    :model/Card             {}           {:name "Horse Racing Analysis" :collection_id col1# :creator_id (mt/user->id :rasta) :archived false}

                    :model/Card             {}           {:name "Fish Tank Setup" :collection_id col2# :creator_id (mt/user->id :crowberto) :archived true}

                    :model/Card             {}           {:name "Bigfoot Sightings" :collection_id col3# :creator_id (mt/user->id :crowberto), :archived false}

                    :model/ModerationReview {}           {:moderated_item_type "card"

                                                          :moderated_item_id card1#

                                                          :moderator_id (mt/user->id :crowberto)

                                                          :status "verified"

                                                          :most_recent true}

                    :model/Dashboard        {}           {:name "Elephant Migration" :collection_id col1# :creator_id (mt/user->id :rasta) :archived false}

                    :model/Dashboard        {}           {:name "Lion Pride Dynamics" :collection_id col1# :creator_id (mt/user->id :crowberto) :archived false}

                    :model/Dashboard        {}           {:name "Penguin Colony Study" :collection_id col2# :creator_id (mt/user->id :rasta) :archived true}

                    :model/Dashboard        {}           {:name "Whale Communication" :collection_id col1# :creator_id (mt/user->id :crowberto) :archived false}

                    :model/Dashboard        {}           {:name "Tiger Conservation" :collection_id col2# :creator_id (mt/user->id :rasta) :archived true}

                    :model/Dashboard        {}           {:name "Loch Ness Stuff" :collection_id col3# :creator_id (mt/user->id :crowberto), :archived false}

                    :model/Database         {db-id# :id} {:name "Animal Database"}

                    :model/Table            {}           {:name "Species Table", :db_id db-id#}

                    :model/Table            {}           {:name "Monsters Table", :db_id db-id#, :active true}]
       ~@body)))

(defmacro with-index!
  "Ensure a clean, small index for testing populated with a few collections, cards, and dashboards."
  [& body]
  `(with-indexable-documents!
     (with-temp-index-table!
       (search.core/reindex! :search.engine/semantic {:force-reset true})
       ~@body)))

(defn table-exists-in-db?
  "Check if a table actually exists in the database"
  [table-name]
  (when table-name
    (try
      (let [result (jdbc/execute! @semantic.db/data-source
                                  ["SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = ?)"
                                   (name table-name)])]
        (-> result first vals first))
      (catch Exception _ false))))

(defn table-has-index?
  [table-name index-name]
  (when table-name
    (try
      (let [result (jdbc/execute! @semantic.db/data-source
                                  ["SELECT EXISTS (SELECT 1 FROM pg_indexes WHERE tablename = ? AND indexname = ?)"
                                   (name table-name)
                                   (name index-name)])]
        (-> result first vals first))
      (catch Exception _ false))))
