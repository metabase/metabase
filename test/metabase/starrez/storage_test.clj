(ns metabase.starrez.storage-test
  (:require
   [clojure.test :refer :all]
   [metabase.starrez.storage :as starrez.storage]))

(deftest upload-export-stores-content-hash-metadata
  (let [request (atom nil)]
    (with-redefs [metabase.starrez.storage/raw-http-request
                  (fn [method url options]
                    (reset! request {:method method :url url :options options})
                    {:status 201})]
      (is (true? (starrez.storage/upload-export
                  "https://example.blob.core.windows.net/starrez?sig=test"
                  "starrez_RoomBooking_2026-05-02_00-00-00.csv"
                  "abc")))
      (is (= "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
             (get-in @request [:options :headers "x-ms-meta-content_sha256"]))))))

(deftest list-exports-requests-and-parses-blob-metadata
  (let [request (atom nil)]
    (with-redefs [metabase.starrez.storage/raw-http-request
                  (fn [method url options]
                    (reset! request {:method method :url url :options options})
                    {:status 200
                     :body "<?xml version=\"1.0\" encoding=\"utf-8\"?>
<EnumerationResults>
  <Blobs>
    <Blob>
      <Name>starrez_RoomBooking_2026-05-02_00-00-00.csv</Name>
      <Properties>
        <Last-Modified>Wed, 20 May 2026 10:00:00 GMT</Last-Modified>
        <Content-Length>123</Content-Length>
      </Properties>
      <Metadata>
        <content_sha256>abc123</content_sha256>
      </Metadata>
    </Blob>
  </Blobs>
</EnumerationResults>"})]
      (is (= [{:name "starrez_RoomBooking_2026-05-02_00-00-00.csv"
               :last_modified "Wed, 20 May 2026 10:00:00 GMT"
               :size "123"
               :metadata {"content_sha256" "abc123"}}]
             (starrez.storage/list-exports
              "https://example.blob.core.windows.net/starrez?sig=test")))
      (is (= "GET" (:method @request)))
      (is (re-find #"include=metadata" (:url @request)))
      (is (re-find #"prefix=starrez_" (:url @request))))))

(deftest cleanup-old-exports-deletes-older-duplicates-when-keeping-all
  (let [deleted (atom [])]
    (with-redefs [starrez.storage/list-exports
                  (fn [_]
                    [{:name "starrez_RoomBooking_2026-05-01_00-00-00.csv"
                      :metadata {"content_sha256" "same-hash"}}
                     {:name "starrez_RoomBooking_2026-05-02_00-00-00.csv"
                      :metadata {"content_sha256" "same-hash"}}
                     {:name "starrez_Entry_2026-05-02_00-00-00.csv"
                      :metadata {"content_sha256" "other-hash"}}])
                  starrez.storage/download-export
                  (fn [& _]
                    (throw (ex-info "cleanup should use blob metadata, not CSV downloads" {})))
                  starrez.storage/delete-export
                  (fn [_ blob-name]
                    (swap! deleted conj blob-name)
                    true)]
      (starrez.storage/cleanup-old-exports "sas-url" "RoomBooking" 0)
      (is (= ["starrez_RoomBooking_2026-05-01_00-00-00.csv"] @deleted)))))

(deftest cleanup-old-exports-keeps-latest-distinct-versions
  (let [deleted (atom [])]
    (with-redefs [starrez.storage/list-exports
                  (fn [_]
                    [{:name "starrez_RoomBooking_2026-05-01_00-00-00.csv"
                      :metadata {"content_sha256" "third-hash"}}
                     {:name "starrez_RoomBooking_2026-05-02_00-00-00.csv"
                      :metadata {"content_sha256" "second-hash"}}
                     {:name "starrez_RoomBooking_2026-05-03_00-00-00.csv"
                      :metadata {"content_sha256" "latest-hash"}}
                     {:name "starrez_RoomBooking_2026-05-04_00-00-00.csv"
                      :metadata {"content_sha256" "latest-hash"}}])
                  starrez.storage/download-export
                  (fn [& _]
                    (throw (ex-info "cleanup should use blob metadata, not CSV downloads" {})))
                  starrez.storage/delete-export
                  (fn [_ blob-name]
                    (swap! deleted conj blob-name)
                    true)]
      (starrez.storage/cleanup-old-exports "sas-url" "RoomBooking" 2)
      (is (= ["starrez_RoomBooking_2026-05-03_00-00-00.csv"
              "starrez_RoomBooking_2026-05-01_00-00-00.csv"]
             @deleted)))))

(deftest cleanup-old-exports-counts-legacy-blobs-without-metadata
  (let [deleted (atom [])]
    (with-redefs [starrez.storage/list-exports
                  (fn [_]
                    [{:name "starrez_RoomBooking_2026-05-01_00-00-00.csv"}
                     {:name "starrez_RoomBooking_2026-05-02_00-00-00.csv"
                      :metadata {"content_sha256" "second-hash"}}
                     {:name "starrez_RoomBooking_2026-05-03_00-00-00.csv"
                      :metadata {"content_sha256" "latest-hash"}}])
                  starrez.storage/download-export
                  (fn [& _]
                    (throw (ex-info "cleanup should use blob metadata, not CSV downloads" {})))
                  starrez.storage/delete-export
                  (fn [_ blob-name]
                    (swap! deleted conj blob-name)
                    true)]
      (starrez.storage/cleanup-old-exports "sas-url" "RoomBooking" 2)
      (is (= ["starrez_RoomBooking_2026-05-01_00-00-00.csv"] @deleted)))))
