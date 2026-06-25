(ns metabase.channel.render.image-buffer-test
  (:require
   [clojure.test :refer :all]
   [metabase.channel.render.image-buffer :as image-buffer])
  (:import
   (java.awt.image BufferedImage)))

(set! *warn-on-reflection* true)

(deftest acquire-returns-argb-of-requested-size-test
  (let [img (image-buffer/acquire 320 240)]
    (try
      (is (instance? BufferedImage img))
      (is (= 320 (.getWidth img)))
      (is (= 240 (.getHeight img)))
      (is (= BufferedImage/TYPE_INT_ARGB (.getType img)))
      (finally
        (image-buffer/release img)))))

(deftest released-buffer-is-reused-test
  (testing "releasing a buffer and acquiring the same size hands back the very same object"
    (let [img1 (image-buffer/acquire 111 222)]
      (image-buffer/release img1)
      (let [img2 (image-buffer/acquire 111 222)]
        (try
          (is (identical? img1 img2))
          (finally
            (image-buffer/release img2)))))))

(deftest reused-buffer-is-cleared-test
  (testing "a reused buffer is wiped to fully transparent, not left with the previous render's pixels"
    (let [img (image-buffer/acquire 64 64)]
      (.setRGB img 10 10 (unchecked-int 0xFF00FF00))
      (is (not (zero? (.getRGB img 10 10))) "sanity: pixel was dirtied")
      (image-buffer/release img))
    (let [img (image-buffer/acquire 64 64)]
      (try
        (is (zero? (.getRGB img 10 10)) "previously-dirtied pixel is cleared on reacquire")
        (finally
          (image-buffer/release img))))))

(deftest different-sizes-do-not-collide-test
  (let [a (image-buffer/acquire 100 100)]
    (image-buffer/release a)
    (let [b (image-buffer/acquire 200 100)]
      (try
        (is (not (identical? a b)))
        (is (= 200 (.getWidth b)))
        (finally
          (image-buffer/release b))))))
