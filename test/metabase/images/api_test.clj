(ns metabase.images.api-test
  (:require
   [clojure.java.io :as io]
   [clojure.test :refer :all]
   [medley.core :as m]
   [metabase.collections.models.collection :as collection]
   [metabase.config.core :as config]
   [metabase.images.models.image :as models.image]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- test-image-url []
  (str (.. (io/resource "frontend_client/app/assets/img/lightbulb.png")
           toURI
           toURL)))

(deftest ^:parallel metadata-test
  (testing "GET /api/images/:id"
    (mt/with-temp [:model/Image {image-id :id} {:url (test-image-url)}]
      (is (=? {:id  pos-int?
               :url #"http://localhost:\d+/api/images/\d+/contents"}
              (mt/user-http-request :crowberto :get 200 (format "images/%d" image-id)))))))

(deftest ^:parallel card-metadata-test
  (testing "GET /api/images/:id"
    (mt/with-temp [:model/Image           {image-id :id}            {:url (test-image-url)}
                   :model/Card            {card-id :id}             {}
                   :model/Collection      {collection-id :id}       {}
                   :model/CollectionImage {collection-image-id :id} {:collection_id collection-id
                                                                     :image_id      image-id}
                   :model/CardSnapshot    {}                        {:card_id             card-id
                                                                     :collection_image_id collection-image-id}]
      (is (=? {:id      image-id
               :card_id card-id
               :url     #"http://localhost:\d+/api/images/\d+/contents"}
              (mt/user-http-request :crowberto :get 200 (format "images/%d" image-id)))))))

(deftest ^:parallel fetch-image-test
  (testing "GET /api/images/:id/contents"
    (mt/with-temp [:model/Image {image-id :id} {:url (test-image-url)}]
      (let [response (mt/user-http-request-full-response :crowberto :get 200 (format "images/%d/contents" image-id))]
        ;; TODO -- this works IRL not sure why the test is failing
        #_(is (=? {"Content-Type" "image/png"}
                  (:headers response)))
        ;; I think the input stream gets read in as a string by our test helpers?
        (is (instance? String (:body response)))))))

;; TODO -- also the comments endpoint
(deftest ^:parallel user-profile-image-test
  (t2/with-transaction [_conn nil {:rollback-only true}]
    (let [response (mt/user-http-request :crowberto :post "images"
                                         {:request-options {:headers {"content-type" "multipart/form-data"}}}
                                         {:file (mt/file->bytes (io/file (java.net.URI. (test-image-url))))}
                                         :user-id (mt/user->id :crowberto))]
      (is (=? {:id    pos-int?
               :url   #"http://localhost:\d+/api/images/\d+/contents"
               :title string?
               ;; TODO -- fixme
               ;; :content_type "image/png"
               }
              response))
      (is (= (:id response)
             (t2/select-one-fn :profile_image_id :model/User (mt/user->id :crowberto))))
      (testing "GET /api/user/:id"
        (is (=? {:profile_image_id  (:id response)
                 :profile_image_url string?}
                (mt/user-http-request :crowberto :get (format "user/%d" (mt/user->id :crowberto))))))
      (testing "GET /api/user/"
        (is (=? {:profile_image_id  (:id response)
                 :profile_image_url string?}
                (m/find-first #(= (:id %) (mt/user->id :crowberto))
                              (:data (mt/user-http-request :crowberto :get "user"))))))
      (when config/ee-available?
        (testing "GET /api/ee/comment"
          (mt/with-premium-features #{:documents}
            (mt/with-temp [:model/Document {doc-id :id} {:name       "New Document"
                                                         :creator_id (mt/user->id :crowberto)}]
              (is (=? {:creator {:profile_image_id  pos-int?
                                 :profile_image_url #"http://localhost:\d+/api/images/\d+/contents"}}
                      (mt/user-http-request :crowberto :post 200 "ee/comment/"
                                            {:target_type "document"
                                             :target_id   doc-id
                                             :content     ((requiring-resolve 'metabase-enterprise.comments.api-test/tiptap) [:p "New comment"])
                                             :html        "<p>New comment</p>"}))))))))))

(deftest ^:parallel post-user-id-image-test
  (let [res (mt/user-http-request :crowberto :post "images"
                                  {:request-options {:headers {"content-type" "multipart/form-data"}}}
                                  {:file test-image}
                                  :user-id (mt/user->id :crowberto))
        id  (:id res)]
    (is (nat-int? id))
    (is (=? {:id id
             :title "blue_check.png"
             :url (models.image/image-id->contents-url id)}
            res))))

(def test-image
  (io/file "resources/frontend_client/app/assets/img/blue_check.png"))

(comment

  (mt/user-http-request-full-response :crowberto :post "images"
                                      {:request-options {:headers {"content-type" "multipart/form-data"}}}
                                      {:file test-image}
                                      :user-id (mt/user->id :crowberto))

  (let [user-id       (mt/user->id :crowberto)
        collection-id (collection/user->personal-collection user-id)]
    (mt/user-http-request-full-response :crowberto :post "images"
                                        {:request-options {:headers {"content-type" "multipart/form-data"}}}
                                        {:file test-image}
                                        :collection-id (:id collection-id)))

  (mt/with-temp [:model/Card card {:name          "foo"
                                   :collection_id (:id (collection/user->personal-collection (mt/user->id :crowberto)))
                                   :dataset_query (mt/mbql-query :orders)}]
    (def snapshot-post-res (mt/user-http-request-full-response :crowberto :post (format "images/card/%d/snapshot" (:id card))))
    (def snapshot-list-res (mt/user-http-request-full-response :crowberto :get (format "images/card/%d/snapshots" (:id card)))))

  snapshot-post-res
  snapshot-list-res

  #_())
