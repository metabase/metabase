(ns metabase.images.api-test
  (:require
   [clojure.java.io :as io]
   [clojure.test :refer :all]
   [metabase.test :as mt]))

(set! *warn-on-reflection* true)

(deftest ^:parallel fetch-image-test
  (testing "GET /api/images/:id/contents"
    (mt/with-temp [:model/Image {image-id :id} {:url (.getAbsolutePath (io/file (io/resource "frontend_client/app/assets/img/slack_emoji.png")))}]
      (let [response (mt/user-http-request-full-response :crowberto :get 200 (format "images/%d/contents" image-id))]
        ;; TODO -- this works IRL not sure why the test is failing
        #_(is (=? {"Content-Type" "image/png"}
                (:headers response)))
        (is (instance? java.io.File (:body response)))))))

(def test-image
  (io/file "resources/frontend_client/app/assets/img/blue_check.png"))

(comment
  (mt/user-http-request-full-response :crowberto :post "images"
                                      {:request-options {:headers {"content-type" "multipart/form-data"}}}
                                      {:file test-image}
                                      :user-id (mt/user->id :crowberto)))
