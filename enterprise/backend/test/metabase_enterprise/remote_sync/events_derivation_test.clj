(ns metabase-enterprise.remote-sync.events-derivation-test
  "Tests of the remote-sync event hierarchy. No app DB."
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.remote-sync.events :as remote-sync.events]
   [metabase.events.core :as events]))

(deftest ^:parallel card-event-derivation-test
  (testing "card events properly derive from :metabase/event"
    (is (events/isa? ::remote-sync.events/card-change-event :metabase/event))
    (is (events/isa? :event/card-create ::remote-sync.events/card-change-event))
    (is (events/isa? :event/card-update ::remote-sync.events/card-change-event))
    (is (events/isa? :event/card-delete ::remote-sync.events/card-change-event))))

(deftest ^:parallel dashboard-event-derivation-test
  (testing "dashboard events properly derive from :metabase/event"
    (is (events/isa? ::remote-sync.events/dashboard-change-event :metabase/event))
    (is (events/isa? :event/dashboard-create ::remote-sync.events/dashboard-change-event))
    (is (events/isa? :event/dashboard-update ::remote-sync.events/dashboard-change-event))
    (is (events/isa? :event/dashboard-delete ::remote-sync.events/dashboard-change-event))))

(deftest ^:parallel document-event-derivation-test
  (testing "document events properly derive from :metabase/event"
    (is (events/isa? ::remote-sync.events/document-change-event :metabase/event))
    (is (events/isa? :event/document-create ::remote-sync.events/document-change-event))
    (is (events/isa? :event/document-update ::remote-sync.events/document-change-event))
    (is (events/isa? :event/document-delete ::remote-sync.events/document-change-event))))

(deftest ^:parallel snippet-event-derivation-test
  (testing "snippet events properly derive from :metabase/event"
    (is (events/isa? ::remote-sync.events/snippet-change-event :metabase/event))
    (is (events/isa? :event/snippet-create ::remote-sync.events/snippet-change-event))
    (is (events/isa? :event/snippet-update ::remote-sync.events/snippet-change-event))
    (is (events/isa? :event/snippet-delete ::remote-sync.events/snippet-change-event))))

(deftest ^:parallel collection-event-derivation-test
  (testing "collection events properly derive from :metabase/event"
    (is (events/isa? ::remote-sync.events/collection-change-event :metabase/event))
    (is (events/isa? :event/collection-create ::remote-sync.events/collection-change-event))
    (is (events/isa? :event/collection-update ::remote-sync.events/collection-change-event))))

(deftest ^:parallel table-event-derivation-test
  (testing "table events properly derive from :metabase/event"
    (is (events/isa? ::remote-sync.events/table-change-event :metabase/event))
    (is (events/isa? :event/table-create ::remote-sync.events/table-change-event))
    (is (events/isa? :event/table-update ::remote-sync.events/table-change-event))
    (is (events/isa? :event/table-delete ::remote-sync.events/table-change-event))))

(deftest ^:parallel segment-event-derivation-test
  (testing "segment events properly derive from :metabase/event"
    (is (events/isa? ::remote-sync.events/segment-change-event :metabase/event))
    (is (events/isa? :event/segment-create ::remote-sync.events/segment-change-event))
    (is (events/isa? :event/segment-update ::remote-sync.events/segment-change-event))
    (is (events/isa? :event/segment-delete ::remote-sync.events/segment-change-event))))
