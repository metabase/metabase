(ns build.licenses-test
  (:require
   [build.licenses :as lic]
   [clojure.edn :as edn]
   [clojure.java.io :as io]
   [clojure.string :as str]
   [clojure.test :refer [deftest is run-tests testing]]
   [clojure.tools.build.api :as b]
   [metabuild-common.core :as u])
  (:import
   (java.io StringWriter)
   (java.nio.file Files FileSystems LinkOption Path Paths)))

(set! *warn-on-reflection* true)

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
</project>")


(defn jar->path
  "Return a Path for a jar."
  ^Path [filename]
  (let [path (Paths/get filename (into-array String []))]
    (if (Files/exists path (into-array LinkOption []))
      path
      (throw (ex-info (str "Jar " filename " not found") {:filename filename})))))

(def ^:private basis
  "A basis for this project suitable for testing."
  (b/create-basis {:project (u/filename u/project-root-directory "deps.edn")}))

(defn- jar ^Path [lib-name]
  (jar->path (-> basis :libs (get lib-name) :paths first)))

(deftest license-from-pom-test
  (let [clojure-jar (-> basis :libs (get 'org.clojure/clojure) :paths first)
        jar-path    (Paths/get ^String clojure-jar (into-array String []))]
    (with-open [jar-fs (FileSystems/newFileSystem jar-path
                                                  (ClassLoader/getSystemClassLoader))]
      (let [clojure-pom (lic/determine-pom clojure-jar jar-fs)]
        (is (some? clojure-pom) "Clojure pom not found")
        (is (= {:name "Eclipse Public License 1.0"
                :url "http://opensource.org/licenses/eclipse-1.0.php"}
               (lic/license-from-pom clojure-pom))))))
  (let [libs (-> basis :libs (select-keys '[org.clojure/clojure]) first)]
    (is (= "Eclipse Public License 1.0: http://opensource.org/licenses/eclipse-1.0.php"
           (-> (lic/discern-license-and-coords libs {}) second :license)))))

(deftest license-from-jar-test
  (letfn [(license-path [j f]
            (with-open [jar-fs (FileSystems/newFileSystem (jar j) (ClassLoader/getSystemClassLoader))]
              (some-> (lic/license-from-jar jar-fs)
                      f)))
          (first-line [path]
            (lic/do-with-path-is path (fn [is]
                                        (->> (slurp is)
                                             str/split-lines
                                             (drop-while str/blank?)
                                             first
                                             str/trim))))]
    (testing "Can find license information bundled in the jar"
      (is (= "META-INF/LICENSE.txt"
             (license-path 'org.apache.commons/commons-math3 str)))
      (is (= "Apache License"
             (license-path 'org.apache.commons/commons-math3 first-line))))
    (testing "Nil if not present"
      (is (nil? (license-path 'net.redhogs.cronparser/cron-parser-core identity))))))

(deftest license-from-backfill-test
  (let [backfill {"a" {"a" "License Information"}
                  "b" {"b" {:resource "MIT.txt"}}
                  :override/group
                  {"group-y" "License Information"
                   "group-z" {:resource "EPL.txt"}}}]
    (doseq [[coords expected-license]
            [['a/a "License Information"]
             ['b/b "Permission is hereby granted"]
             ['group-y/literally-anything "License Information"]
             ['group-z/literally-anything "\nEclipse Public License"]]]
      (let [license (lic/license-from-backfill coords backfill)]
        (is (not (str/blank? license)))
        (is (str/starts-with? license expected-license))))))

(deftest process*-test
  (testing "categorizes jar entries"
    (let [jar-libs        (select-keys (:libs basis)
                                       '[org.clojure/clojure
                                         org.apache.commons/commons-math3
                                         net.redhogs.cronparser/cron-parser-core])
          normalize-entry (fn [[_jar {:keys [coords license error]}]]
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
                 {:license false :error "Error determining license"}}}
               (normalize (lic/process* {:libs     jar-libs
                                         :backfill {}})))))
      (testing "with backfill by group and artifact"
        (is (= {:with-license
                {["org.clojure" "clojure"]                     {:license true}
                 ["org.apache.commons" "commons-math3"]        {:license true}
                 ["net.redhogs.cronparser" "cron-parser-core"] {:license true}}
                :without-license
                {}}
               (normalize (lic/process* {:libs jar-libs
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
               (normalize (lic/process* {:libs jar-libs
                                         :backfill
                                         {:override/group
                                          {"net.redhogs.cronparser" "license"}}}))))))))

(deftest write-license-test
  (is (= (str "The following software may be included in this product: a/a: 1.0. "
              "This software contains the following license and notice below:\n\n\n"
              "license text\n\n\n----------\n\n")
         (let [os (StringWriter.)]
           (#'lic/write-license os ['a/a {:coords  {:group "a" :artifact "a" :version "1.0"}
                                          :license "license text"}])
           (str os)))))

(defn- loop-until-success [f max step-name]
  (loop [n 0]
    (let [success? (try (f) true
                    (catch Exception _ false))]
      (cond success? ::done
            (and (not success?) (< n max)) (recur (inc n))
            :else (throw (ex-info (str "Could not succeed " step-name) {:max-attempts max}))))))

(deftest all-deps-have-licenses
  (testing "All deps on the classpath have licenses"
    (loop-until-success #(u/sh {:dir u/project-root-directory} "clojure" "-A:ee" "-P") 3 "download deps")
    (let [jar-libs (lic/jar-entries basis)
          results  (lic/process* {:libs     jar-libs
                                  :backfill (edn/read-string
                                             (slurp (io/resource "overrides.edn")))})]
      (is (nil? (:without-license results))
          (str "Deps without license information:\n"
               (str/join "\n" (map first (:without-license results)))))
      (is (= (set (keys jar-libs))
             (into #{} (->> results :with-license (map first)))))
      (is (some? (:without-license
                  (lic/process* {:libs     jar-libs
                                 :backfill {}})))))))

(comment
  (run-tests))
