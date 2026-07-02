(ns build.uberjar-test
  (:require
   [build.uberjar :as uberjar]
   [clojure.string :as str]
   [clojure.test :refer [deftest is testing]])
  (:import (java.io ByteArrayInputStream)))

(set! *warn-on-reflection* true)

(def ^:private basis
  "EE basis — includes all drivers, which is where the worst conflicts live."
  (delay (#'uberjar/create-basis :ee)))

(defn- conflicting-prefixes
  "Return Java package paths that have class file conflicts.
   e.g. `com/google/gson/Gson.class` → `com/google/gson`"
  [conflicts]
  (into #{}
        (keep (fn [{:keys [path]}]
                (let [last-slash (.lastIndexOf ^String path "/")]
                  (when (pos? last-slash)
                    (subs path 0 last-slash)))))
        conflicts))

;; Known conflicting packages. The test asserts on *package prefix* (stable) rather than
;; *lib* (order-dependent — the conflict handler only sees the second writer).
;; As we fix these, remove entries — the goal is to shrink this to #{}.
(def ^:private known-conflicting-prefixes
  '#{"com/microsoft/schemas"        ;; poi-ooxml vs poi-ooxml-lite — same version, XML schema overlap
     "org/openxmlformats/schemas"   ;; poi-ooxml vs poi-ooxml-lite — same version
     "org/apache/poi/schemas"       ;; poi-ooxml vs poi-ooxml-lite — same version
     "org/w3/x2000"                 ;; poi-ooxml vs poi-ooxml-lite — XML digital signature schemas
     "org/etsi/uri"                 ;; poi-ooxml vs poi-ooxml-lite — digital signature schemas
     "jakarta/servlet"              ;; jetty-servlet vs jakarta.servlet-api — same API version
     "javax/annotation"             ;; jsr250-api vs jsr305 — annotation-only JARs
     "net/jcip/annotations"         ;; jcip-annotations vs stephenc jcip-annotations — same lib, two Maven coords
     "io/netty/buffer"              ;; databricks-jdbc-thin bundles custom Arrow netty buffers
     "org/apache/calcite/avatica"   ;; avatica vs avatica-core — Hive transitive dep
     ;; org/slf4j — handled by slf4j-conflict-handler (prefers org.slf4j/slf4j-api)
     "org/apache/hadoop"            ;; hadoop-common single-class overlap
     "org/apache/hive"})            ;; hive-common single-class overlap

(defn- prefix-matches?
  "True if `prefix` equals or is under any of the known prefixes."
  [prefix]
  (some (fn [known]
          (or (= prefix known)
              (.startsWith ^String prefix (str known "/"))))
        known-conflicting-prefixes))

(deftest class-file-conflicts-test
  (testing "No unexpected class file conflicts in the EE uberjar"
    ;; Takes ~2 minutes — runs b/uber without AOT or resources
    (let [conflicts    (uberjar/detect-class-conflicts @basis)
          prefixes     (conflicting-prefixes conflicts)
          unexpected   (sort (remove prefix-matches? prefixes))]
      (is (empty? unexpected)
          (str "Unexpected class file conflicts in packages:\n"
               (pr-str unexpected)
               "\nIf benign, add to known-conflicting-prefixes with a comment. "
               "If dangerous, add a conflict handler in build.uberjar.")))))

(deftest jdbc-driver-services-merger-test
  (testing "merges JDBC driver service files across jars, dropping org.h2.Driver, deduping the rest"
    (let [existing (java.io.File/createTempFile "java.sql.Driver" "")
          closed?  (atom false)]
      (try
        ;; simulate the file already accumulated from earlier jars (H2 written by the first jar)
        (spit existing "org.h2.Driver\norg.postgresql.Driver")
        ;; a later jar also contributes the service file (with its own H2 line + a new driver)
        (let [in (proxy [ByteArrayInputStream]
                        [(.getBytes "org.sqlite.JDBC\norg.h2.Driver\norg.postgresql.Driver")]
                   (close [] (reset! closed? true)))]
          (#'uberjar/jdbc-driver-services-merger {:existing existing, :in in}))
        (let [lines (str/split-lines (slurp existing))]
          (is (not (some #{"org.h2.Driver"} lines)) "org.h2.Driver is dropped")
          (is (contains? (set lines) "org.postgresql.Driver"))
          (is (contains? (set lines) "org.sqlite.JDBC"))
          (is (= (count lines) (count (distinct lines))) "no duplicate providers"))
        ;; `in` is the shared JarInputStream tools.build keeps iterating -- closing it breaks the uber build
        (is (not @closed?) "the handler must not close the incoming stream")
        (finally (.delete existing))))))
