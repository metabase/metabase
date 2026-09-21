(ns metabase.channel.render.image-buffer-test
  (:require
   [clojure.test :refer :all]
   [metabase.channel.render.image-buffer :as image-buffer])
  (:import
   (java.awt.image BufferedImage)))

(set! *warn-on-reflection* true)

;; All tests share the process-wide pool, which holds at most three arrays at a time and blocks further acquires, so
;; every test must release everything it acquires (and these tests must not run in parallel with each other).

(deftest acquire-returns-argb-of-requested-size-test
  (testing "acquire yields an ARGB BufferedImage of exactly the requested size, for any size that fits the pool"
    (doseq [[w h] [[320 240] [1200 800] [1 1] [1200 1322] [64 480]]]
      (let [^BufferedImage img (image-buffer/acquire w h)]
        (try
          (is (instance? BufferedImage img) (format "%dx%d is a BufferedImage" w h))
          (is (= w (.getWidth img)) (format "%dx%d width" w h))
          (is (= h (.getHeight img)) (format "%dx%d height" w h))
          (finally
            (image-buffer/release img)))))))

(deftest reused-array-is-cleared-test
  (testing "a reused array is wiped in the region the next render uses (no pixel leak between renders)"
    (let [^BufferedImage img (image-buffer/acquire 64 64)]
      (.setRGB img 10 10 (unchecked-int 0xFF00FF00))
      (is (not (zero? (.getRGB img 10 10))) "sanity: pixel was dirtied")
      (image-buffer/release img))
    (let [^BufferedImage img (image-buffer/acquire 64 64)]
      (try
        (is (zero? (.getRGB img 10 10)) "the reused array no longer shows the previous render's pixel")
        (finally
          (image-buffer/release img))))))

(deftest oversized-request-is-not-pooled-test
  (testing "a request larger than the pooled array size gets a fresh standard image; releasing it is a no-op"
    (let [side               2200 ; 2200^2 px > the 1200x2700 pooled array size
          ^BufferedImage big (image-buffer/acquire side side)]
      (is (= side (.getWidth big)))
      (is (= side (.getHeight big)))
      (is (= BufferedImage/TYPE_INT_ARGB (.getType big)) "oversized images use a standard TYPE_INT_ARGB image")
      (is (nil? (image-buffer/release big))))))

(deftest acquire-blocks-at-capacity-test
  (testing "a fourth concurrent acquire blocks until one of the three held images is released"
    (let [held   (vec (repeatedly 3 #(image-buffer/acquire 100 100)))
          fourth (future
                   (let [img (image-buffer/acquire 100 100)]
                     (image-buffer/release img)
                     ::acquired))]
      (try
        (is (= ::still-blocked (deref fourth 300 ::still-blocked))
            "no pooled array is free while three are held")
        (image-buffer/release (first held))
        (is (= ::acquired (deref fourth 5000 ::timed-out))
            "unblocks as soon as an array is released")
        (finally
          (run! image-buffer/release (rest held)))))))

(deftest release-nil-is-safe-test
  (is (nil? (image-buffer/release nil))))
