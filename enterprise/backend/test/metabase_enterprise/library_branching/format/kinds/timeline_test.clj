(ns metabase-enterprise.library-branching.format.kinds.timeline-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase-enterprise.library-branching.format.codec :as codec]
   [metabase-enterprise.library-branching.format.kinds :as kinds]
   [metabase-enterprise.library-branching.format.kinds.timeline :as timeline]
   [metabase-enterprise.library-branching.format.layout :as layout]
   [metabase-enterprise.library-branching.format.tree :as tree]
   [metabase-enterprise.library-branching.format.writer :as writer]
   [metabase-enterprise.library-branching.mutation.core :as mut]
   [metabase.util.malli.registry :as mr]))

(set! *warn-on-reflection* true)

(def ^:private library-id "LiBrArYcOlLeCtIoN0001")
(def ^:private dashboards-id "dAsHbOaRdScOlLeCtIoN1")
(def ^:private releases-id "rElEaSeStImElInE00001")
(def ^:private launch-id "lAuNcHeVeNt000000001A")
(def ^:private outage-id "oUtAgEeVeNt000000002B")

(def ^:private launch
  {:id launch-id :name "Launch" :timestamp "2024-03-01T10:00:00Z" :timezone "Europe/Paris" :time_matters true
   :icon "cake"})

(def ^:private outage
  {:id outage-id :name "Outage" :description "The API was down." :timestamp "2024-05-02T00:00:00.500Z"
   :timezone "UTC"})

(defn- timeline-item
  ([] (timeline-item [launch outage]))
  ([events]
   {:kind  :timeline
    :name  "Releases"
    :place dashboards-id
    :refs  #{}
    :attrs (cond-> {:description "What we shipped." :icon "bell"}
             (seq events) (assoc :events events))}))

(def ^:private releases-text
  (str "kind: timeline\n"
       "id: rElEaSeStImElInE00001\n"
       "collection: dAsHbOaRdScOlLeCtIoN1\n"
       "description: What we shipped.\n"
       "events:\n"
       "- {id: lAuNcHeVeNt000000001A, icon: cake, name: Launch, time_matters: true, timestamp: '2024-03-01T10:00:00Z', timezone: Europe/Paris}\n"
       "- {id: oUtAgEeVeNt000000002B, description: The API was down., name: Outage, timestamp: '2024-05-02T00:00:00.500Z', timezone: UTC}\n"
       "icon: bell\n"
       "name: Releases\n"))

(defn- utf-8 ^bytes [^String s] (.getBytes s "UTF-8"))

(defn- file-text [id item] (String. ^bytes (writer/write-yaml (codec/encode timeline/codec id item)) "UTF-8"))

(defn- decode-text [s] (codec/decode timeline/codec (codec/read-yaml (utf-8 s))))

(defn- invalid? [s]
  (try
    (decode-text s)
    false
    (catch clojure.lang.ExceptionInfo e
      (= ::codec/invalid (:type (ex-data e))))))

(defn- fits? [item] (mr/validate (codec/schema timeline/codec) item))

