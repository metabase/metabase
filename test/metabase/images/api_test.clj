(ns metabase.images.api-test
  (:require
   [metabase.test :as mt]
   [clojure.test :refer :all]
   [clojure.java.io :as io]))

(set! *warn-on-reflection* true)

(deftest ^:parallel fetch-image-test
  (testing "GET /api/images/:id/contents"9
    (mt/with-temp [:model/Image {image-id :id} {:url (.getAbsolutePath (io/file (io/resource "frontend_client/app/assets/img/logo.svg")))}]
      (let [response (mt/user-real-request :crowberto :get 200 (format "images/%d/contents" image-id))]
        (is (bytes? response))))))
