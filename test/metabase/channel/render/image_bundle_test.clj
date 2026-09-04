(ns metabase.channel.render.image-bundle-test
  (:require
   [clojure.java.io :as io]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.channel.render.image-bundle :as image-bundle]
   [metabase.test :as mt]))

(set! *warn-on-reflection* true)

(deftest make-image-bundle-test
  (testing "Filename prefixes generated for attachments for EE with whitelabel feature flag uses the application name as the prefix"
    (mt/when-ee-evailable
     (mt/with-premium-features #{:whitelabel}
       (mt/with-temporary-setting-values [application-name "Acme Analytics"]
         (let [bundle (image-bundle/make-image-bundle :attachment (byte-array [1 2 3]))
               filename (.getName (io/as-file (:image-url bundle)))]
           (is (str/starts-with? filename "acme_analytics_channel_image_")))))))
  (testing "Filename prefixes generated for attachments for OSS or EE-without-whitelabel feature flag defaults to Metabase as the prefix"
    (let [bundle (image-bundle/make-image-bundle :attachment (byte-array [1 2 3]))
          filename (.getName (io/as-file (:image-url bundle)))]
      (is (str/starts-with? filename "metabase_channel_image_")))))
