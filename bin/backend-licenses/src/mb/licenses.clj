(ns mb.licenses
  "Functionality to take a classpath and generate a file containing all libraries and their respective licenses."
  (:require [clojure.data.xml :as xml]
            [clojure.java.io :as io]
            [clojure.string :as str])
  (:import (java.util.jar JarFile JarFile$JarFileEntry)))

(set! *warn-on-reflection* true)

(def classpath-separator (System/getProperty "path.separator"))

(defn jar-file? [filename]
  (str/ends-with? filename "jar"))

(defn jar-files [jar-filename]
  (iterator-seq (.entries (JarFile. (io/file jar-filename)))))

(def pom-filter (filter (fn [^JarFile$JarFileEntry jar-entry]
                          (str/ends-with? (.getName jar-entry) "pom.xml"))))

(defn jar->pom
  "Given a jar filename, look for an adjacent pom file otherwise look for a pom file in the jar. Return the parsed xml."
  [jar-filename]
  (let [adjacent-pom (io/file (str/replace jar-filename #"jar$" "pom"))]
    (if (.exists adjacent-pom)
      (xml/parse (io/input-stream adjacent-pom))
      (when-let [jar-pom (first (into [] pom-filter (jar-files jar-filename)))]
        (xml/parse (.getInputStream (JarFile. jar-filename) jar-pom))))))

(defn- get-entry [^JarFile jar ^String name]
  (.getEntry jar name))

(def ^:private tag-content (juxt :tag (comp first :content)))

(defn- pom->coordinates [pom-xml]
  (let [coords (->> pom-xml
                    :content
                    (filter #(#{:groupId :artifactId :version} (:tag %)))
                    (map tag-content)
                    (into {}))
        parent (->> pom-xml
                    :content
                    (filter #(#{:parent} (:tag %)))
                    first
                    :content
                    (map tag-content)
                    (into {}))]
    {:group (or (:groupId coords) (:groupId parent))
     :artifact (:artifactId coords)
     :version (or (:version coords) (:version parent))}))

(defn pom->licenses [pom-xml]
  (let [licenses (some->> pom-xml
                          :content
                          (filter #(#{:licenses} (:tag %)))
                          first
                          :content
                          first
                          :content
                          (map tag-content)
                          (into {}))]
    licenses))

(def ^:private license-file-names
  ["LICENSE" "LICENSE.txt" "META-INF/LICENSE"
   "META-INF/LICENSE.txt" "license/LICENSE"])

(defn license-from-jar
  [jar]
  (if-let [license-entry (some (partial get-entry jar) license-file-names)]
    (with-open [rdr (io/reader (.getInputStream jar license-entry))]
      (let [[license version] (->> rdr line-seq (remove str/blank?) (map str/trim) (take 2))]
        {:name (str license ": " version)}))))

(defn license-from-backfill
  [{:keys [group artifact]} backfill]
  (some #(get-in backfill %)
        [[group artifact]
         [:override/group group]]))

(defn discern-license-and-coords [jar-filename backfill]
  (try
    (let [pom-xml (jar->pom jar-filename)
          coords (pom->coordinates pom-xml)
          license (or (pom->licenses pom-xml)
                      (license-from-jar (JarFile. jar-filename))
                      (license-from-backfill coords backfill))]
      [jar-filename (cond-> {:coords coords :license license}
                      (not (and license coords)) (assoc :error "Error determining license or coords"))])
    (catch Exception e
      [jar-filename {:error e}])))

(defn process
  [{:keys [classpath backfill output-filename]}]
  (let [entries (->> (str/split classpath (re-pattern classpath-separator))
                     (filter jar-file?))]
    (map #(discern-license-and-coords % backfill) entries)))
