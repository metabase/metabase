(ns metabase-enterprise.library-branching.instance.timeline-test
  "The app DB side of timelines: the content that the instance reads, `write!`, `current` and `trash!`, their laws,
  and the scenarios of the remote-sync timeline tests in library-branching form. Each test writes in a transaction
  that rolls back."
  (:require
   [clojure.test :refer :all]
   [clojure.test.check.clojure-test :refer [defspec]]
   [clojure.test.check.generators :as gen]
   [clojure.test.check.properties :as prop]
   [metabase-enterprise.library-branching.db :as library-branching.db]
   [metabase-enterprise.library-branching.engine.diff :as diff]
   [metabase-enterprise.library-branching.format.kinds.timeline :as format.timeline]
   [metabase-enterprise.library-branching.instance :as instance]
   [metabase-enterprise.library-branching.instance.app-db :as app-db]
   [metabase-enterprise.library-branching.instance.write-test :as write-test]
   [metabase.collections.test-utils :as collections.tu]
   [metabase.config.core :as config]
   [metabase.models.serialization :as serdes]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.timeline.models.timeline-event :as timeline-event]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

;; The tests open their own transactions, and the app DB must not be set up inside one.
(use-fixtures :once (fixtures/initialize :db :test-users))

;;; ---------------------------------------------------- Helpers ---------------------------------------------------

(defn- store [] (get app-db/kind-stores :timeline))

(defn- write! [id item] (instance/write! (store) id item))

(defn- current [id] (instance/current (store) id))

(defn- trash! [id] (instance/trash! (store) id))

(defn- timeline-item
  "The content of a timeline named `nm` at `place`, with the attributes `attrs`."
  ([nm place] (timeline-item nm place {}))
  ([nm place attrs]
   {:kind :timeline :name nm :place place :refs #{} :attrs attrs}))

(def ^:private launch
  {:id "lbTlLaunchEvent000001" :name "Launch" :timestamp "2024-03-01T10:00:00Z" :timezone "Europe/Paris"
   :time_matters true :icon "cake"})

(def ^:private outage
  {:id "lbTlOutageEvent000001" :name "Outage" :description "The API was down." :timestamp "2024-05-02T00:00:00.500Z"
   :timezone "UTC"})

(def ^:private releases-id "lbTlReleases000000001")
(def ^:private other-id "lbTlOther000000000001")

(def ^:private none {:created #{} :deleted #{} :updated #{}})

(defn- do-with-dashboards
  "Calls `f`, in a transaction that rolls back, with the Library, two Dashboards collections of it (the second inside
  the first), its Metrics collection, and a collection outside the Library."
  [f]
  (t2/with-transaction [_ nil {:rollback-only true}]
    (collections.tu/with-library [{:keys [library metrics]}]
      (let [dashboards (t2/insert-returning-instance! :model/Collection
                                                      {:name     "Dashboards"
                                                       :type     "library-dashboards"
                                                       :location (write-test/children-location library)})
            team       (t2/insert-returning-instance! :model/Collection
                                                      {:name     "Team"
                                                       :type     "library-dashboards"
                                                       :location (write-test/children-location dashboards)})
            outside    (t2/insert-returning-instance! :model/Collection {:name "Outside" :location "/"})]
        (f {:library library :dashboards dashboards :team team :metrics metrics :outside outside})))))

(defn- insert-timeline!
  "Inserts a timeline as a person's save does, and returns its row."
  [collection-id nm & {:as more}]
  (t2/insert-returning-instance! :model/Timeline (merge {:name          nm
                                                         :collection_id collection-id
                                                         :icon          "star"
                                                         :creator_id    (mt/user->id :rasta)}
                                                        more)))

(defn- insert-event!
  "Inserts an event of timeline row `timeline` as a person's save does, and returns its row."
  [timeline nm timestamp & {:as more}]
  (t2/insert-returning-instance! :model/TimelineEvent (merge {:timeline_id  (:id timeline)
                                                              :name         nm
                                                              :timestamp    (java.time.OffsetDateTime/parse timestamp)
                                                              :timezone     "UTC"
                                                              :time_matters false
                                                              :icon         "star"
                                                              :creator_id   (mt/user->id :rasta)}
                                                             more)))

(defn- rows
  "Every column of the timeline rows of the identities `ids`, and of every event row."
  [ids]
  [(t2/select :timeline :entity_id [:in ids] {:order-by [:id]})
   (t2/select :timeline_event {:order-by [:id]})])

(defn- event-row [entity-id] (t2/select-one :timeline_event :entity_id entity-id))

;;; ---------------------------------------------------- Content ---------------------------------------------------

(deftest timeline-content-test
  (testing "a timeline: its name, its collection as the place, no references, and its events not in the trash"
    (do-with-dashboards
     (fn [{:keys [dashboards]}]
       (let [tl (insert-timeline! (:id dashboards) "lb releases" :description "What we shipped." :icon "bell")
             e1 (insert-event! tl "Launch" "2024-03-01T11:00:00+01:00" :timezone "Europe/Paris" :time_matters true
                               :icon "cake")
             e2 (insert-event! tl "Outage" "2024-02-01T00:00:00Z" :description "Down.")
             _  (insert-event! tl "Gone" "2024-01-01T00:00:00Z" :archived true)]
         (is (= (timeline-item "lb releases" (:entity_id dashboards)
                               {:description "What we shipped."
                                :icon        "bell"
                                :events      [{:id (:entity_id e2) :name "Outage" :description "Down."
                                               :timestamp "2024-02-01T00:00:00Z" :timezone "UTC"}
                                              {:id (:entity_id e1) :name "Launch" :timestamp "2024-03-01T10:00:00Z"
                                               :timezone "Europe/Paris" :time_matters true :icon "cake"}]})
                (get (app-db/read-current) (:entity_id tl))))
         (testing "the creators and the time stamps are not content"
           (let [before (get (app-db/read-current) (:entity_id tl))]
             (t2/update! :timeline (:id tl) {:creator_id (mt/user->id :crowberto)
                                             :created_at (java.time.OffsetDateTime/parse "2020-01-01T00:00:00Z")})
             (t2/update! :timeline_event (:id e1) {:creator_id (mt/user->id :crowberto)})
             (is (= before (get (app-db/read-current) (:entity_id tl))))))
         (testing "the removed icon balloons reads as the default icon, as Metabase reads it"
           (t2/update! :timeline (:id tl) {:icon "balloons"})
           (is (not (contains? (:attrs (get (app-db/read-current) (:entity_id tl))) :icon)))))))))

(deftest icons-test
  (testing "the icons of the format are the icons of Metabase"
    (is (= (set (rest timeline-event/Icon)) (set format.timeline/icons)))
    (is (= timeline-event/default-icon format.timeline/default-icon))))

(deftest local-changes-test
  (do-with-dashboards
   (fn [{:keys [dashboards team outside]}]
     (let [pushed (insert-timeline! (:id dashboards) "lb pushed" :description "Pushed.")
           event  (insert-event! pushed "Launch" "2024-03-01T10:00:00Z")
           base   (app-db/read-current)
           local  #(diff/diff base (app-db/read-current))
           tl-id  (:entity_id pushed)]
       (testing "M11-014, M11-023: a save of the timeline or of its event with no change leaves it synced"
         (t2/update! :model/Timeline (:id pushed) {:name "lb pushed" :description "Pushed."})
         (t2/update! :model/TimelineEvent (:id event) {:name "Launch"})
         (is (= none (local))))
       (testing "M11-074: a new Library timeline is a local create"
         (let [new-tl (insert-timeline! (:id team) "lb new")]
           (is (= (assoc none :created #{(:entity_id new-tl)}) (local)))
           (testing "M11-075: its event is content of the timeline, not an item"
             (let [new-event (insert-event! new-tl "First" "2024-01-01T00:00:00Z")]
               (is (= (assoc none :created #{(:entity_id new-tl)}) (local)))
               (is (not (contains? (app-db/read-current) (:entity_id new-event))))))
           (testing "M11-081: a never-pushed timeline that a person moves out of the Library is no change"
             (t2/update! :model/Timeline (:id new-tl) {:collection_id (:id outside)})
             (is (= none (local))))))
       (testing "M11-079: a timeline outside the Library is no change"
         (insert-timeline! (:id outside) "lb outside")
         (is (= none (local))))
       (testing "M11-076: an update of the timeline is a local update; the change back is no change"
         (t2/update! :model/Timeline (:id pushed) {:description "Changed."})
         (is (= (assoc none :updated #{tl-id}) (local)))
         (t2/update! :model/Timeline (:id pushed) {:description "Pushed."})
         (is (= none (local))))
       (testing "a change of an event, a new event and an event in the trash are local updates of the timeline"
         (doseq [[label change! undo!]
                 [["a new time" #(t2/update! :model/TimelineEvent (:id event)
                                             {:timestamp (java.time.OffsetDateTime/parse "2024-03-02T10:00:00Z")})
                   #(t2/update! :model/TimelineEvent (:id event)
                                {:timestamp (java.time.OffsetDateTime/parse "2024-03-01T10:00:00Z")})]
                  ["the event in the trash" #(t2/update! :model/TimelineEvent (:id event) {:archived true})
                   #(t2/update! :model/TimelineEvent (:id event) {:archived false})]
                  ["a new event" #(insert-event! pushed "Second" "2024-04-01T00:00:00Z" :entity_id "lbTlSecondEvent000001")
                   #(t2/delete! :model/TimelineEvent :entity_id "lbTlSecondEvent000001")]]]
           (testing label
             (change!)
             (is (= (assoc none :updated #{tl-id}) (local)))
             (undo!)
             (is (= none (local))))))
       (testing "M11-077: the trash of a pushed timeline is a local delete"
         (t2/with-transaction [_ nil {:rollback-only true}]
           (t2/update! :model/Timeline (:id pushed) {:archived true})
           (is (= (assoc none :deleted #{tl-id}) (local)))))
       (testing "M11-078: the delete of a pushed timeline is a local delete"
         (t2/with-transaction [_ nil {:rollback-only true}]
           (t2/delete! :model/Timeline :id (:id pushed))
           (is (= (assoc none :deleted #{tl-id}) (local)))))
       (testing "M11-080: a pushed timeline that a person moves out of the Library is a local delete"
         (t2/with-transaction [_ nil {:rollback-only true}]
           (t2/update! :model/Timeline (:id pushed) {:collection_id (:id outside)})
           (is (= (assoc none :deleted #{tl-id}) (local)))))))))

;;; ----------------------------------------------------- Writes ----------------------------------------------------

(deftest write-test
  (do-with-dashboards
   (fn [{:keys [dashboards team]}]
     (let [item (timeline-item "lb written" (:entity_id dashboards)
                               {:description "From the head." :icon "bell" :events [launch outage]})]
       (testing "a write of a new identity creates the timeline and its events, and current returns the content"
         (is (nil? (current releases-id)))
         (write! releases-id item)
         (is (= item (current releases-id)))
         (is (= {:name "lb written" :collection_id (:id dashboards) :creator_id config/internal-mb-user-id :archived false}
                (t2/select-one [:timeline :name :collection_id :creator_id :archived] :entity_id releases-id)))
         (is (= [config/internal-mb-user-id false]
                ((juxt :creator_id :archived) (event-row (:id launch))))))
       (let [tl-row    (t2/select-one-pk :model/Timeline :entity_id releases-id)
             launch-pk (:id (event-row (:id launch)))]
         (testing "a write of changed attributes, of another name and of another place changes the same row"
           (let [changed (-> item
                             (assoc :name "lb renamed" :place (:entity_id team))
                             (update :attrs #(-> % (dissoc :description :icon) (assoc :default true))))]
             (write! releases-id changed)
             (is (= changed (current releases-id)))
             (is (= tl-row (t2/select-one-pk :model/Timeline :entity_id releases-id)))
             (write! releases-id item)
             (is (= item (current releases-id)))))
         (testing "a write of a changed event changes its row in place; a key at its default goes to the default"
           (let [changed (assoc-in item [:attrs :events] [(dissoc launch :time_matters :icon) outage])]
             (write! releases-id changed)
             (is (= changed (current releases-id)))
             (is (= [launch-pk false "star"] ((juxt :id :time_matters :icon) (event-row (:id launch)))))))
         (testing "an event that the content does not hold moves to the trash of the timeline, and comes back from it"
           (write! releases-id (assoc-in item [:attrs :events] [outage]))
           (is (= [outage] (get-in (current releases-id) [:attrs :events])))
           (is (true? (:archived (event-row (:id launch)))))
           (write! releases-id item)
           (is (= item (current releases-id)))
           (is (= [launch-pk false] ((juxt :id :archived) (event-row (:id launch))))))
         (testing "an event that another timeline of the Library holds moves to this timeline, with its row"
           (write! other-id (timeline-item "lb other" (:entity_id team) {:events [launch]}))
           (is (= [outage] (get-in (current releases-id) [:attrs :events])))
           (is (= [launch-pk (t2/select-one-pk :model/Timeline :entity_id other-id)]
                  ((juxt :id :timeline_id) (event-row (:id launch)))))
           (testing "and the write of the first timeline with no events puts its last event in the trash"
             (write! releases-id (assoc item :attrs {}))
             (is (= {} (:attrs (current releases-id))))
             (is (true? (:archived (event-row (:id outage)))))))
         (testing "an empty description is content"
           (write! releases-id (assoc-in item [:attrs :description] ""))
           (is (= "" (get-in (current releases-id) [:attrs :description])))))))))

(deftest write-of-current-content-changes-no-row-test
  (testing "GetPut: a write of the current content changes no row, not even a time stamp, also after a pull wrote it"
    (do-with-dashboards
     (fn [{:keys [dashboards]}]
       (let [saved (insert-timeline! (:id dashboards) "lb getput" :description "Saved by a person.")]
         (insert-event! saved "Saved" "2024-03-01T11:00:00+01:00" :time_matters true)
         (insert-event! saved "Gone" "2024-01-01T00:00:00Z" :archived true)
         (write! other-id (timeline-item "lb pulled" (:entity_id dashboards) {:events [launch outage]}))
         (let [ids    [(:entity_id saved) other-id]
               before (rows ids)]
           (doseq [id ids]
             (write! id (current id)))
           (is (= before (rows ids)))
           (testing "and sends no update: on Postgres a time stamp that an update sets in this transaction equals the
                    one of the insert, so only the statements show it"
             (let [updates (atom [])
                   spy     (fn [f] (fn [& _args] (swap! updates conj f) 0))]
               (mt/with-dynamic-fn-redefs [library-branching.db/update-timeline!        (spy :update-timeline!)
                                           library-branching.db/update-timeline-event!  (spy :update-timeline-event!)
                                           library-branching.db/archive-timeline-events! (spy :archive-timeline-events!)]
                 (doseq [id ids]
                   (write! id (current id))))
               (is (= [] @updates))))))))))

(deftest write-keeps-instance-local-attributes-test
  (testing "a write never changes the creators or the times of creation of the timeline and its events"
    (do-with-dashboards
     (fn [{:keys [dashboards]}]
       (let [tl     (insert-timeline! (:id dashboards) "lb local")
             event  (insert-event! tl "Kept" "2024-01-01T00:00:00Z")
             local  #(vector (t2/select-one [:timeline :creator_id :created_at] (:id tl))
                             (t2/select-one [:timeline_event :creator_id :created_at] (:id event)))
             before (local)
             item   (timeline-item "lb local, renamed" (:entity_id dashboards)
                                   {:events [{:id (:entity_id event) :name "Renamed" :timestamp "2024-01-02T00:00:00Z"
                                              :timezone "UTC"}]})]
         (mt/with-current-user (mt/user->id :crowberto)
           (write! (:entity_id tl) item))
         (is (= item (current (:entity_id tl))))
         (is (= before (local))))))))

(deftest refused-writes-write-nothing-test
  (do-with-dashboards
   (fn [{:keys [dashboards metrics outside]}]
     (let [item   (timeline-item "lb refused" (:entity_id dashboards) {:events [launch]})
           before #(rows [releases-id])]
       (testing "content that is not a timeline is refused, and nothing is written"
         (doseq [[label bad] [["another kind" (assoc item :kind :snippet)]
                              ["a reference" (assoc item :refs #{[:card "IW8kbqZVaMxdGtCM2F4U6"]})]
                              ["an instance-local attribute" (assoc-in item [:attrs :creator_id] 1)]
                              ["an event in the trash" (assoc-in item [:attrs :events 0 :archived] true)]
                              ["an event with a time that is not canonical"
                               (assoc-in item [:attrs :events 0 :timestamp] "2024-03-01T11:00:00+01:00")]
                              ["a name of 256 characters" (assoc item :name (apply str (repeat 256 "x")))]]]
           (testing label
             (let [b (before)]
               (is (= :invalid-content (write-test/refusal #(write! releases-id bad))))
               (is (= b (before)))))))
       (testing "a timeline is in a Dashboards collection of the Library"
         (doseq [[label place] [["no place" nil]
                                ["the Metrics collection" (:entity_id metrics)]
                                ["a collection outside the Library" (:entity_id outside)]
                                ["no collection of this instance" "lbNoSuchCollection001"]]]
           (testing label
             (let [b (before)]
               (is (= :place (write-test/refusal #(write! releases-id (assoc item :place place)))))
               (is (= b (before)))))))
       (testing "a timeline outside the Library is not taken over"
         (let [tl (insert-timeline! (:id outside) "lb outside")
               b  (before)]
           (is (= :outside-library (write-test/refusal #(write! (:entity_id tl) item))))
           (is (= b (before)))))
       (testing "an event of a timeline outside the Library is not taken over"
         (let [tl    (insert-timeline! (:id outside) "lb outside events")
               event (insert-event! tl "Outside" "2024-01-01T00:00:00Z")
               b     (before)]
           (is (= :outside-library
                  (write-test/refusal #(write! releases-id (assoc-in item [:attrs :events]
                                                                     [{:id (:entity_id event) :name "Taken"
                                                                       :timestamp "2024-01-01T00:00:00Z"
                                                                       :timezone "UTC"}])))))
           (is (= b (before)))
           (is (= (:id tl) (:timeline_id (event-row (:entity_id event)))))))))))

;;; ----------------------------------------------------- Trash ----------------------------------------------------

(deftest trash-test
  (testing "trash! moves the timeline and its events to the trash, as the Trash of Metabase does"
    (do-with-dashboards
     (fn [{:keys [dashboards outside]}]
       (let [item (timeline-item "lb trashed" (:entity_id dashboards) {:events [launch outage]})]
         (write! releases-id item)
         (trash! releases-id)
         (is (nil? (current releases-id)))
         (is (not (contains? (app-db/read-current) releases-id)))
         (is (true? (t2/select-one-fn :archived :model/Timeline :entity_id releases-id)))
         (is (= [true true] (map (comp :archived event-row :id) [launch outage])))
         (testing "a trash of an item in the trash, and of an identity that no row has, does nothing"
           (is (nil? (trash! releases-id)))
           (is (nil? (trash! "lbNoSuchTimeline00001"))))
         (testing "a write of the trashed identity restores the same rows with the content"
           (let [pk (t2/select-one-pk :model/Timeline :entity_id releases-id)]
             (write! releases-id item)
             (is (= item (current releases-id)))
             (is (= pk (t2/select-one-pk :model/Timeline :entity_id releases-id)))))
         (testing "a timeline outside the Library is refused"
           (let [tl (insert-timeline! (:id outside) "lb outside")]
             (is (= :outside-library (write-test/refusal #(trash! (:entity_id tl)))))
             (is (false? (t2/select-one-fn :archived :model/Timeline (:id tl)))))))))))

(deftest trash-of-the-collection-test
  (testing "a trash of the collection of a timeline takes the timeline out of scope"
    (do-with-dashboards
     (fn [{:keys [dashboards team]}]
       (write! releases-id (timeline-item "lb in team" (:entity_id team) {:events [launch]}))
       (instance/trash! (get app-db/kind-stores :collection) (:entity_id dashboards))
       (is (nil? (current releases-id)))
       (is (not (contains? (app-db/read-current) releases-id)))))))

;;; ----------------------------------------------------- Laws -----------------------------------------------------

(def ^:private event-choices
  "Events that the generated items take, two of them at one time."
  [launch
   outage
   (assoc outage :id "lbTlSameTimeEvent0001" :timestamp (:timestamp launch))
   {:id "lbTlPlainEvent0000001" :name "Plain: one" :timestamp "1999-12-31T23:59:59Z" :timezone "America/New_York"}])

(defn- events-gen
  []
  (gen/fmap (fn [picks] (vec (sort-by format.timeline/event-order (distinct picks))))
            (gen/vector (gen/elements event-choices) 0 3)))

(def ^:private item-gen
  "A generator of timeline content, whose place is :dashboards or :team, a collection of [[do-with-dashboards]]."
  (gen/let [nm      (gen/elements ["lb gen releases" "lb gen: outages" "lb gen Société"])
            place   (gen/elements [:dashboards :team])
            desc    (gen/elements [nil "" "What we shipped."])
            icon    (gen/elements [nil "bell" "cake"])
            default (gen/elements [nil true])
            events  (events-gen)]
    (timeline-item nm place (into {} (remove (comp nil? val))
                                  {:description desc :icon icon :default default :events (not-empty events)}))))

(defn- laws-hold!
  "True iff each write of `items` to one identity reads back with current (PutGet), and a write of the content that
  current then returns changes no row (GetPut). Writes in a transaction that rolls back."
  [items]
  (do-with-dashboards
   (fn [collections]
     (let [put-get (every? (fn [item]
                             (let [item (update item :place #(:entity_id (get collections %)))]
                               (write! releases-id item)
                               (= item (current releases-id))))
                           items)
           before  (rows [releases-id])]
       (write! releases-id (current releases-id))
       (and put-get (= before (rows [releases-id])))))))

(defspec timeline-laws-test 30
  (prop/for-all [items (gen/vector item-gen 1 4)]
    (laws-hold! items)))

(deftest read-all-after-write-test
  (testing "read-all of the identities of a written snapshot of timelines returns that snapshot"
    (do-with-dashboards
     (fn [{:keys [dashboards team]}]
       (let [s {releases-id (timeline-item "lb snapshot one" (:entity_id dashboards) {:events [launch]})
                other-id    (timeline-item "lb snapshot two" (:entity_id team) {:events [outage] :icon "info"})}]
         (doseq [[id item] s]
           (write! id item))
         (is (= s (instance/read-all (store) (keys s))))
         (is (= s (select-keys (app-db/read-current) (keys s)))))))))

(deftest refs-contain-the-serdes-walk-test
  (testing "the references of a timeline (none) hold what master's serdes walk follows from it, but its container"
    (do-with-dashboards
     (fn [{:keys [dashboards]}]
       (let [tl (insert-timeline! (:id dashboards) "lb walk")]
         (insert-event! tl "Walked" "2024-01-01T00:00:00Z")
         (is (empty? (serdes/descendants "Timeline" (:id tl) {})))
         (is (= #{[{:model "Collection" :id (:id dashboards)}]}
                (set (serdes/serialization-dependencies "Timeline" (t2/select-one :model/Timeline (:id tl))))))
         (is (= #{} (:refs (current (:entity_id tl))))))))))
