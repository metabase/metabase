(ns dev.build.check-class-file-versions
  (:require
   [clojure.java.io :as io]
   [clojure.string :as str]
   [metabuild-common.core :as u])
  (:import
   (java.io DataInputStream FileInputStream InputStream)
   (java.nio.file Files FileVisitOption OpenOption Path)
   (java.util.function BiPredicate)))

(set! *warn-on-reflection* true)

(def ^:private java-version->class-file-version
  "See https://en.wikipedia.org/wiki/Java_version_history if you need to add more versions here."
  {21 65
   20 64
   19 63
   18 62
   17 61
   16 60
   15 59
   14 58
   13 57
   12 56
   11 55
   10 54
   9  53
   8  52})

(defn- do-with-file-input-stream [file f]
  (if (instance? InputStream file)
    (f file)
    (with-open [is (FileInputStream. (io/file file))]
      (f is))))

(defn class-file-version
  "Get the (bytecode) version for a `class-file`, either a String filename/`java.io.File`, or something else you can
  call [[clojure.java.io/file]] on; or an `InputStream`."
  [class-file]
  (do-with-file-input-stream
   class-file
   (fn [^InputStream class-file-input-stream]
     (with-open [is (DataInputStream. class-file-input-stream)]
       (let [first-four-bytes (.readInt is)]
         (assert (= first-four-bytes (unchecked-int 0xCAFEBABE))
                 (format "Invalid Java class file: wrong first four bytes, got 0x%H, expected 0xCAFEBABE" first-four-bytes)))
       (let [minor-version (bit-and (.readShort is) 0xFFFF)
             major-version (bit-and (.readShort is) 0xFFFF)]
         (double (+ major-version (/ minor-version 100.0))))))))

(defn reducible-jar-files
  "Return an `IReduceInit` for all the files in a JAR that match `pred`. `pred` has the signature

    (f ^Path path)"
  [path-to-jar pred]
  (reify clojure.lang.IReduceInit
    (reduce [_this rf init]
      (u/with-open-jar-file-system [filesystem path-to-jar]
        (let [path   (.getPath filesystem "/" (make-array String 0))
              stream (Files/find path
                                 #_max-depth Integer/MAX_VALUE
                                 (reify BiPredicate
                                   (test [_this path _file-attributes]
                                     (boolean (pred path))))
                                 ^"[Ljava.nio.file.FileVisitOption;" (make-array FileVisitOption 0))
              it (.iterator stream)]
          (reduce rf init (iterator-seq it)))))))

(defn reducible-class-files
  "Return an `IReduceInit` for all the `.class` files in a JAR."
  [path-to-jar]
  (reducible-jar-files
   path-to-jar
   (fn [^Path path]
     (str/ends-with? (str path) ".class"))))

(defn do-with-open-input-stream-for-path
  "Calls

    (f ^InputStream input-stream)

  with an open `InputStream` for an NIO `Path`."
  [^Path path f]
  (with-open [is (Files/newInputStream path ^"[Ljava.nio.file.OpenOption;" (make-array OpenOption 0))]
    (f is)))

(defn find-files-compiled-for-wrong-java-version
  "Find files in a JAR (`String` filename, `java.io.File`, or something else you can call [[clojure.java.io/file]] on)
  that have a class file version incompatible with `max-java-version`."
  [path-to-jar max-java-version]
  (let [max-class-file-version (or (java-version->class-file-version max-java-version)
                                   (throw (ex-info (format "Don't know the bytecode version for Java version %s" max-java-version)
                                                   {:max-java-version max-java-version})))
        files                (reducible-class-files path-to-jar)]
    (reduce
     (fn [_acc ^Path path]
       (do-with-open-input-stream-for-path
        path
        (fn [^InputStream is]
          (let [version (class-file-version is)]
            (when (> version max-class-file-version)
              (println (str path) version))))))
     nil
     files)))
