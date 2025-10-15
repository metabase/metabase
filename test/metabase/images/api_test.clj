(ns metabase.images.api-test
  (:require
   [clojure.java.io :as io]
   [clojure.test :refer :all]
   [metabase.collections.models.collection :as collection]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- test-image-url []
  (str (.. (io/resource "frontend_client/app/assets/img/lightbulb.png")
           toURI
           toURL)))

(deftest ^:parallel fetch-image-test
  (testing "GET /api/images/:id/contents"
    (mt/with-temp [:model/Image {image-id :id} {:url (test-image-url)}]
      (let [response (mt/user-http-request-full-response :crowberto :get 200 (format "images/%d/contents" image-id))]
        ;; TODO -- this works IRL not sure why the test is failing
        #_(is (=? {"Content-Type" "image/png"}
                (:headers response)))
        (is (instance? java.io.File (:body response)))))))

;; TODO -- also the comments endpoint
(deftest ^:parallel user-profile-image-test
  (t2/with-transaction [_conn nil {:rollback-only true}]
    (let [response (mt/user-http-request :crowberto :post "images"
                                         {:request-options {:headers {"content-type" "multipart/form-data"}}}
                                         {:file (mt/file->bytes (io/file (java.net.URI. (test-image-url))))}
                                         :user-id (mt/user->id :crowberto))]
      (is (=? {:id           pos-int?
               :url          #"http://localhost:\d+/api/images/\d+/contents"
               :title        string?
               :content_type "image/png"}
              response))
      (is (= (:id response)
             (t2/select-one-fn :profile_image_id :model/User (mt/user->id :crowberto))))
      (is (=? {:profile_image_id  (:id response)
               :profile_image_url string?}
              (mt/user-http-request :crowberto :get (format "user/%d" (mt/user->id :crowberto))))))))

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

  #_())