(defn- collection [nm place attrs]
  {:kind :collection :name nm :place place :refs #{} :attrs attrs})

(deftest file-test
  (testing "a timeline is the file <name>.timeline.yaml in the directory of its collection"
    (is (= {library-id    "library/_collection.yaml"
            dashboards-id "library/dashboards/_collection.yaml"
            releases-id   "library/dashboards/releases.timeline.yaml"}
           (layout/layout kinds/codecs {library-id    (collection "Library" nil {:type "library"})
                                        dashboards-id (collection "Dashboards" library-id {:type "library-dashboards"})
                                        releases-id   (timeline-item)}))))
  (testing "the file holds the timeline and its events, each event with its identity"
    (is (= releases-text (file-text releases-id (timeline-item)))))
  (testing "the file decodes to the item"
    (is (= [releases-id (timeline-item)] (decode-text releases-text))))
  (testing "a timeline with no event has no events key"
    (is (not (str/includes? (file-text releases-id (timeline-item [])) "events")))
    (is (= [releases-id (timeline-item [])] (decode-text (file-text releases-id (timeline-item [])))))))

(deftest content-test
  (testing "the content attributes of a timeline"
    (is (= #{:description :icon :default :events} (set (keys (:attrs timeline/spec))))))
  (is (fits? (timeline-item)))
  (testing "a name has 1 to 255 characters, and a description at most 255, as the app DB keeps them"
    (is (fits? (assoc (timeline-item) :name (apply str (repeat 255 "é")))))
    (is (not (fits? (assoc (timeline-item) :name (apply str (repeat 256 "a"))))))
    (is (not (fits? (assoc (timeline-item) :name ""))))
    (is (not (fits? (assoc-in (timeline-item) [:attrs :description] (apply str (repeat 256 "a")))))))
  (testing "the icon is one of the icons of Metabase; the default icon is not in :attrs"
    (is (= ["star" "cake" "mail" "mail_at" "warning" "bell" "cloud" "info" "note" "event"] timeline/icons))
    (is (not (fits? (assoc-in (timeline-item) [:attrs :icon] "balloons"))))
    (is (not (fits? (assoc-in (timeline-item) [:attrs :icon] "star"))))
    (is (= (update (timeline-item) :attrs dissoc :icon)
           (second (decode-text (str/replace releases-text "icon: bell" "icon: star"))))))
  (testing "a default timeline has the attribute; one that is not has none"
    (is (fits? (assoc-in (timeline-item) [:attrs :default] true)))
    (is (not (fits? (assoc-in (timeline-item) [:attrs :default] false)))))
  (testing "a timeline has no references"
    (is (= #{} (kinds/refs :timeline releases-id (:attrs (timeline-item)))))
    (is (not (fits? (assoc (timeline-item) :refs #{[:collection dashboards-id]})))))
  (testing "Q5: the archive state, the creator and the bookkeeping columns are not content"
    (doseq [k [:archived :creator_id :created_at :updated_at :entity_id :collection_id]]
      (is (not (fits? (assoc-in (timeline-item) [:attrs k] "x"))) (str k))
      (is (invalid? (str releases-text (name k) ": x\n")) (str k)))))

(deftest events-test
  (testing "an event: its identity, name, time and time zone; a description, the time flag and an icon when set"
    (is (fits? (timeline-item [outage])))
    (is (fits? (timeline-item [(dissoc outage :description)])))
    (doseq [k [:id :name :timestamp :timezone]]
      (is (not (fits? (timeline-item [(dissoc outage k)]))) (str k))))
  (testing "an event key at its default is not in the event"
    (is (not (fits? (timeline-item [(assoc outage :time_matters false)]))))
    (is (not (fits? (timeline-item [(assoc outage :icon "star")]))))
    (is (not (fits? (timeline-item [(assoc outage :description nil)])))))
  (testing "the archive state, the creator and the bookkeeping columns of an event are not content"
    (doseq [k [:archived :creator_id :created_at :updated_at :timeline_id :entity_id]]
      (is (not (fits? (timeline-item [(assoc outage k "x")]))) (str k))))
  (testing "an event name has 1 to 255 characters; an icon is one of Metabase's"
    (is (not (fits? (timeline-item [(assoc outage :name "")]))))
    (is (not (fits? (timeline-item [(assoc outage :name (apply str (repeat 256 "a")))]))))
    (is (not (fits? (timeline-item [(assoc outage :icon "balloons")])))))
  (testing "the time of an event is the canonical text of an instant, in UTC"
    (doseq [t ["2024-05-02T02:00:00+02:00" "2024-05-02T00:00:00.000Z" "2024-05-02T00:00Z" "2024-05-02" "soon"]]
      (is (not (fits? (timeline-item [(assoc outage :timestamp t)]))) t)))
  (testing "the events are in the order of their time, then of their identity, each identity once"
    (is (not (fits? (timeline-item [outage launch]))))
    (is (not (fits? (timeline-item [launch launch]))))
    (let [same-time (assoc outage :timestamp (:timestamp launch))]
      (is (fits? (timeline-item [launch same-time])))
      (is (not (fits? (timeline-item [same-time launch]))))))
  (testing "the order is that of the instants, not of the texts: 10:00:00Z is before 10:00:00.500Z"
    (is (fits? (timeline-item [launch (assoc outage :timestamp "2024-03-01T10:00:00.500Z")])))))

(deftest decode-normalizes-events-test
  (testing "decode gives the events in their canonical form: in order, with no key at its default, with the time in UTC"
    (is (= [releases-id (timeline-item)]
           (decode-text (str "kind: timeline\nid: rElEaSeStImElInE00001\ncollection: dAsHbOaRdScOlLeCtIoN1\n"
                             "description: What we shipped.\nicon: bell\nname: Releases\n"
                             "events:\n"
                             "- {id: oUtAgEeVeNt000000002B, description: The API was down., name: Outage,"
                             " timestamp: '2024-05-02T02:00:00.5+02:00', timezone: UTC, time_matters: false,"
                             " icon: star}\n"
                             "- {id: lAuNcHeVeNt000000001A, icon: cake, name: Launch, time_matters: true,"
                             " timestamp: '2024-03-01T10:00:00Z', timezone: Europe/Paris, description: null}\n")))))
  (testing "an empty events key is the default"
    (is (= [releases-id (timeline-item [])] (decode-text (str (file-text releases-id (timeline-item [])) "events: []\n")))))
  (testing "a file with an event that has no time, or two events with one identity, does not fit the schema"
    (doseq [events ["- {id: lAuNcHeVeNt000000001A, name: Launch, timezone: UTC}\n"
                    (str "- {id: lAuNcHeVeNt000000001A, name: A, timestamp: '2024-03-01T10:00:00Z', timezone: UTC}\n"
                         "- {id: lAuNcHeVeNt000000001A, name: B, timestamp: '2024-03-02T10:00:00Z', timezone: UTC}\n")]]
      (is (= :invalid (get-in (tree/decode-file {"timeline" timeline/codec}
                                                (utf-8 (str "kind: timeline\nid: rElEaSeStImElInE00001\n"
                                                            "collection: dAsHbOaRdScOlLeCtIoN1\nname: Releases\n"
                                                            "events:\n" events)))
                              [:finding :type]))))))

(deftest tree-test
  (testing "a tree with a timeline decodes, also as a flat list of files"
    (let [s     {library-id    (collection "Library" nil {:type "library"})
                 dashboards-id (collection "Dashboards" library-id {:type "library-dashboards"})
                 releases-id   (timeline-item)}
          files (writer/encode-tree kinds/codecs s)]
      (is (= {:snapshot s} (tree/decode-tree kinds/codecs (vals files)))))))

(def ^:private mutations
  [{:name   :no-event-order
    :doc    "The schema takes events in any order, so one timeline has two forms and a diff shows a change."
    :target `timeline/in-order?
    :edits  [[:replace '(neg? (compare (event-order a) (event-order b))) true]]}
   {:name   :duplicate-events
    :doc    "The schema takes two events with one identity, which the app DB keeps unique."
    :target `timeline/in-order?
    :edits  [[:replace '(apply distinct? (map :id events)) true]]}
   {:name   :text-order
    :doc    "Events are in the order of the texts of their times, which is not the order of the instants."
    :target `timeline/event-order
    :edits  [[:replace '(instant timestamp) 'timestamp]]}
   {:name   :any-time-text
    :doc    "Any text of an instant is content, so one time has many forms."
    :target `timeline/canonical-time?
    :edits  [[:replace '(= s) 'some?]]}
   {:name   :events-not-sorted-on-decode
    :doc    "Decode keeps the events in the order of the file, so a file in another order does not fit."
    :target `timeline/normal-events
    :edits  [[:replace '(vec (sort-by event-order es)) 'es]]}
   {:name   :event-defaults-kept
    :doc    "Decode keeps an event key written at its default."
    :target `timeline/normal-event
    :edits  [[:replace '(= v (get event-defaults k :metabase-enterprise.library-branching.format.kinds.timeline/none)) false]]}
   {:name   :offset-kept
    :doc    "Decode keeps a time with an offset, so the file does not fit."
    :target `timeline/normal-event
    :edits  [[:replace '(assoc :timestamp (str t)) '(identity)]]}])

(deftest timeline-mutations-test
  (mut/check mutations {:tests [#'file-test #'content-test #'events-test #'decode-normalizes-events-test]}))
