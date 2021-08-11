(ns metabase.test-runner.junit.write
  "Logic related to writing test results for a namespace to a JUnit XML file. See
  https://stackoverflow.com/a/9410271/1198455 for the JUnit output spec."
  (:require [clojure.java.io :as io]
            [clojure.pprint :as pp]
            [clojure.string :as str]
            [pjstadig.print :as p])
  (:import [java.util.concurrent Executors ThreadFactory ThreadPoolExecutor TimeUnit]
           [javax.xml.stream XMLOutputFactory XMLStreamWriter]
           org.apache.commons.io.FileUtils))

(def ^String ^:private output-dir "target/junit")

(defn clean-output-dir!
  "Clear any files in the output dir; create it if needed."
  []
  (let [file (io/file output-dir)]
    (when (and (.exists file)
               (.isDirectory file))
      (FileUtils/deleteDirectory file))
    (.mkdirs file)))

;; TODO -- not sure it makes sense to do this INSIDE OF CDATA ELEMENTS!!!
(defn- escape-unprintable-characters
  [s]
  (str/join (for [^char c s]
              (if (and (Character/isISOControl c)
                       (not (Character/isWhitespace c)))
                (format "&#%d;" (int c))
                c))))

;; this *is* duplicated with `metabase.util`, but we don't want to load that entire namespace just so we can run tests
;; if we can help it.
(defn- decolorize [s]
  (some-> s (str/replace #"\[[;\d]*m" "")))

(defn- decolorize-and-escape
  "Remove ANSI color escape sequences, then encode things as character entities as needed"
  ^String [s]
  (-> s decolorize escape-unprintable-characters))

(defn- print-result-description [{:keys [file line message testing-contexts], :as result}]
  (println (format "%s:%d" file line))
  (doseq [s (reverse testing-contexts)]
    (println (str/trim (decolorize-and-escape s))))
  (when message
    (println (decolorize-and-escape message))))

(defn- print-expected [expected actual]
  (p/rprint "expected: ")
  (pp/pprint expected)
  (p/rprint "  actual: ")
  (pp/pprint actual)
  (p/clear))

(defn- write-result-output!
  [^XMLStreamWriter w {:keys [expected actual diffs], :as result}]
  (.writeCharacters w "\n")
  (let [s (with-out-str
            (println)
            (print-result-description result)
            ;; this code is adapted from `pjstadig.util`
            (p/with-pretty-writer
              (fn []
                (if (seq diffs)
                  (doseq [[actual [a b]] diffs]
                    (print-expected expected actual)
                    (p/rprint "    diff:")
                    (if a
                      (do (p/rprint " - ")
                          (pp/pprint a)
                          (p/rprint "          + "))
                      (p/rprint " + "))
                    (when b
                      (pp/pprint b))
                    (p/clear))
                  (print-expected expected actual)))))]
    (.writeCData w (decolorize-and-escape s))))

(defn- write-attributes! [^XMLStreamWriter w m]
  (doseq [[k v] m]
    (.writeAttribute w (name k) (str v))))

(defn- write-element! [^XMLStreamWriter w ^String element-name attributes write-children!]
  (.writeCharacters w "\n")
  (.writeStartElement w element-name)
  (when (seq attributes)
    (write-attributes! w attributes))
  (write-children!)
  (.writeCharacters w "\n")
  (.writeEndElement w))

(defmulti write-assertion-result!*
  {:arglists '([^XMLStreamWriter w result])}
  (fn [_ result] (:type result)))

(defmethod write-assertion-result!* :pass
  [_ _]
  nil)

(defmethod write-assertion-result!* :fail
  [w {:keys [message], :as result}]
  (write-element!
   w "failure"
   nil
   (fn []
     (write-result-output! w result))))

(defmethod write-assertion-result!* :error
  [w {:keys [message actual], :as result}]
  (write-element!
   w "error"
   (when (instance? Throwable actual)
     {:type (.getCanonicalName (class actual))})
   (fn []
     (write-result-output! w result))))

(defn- write-assertion-result! [w result]
  (try
    (write-assertion-result!* w result)
    (catch Throwable e
      (throw (ex-info (str "Error writing XML for test assertion result: " (ex-message e))
                      {:result result}
                      e)))))

(defn- write-var-result! [^XMLStreamWriter w result]
  (try
    (.writeCharacters w "\n")
    (write-element!
     w "testcase"
     {:classname  (name (ns-name (:ns result)))
      :name       (name (symbol (:var result)))
      :time       (/ (:duration-ms result) 1000.0)
      :assertions (:assertion-count result)}
     (fn []
       (doseq [result (:results result)]
         (write-assertion-result! w result))))
    (catch Throwable e
      (throw (ex-info (str "Error writing XML for test var result: " (ex-message e))
                      {:result result}
                      e)))))

;; write one output file for each test namespace.

(defn- write-ns-result!*
  ([{test-namespace :ns, :as result}]
   (let [filename (str (munge (ns-name (the-ns test-namespace))) ".xml")]
     (with-open [w (.createXMLStreamWriter (XMLOutputFactory/newInstance)
                                           (io/writer (io/file output-dir filename)
                                                      :encoding "UTF-8"))]
       (.writeStartDocument w)
       (write-ns-result!* w result)
       (.writeEndDocument w))))

  ([w {test-namespace :ns, :as result}]
   (try
     (write-element!
      w "testsuite"
      {:name      (name (ns-name test-namespace))
       :time      (/ (:duration-ms result) 1000.0)
       :timestamp (str (:timestamp result))
       :tests     (:test-count result)
       :errors    (:error-count result)
       :failures  (:failure-count result)}
      (fn []
        (doseq [result (:results result)]
          (write-var-result! w result))))
     (catch Throwable e
       (throw (ex-info (str "Error writing XML for test namespace result: " (ex-message e))
                       {:result result}
                       e))))))

(defonce ^:private thread-pool (atom nil))

(defn create-thread-pool! []
  (let [[^ThreadPoolExecutor old-val] (reset-vals! thread-pool (Executors/newCachedThreadPool
                                                                (reify ThreadFactory
                                                                  (newThread [_ r]
                                                                    (doto (Thread. r)
                                                                      (.setName "JUnit XML output writer")
                                                                      (.setDaemon true))))))]
    (when old-val
      (.shutdown old-val))))

(defn write-ns-result! [result]
  (let [^Callable thunk (fn []
                          (write-ns-result!* result))]
    (.submit ^ThreadPoolExecutor @thread-pool thunk)))

(defn wait-for-writes-to-finish
  "Wait up to 10 seconds for the thread pool that writes results to finish."
  []
  (.shutdown ^ThreadPoolExecutor @thread-pool)
  (.awaitTermination ^ThreadPoolExecutor @thread-pool 10 TimeUnit/SECONDS)
  (reset! thread-pool nil))
