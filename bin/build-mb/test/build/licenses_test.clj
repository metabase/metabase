(ns build.licenses-test
  (:require [build.licenses :as lic]
            [clojure.data.xml :as xml]
            [clojure.edn :as edn]
            [clojure.java.io :as io]
            [clojure.string :as str]
            [clojure.test :refer [deftest is run-tests testing]]
            [metabuild-common.core :as u])
  (:import (java.io StringReader StringWriter)
           (java.nio.file Files FileSystems LinkOption Path Paths)))

(def classpath-urls (str/split (System/getProperty "java.class.path")
                               (re-pattern lic/classpath-separator)))

(defn jar-filename-from-cp
  [jar-filename classpath-urls]
  (let [[x & rst :as found] (filter #(when (str/includes? % jar-filename) %) classpath-urls)]
    (cond (seq rst) (throw (ex-info (str "Multiple jars found for " jar-filename)
                                    {:filename jar-filename
                                     :found    found}))
          (not x)   (throw (ex-info (str "No results found for " jar-filename)
                                    {:filename jar-filename}))
          x         x)))

(defn parse [rdr] (xml/parse rdr :skip-whitespace true))

(def clojure-xml "<?xml version=\"1.0\" encoding=\"UTF-8\"?>
<project xmlns=\"http://maven.apache.org/POM/4.0.0\" xmlns:xsi=\"http://www.w3.org/2001/XMLSchema-instance\" xsi:schemaLocation=\"http://maven.apache.org/POM/4.0.0 http://maven.apache.org/xsd/maven-4.0.0.xsd\">
  <modelVersion>4.0.0</modelVersion>
  <groupId>org.clojure</groupId>
  <artifactId>clojure</artifactId>
  <name>clojure</name>
  <packaging>jar</packaging>
  <version>1.10.3</version>

  <licenses>
    <license>
      <name>Eclipse Public License 1.0</name>
      <url>http://opensource.org/licenses/eclipse-1.0.php</url>
      <distribution>repo</distribution>
    </license>
  </licenses>
</project>"
  )

(def clojure-jdbc-xml "<?xml version=\"1.0\" encoding=\"utf-8\"?>
<project xmlns=\"http://maven.apache.org/POM/4.0.0\" xmlns:xsi=\"http://www.w3.org/2001/XMLSchema-instance\" xsi:schemaLocation=\"http://maven.apache.org/POM/4.0.0 http://maven.apache.org/xsd/maven-4.0.0.xsd\">
  <modelVersion>4.0.0</modelVersion>
  <artifactId>java.jdbc</artifactId>
  <version>0.7.11</version>
  <name>java.jdbc</name>

  <parent>
    <groupId>org.clojure</groupId>
    <artifactId>pom.contrib</artifactId>
    <version>0.2.2</version>
  </parent>
</project>"
  )

(deftest pom->coordinates-test
  (testing "Parses version information from pom"
    (testing "When group information is top level"
      (let [xml (parse (StringReader. clojure-xml))]
        (is (= {:group    "org.clojure"
                :artifact "clojure"
                :version  "1.10.3"}
               (lic/pom->coordinates xml)))))
    (testing "When group informatoin is under the parent tag"
     (let [xml (parse (StringReader. clojure-jdbc-xml))]
       (is (= {:group    "org.clojure"
               :artifact "java.jdbc"
               :version  "0.7.11"}
              (lic/pom->coordinates xml)))))))

(defn jar->path [filename]
  (let [path (Paths/get filename (into-array String []))]
    (if (Files/exists path (into-array LinkOption []))
      path
      (throw (ex-data (str "Jar " filename " not found") {:filename filename})))))

(defn jar [filename]
  (jar->path (jar-filename-from-cp filename classpath-urls)))

(deftest pom->license-test
  (testing "Can find license information from the pom"
    (testing "If present"
      (let [xml (parse (StringReader. clojure-xml))]
        (is (= {:name         "Eclipse Public License 1.0"
                :url          "http://opensource.org/licenses/eclipse-1.0.php"
                :distribution "repo"}
               (lic/pom->licenses xml))))
      (let [jar-filename (jar-filename-from-cp "org/clojure/clojure" classpath-urls)
            jar-path (Paths/get jar-filename (into-array String []))]
        (with-open [jar-fs (FileSystems/newFileSystem jar-path nil)]
          (let [pom-path (lic/determine-pom jar-filename jar-fs)]
            (is (= {:name         "Eclipse Public License 1.0"
                    :url          "http://opensource.org/licenses/eclipse-1.0.php"
                    :distribution "repo"}
                   (lic/do-with-path-is pom-path (comp lic/pom->licenses parse))))))))
    (testing "Returning nil if not present"
      (let [xml (parse (StringReader. clojure-jdbc-xml))]
        (is (nil? (lic/pom->licenses xml)))))))

(deftest license-from-jar-test
  (letfn [(license-path [j f]
            (let [cl ^ClassLoader (ClassLoader/getSystemClassLoader)]
              ;; java 16 has a single arity that just takes a path, but older versions need a classloader. It can be
              ;; nil but felt weird typehinting the nil in a binding
              (with-open [jar-fs (FileSystems/newFileSystem ^Path (jar j) cl)]
                (some-> (lic/license-from-jar jar-fs)
                        f))))
          (first-line [path]
            (lic/do-with-path-is path (fn [is]
                                        (->> (slurp is)
                                             str/split-lines
                                             (drop-while str/blank?)
                                             first
                                             str/trim))))]
    (testing "Can find license information bundled in the jar"
      (is (= "META-INF/LICENSE.txt"
             (license-path "commons/commons-math3" str)))
      (is (= "Apache License"
             (license-path "commons/commons-math3" first-line))))
    (testing "Nil if not present"
      (is (nil? (license-path "cronparser/cron-parser-core" identity))))))

(deftest license-from-backfill-test
  (let [backfill {"a" {"a" "License Information"}
                  "b" {"b" {:resource "MIT.txt"}}
                  :override/group
                  {"group-y" "License Information"
                   "group-z" {:resource "EPL.txt"}}}]
    (doseq [[coords expected-license]
            [[{:group "a" :artifact "a"} "License Information"]
             [{:group "b" :artifact "b"} "Permission is hereby granted"]
             [{:group "group-y" :artifact "literally-any-package"} "License Information"]
             [{:group "group-z" :artifact "literally-any-package"} "\nEclipse Public License"]]]
      (let [license (lic/license-from-backfill coords backfill)]
        (is (not (str/blank? license)))
        (is (str/starts-with? license expected-license))))))

(deftest process*-test
  (testing "categorizes jar entries"
    (let [jars            (map #(jar-filename-from-cp % classpath-urls)
                               ["org/clojure/clojure"
                                "commons/commons-math3"
                                "cronparser/cron-parser-core"])
          normalize-entry (fn [[jar {:keys [coords license error]}]]
                            [((juxt :group :artifact) coords)
                             (cond-> {:license (not (str/blank? license))}
                               error (assoc :error error))])
          normalize       (fn [results]
                            (into {}
                                  (map (fn [[k v]]
                                         [k (into {} (map normalize-entry) v)]))
                                  results))]
      (testing "without backfill"
        (is (= {:with-license
                {["org.clojure" "clojure"]              {:license true}
                 ["org.apache.commons" "commons-math3"] {:license true}}
                :without-license
                {["net.redhogs.cronparser" "cron-parser-core"]
                 {:license false :error "Error determining license or coords"}}}
               (normalize (lic/process* {:classpath-entries jars
                                         :backfill          {}})))))
      (testing "with backfill by group and artifact"
        (is (= {:with-license
                {["org.clojure" "clojure"]                     {:license true}
                 ["org.apache.commons" "commons-math3"]        {:license true}
                 ["net.redhogs.cronparser" "cron-parser-core"] {:license true}}
                :without-license
                {}}
               (normalize (lic/process* {:classpath-entries jars
                                         :backfill
                                         {"net.redhogs.cronparser"
                                          {"cron-parser-core" "license"}}})))))
      (testing "with backfill by group override"
        (is (= {:with-license
                {["org.clojure" "clojure"]                     {:license true}
                 ["org.apache.commons" "commons-math3"]        {:license true}
                 ["net.redhogs.cronparser" "cron-parser-core"] {:license true}}
                :without-license
                {}}
               (normalize (lic/process* {:classpath-entries jars
                                         :backfill
                                         {:override/group
                                          {"net.redhogs.cronparser" "license"}}}))))))))

(deftest write-license-test
  (is (= (str "The following software may be included in this product:  a : a . "
              "This software contains the following license and notice below:\n\n\n"
              "license text\n\n\n----------\n\n")
         (let [os (StringWriter.)]
           (lic/write-license os ["jar" {:coords  {:group "a" :artifact "a"}
                                         :license "license text"}])
           (str os)))))

(defn- loop-until-success [f max step-name]
  (loop [n 0]
    (let [success? (try
                    (do (f) true)
                    (catch Exception _ false))]
      (cond success? ::done
            (and (not success?) (< n max)) (recur (inc n))
            :else (throw (ex-info (str "Could not succeed " step-name) {:max-attempts max}))))))

(deftest all-deps-have-licenses
  (testing "All deps on the classpath have licenses"
    (loop-until-success #(u/sh {:dir u/project-root-directory} "lein" "with-profile" "+include-all-drivers,+oss,+ee" "deps") 3 "download deps")
    (doseq [edition [:oss :ee]]
      (let [classpath (u/sh {:dir    u/project-root-directory
                             :quiet? true}
                            "lein"
                            "with-profile" (str \- "dev"
                                                (str \, \+ (name edition))
                                                \,"+include-all-drivers")
                            "classpath")
            classpath-entries (->> (str/split (last classpath) (re-pattern lic/classpath-separator))
                                   (filter lic/jar-file?))]
        (let [results (lic/process* {:classpath-entries classpath-entries
                                     :backfill  (edn/read-string
                                                 (slurp (io/resource "overrides.edn")))})]
          (is (nil? (:without-license results)) "Some deps don't have identifiable licenses")
          (is (= (set classpath-entries)
                 (into #{} (->> results :with-license (map first))))))
        (is (some? (:without-license
                    (lic/process* {:classpath-entries classpath-entries
                                   :backfill  {}}))))))))
(comment
  (run-tests)
  (binding [clojure.test/*test-out* *out*] (run-tests))
  )
