(ns build.uberjar-test
  (:require
   [build.uberjar :as uberjar]
   [clojure.test :refer [deftest is testing]]))

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
