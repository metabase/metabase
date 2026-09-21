(ns mage.bot.repl-eval-test
  (:require
   [babashka.fs :as fs]
   [clojure.test :refer [deftest is testing]]
   [mage.bot.repl-eval :as repl-eval]))

(set! *warn-on-reflection* true)

(def ^:private cache-file   #'repl-eval/cache-file)
(def ^:private read-cache   #'repl-eval/read-cache)
(def ^:private write-cache! #'repl-eval/write-cache!)
(def ^:private clear-cache! #'repl-eval/clear-cache!)

(defn- with-temp-cwd [f]
  (let [orig (System/getProperty "user.dir")
        dir  (str (fs/create-temp-dir))]
    (try
      (System/setProperty "user.dir" dir)
      (f dir)
      (finally
        (System/setProperty "user.dir" orig)
        (fs/delete-tree dir)))))

(deftest write-then-read-cache-test
  (with-temp-cwd
    (fn [_]
      (write-cache! {:type "nrepl" :host "localhost" :port "50605"})
      (is (= {:type "nrepl" :host "localhost" :port "50605"}
             (read-cache))))))

(deftest read-cache-missing-file-returns-nil
  (with-temp-cwd
    (fn [_] (is (nil? (read-cache))))))

(deftest read-cache-missing-required-keys-returns-nil
  (testing "incomplete cache (no PORT) is treated as no cache"
    (with-temp-cwd
      (fn [_]
        (spit (cache-file) "TYPE=nrepl\nHOST=localhost\n")
        (is (nil? (read-cache)))))))

(deftest read-cache-skips-comments-and-blanks
  (with-temp-cwd
    (fn [_]
      (spit (cache-file)
            (str "# header comment\n"
                 "\n"
                 "TYPE=socket\n"
                 "HOST=10.0.0.1\n"
                 "PORT=4242\n"))
      (is (= {:type "socket" :host "10.0.0.1" :port "4242"}
             (read-cache))))))

(deftest clear-cache!-removes-file
  (with-temp-cwd
    (fn [_]
      (write-cache! {:type "nrepl" :host "localhost" :port "50605"})
      (is (.exists (cache-file)))
      (clear-cache!)
      (is (not (.exists (cache-file))))
      (is (nil? (read-cache)))))
  (testing "clear-cache! is a no-op when no file exists"
    (with-temp-cwd
      (fn [_]
        (is (nil? (clear-cache!)))))))
