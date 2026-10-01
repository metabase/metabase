(ns metabase.core.module-cycles-test
  (:require
   [clojure.java.io :as io]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [dev.kondo-ratchet :as kondo-ratchet]
   [dev.module-cycles :as module-cycles]))

(set! *warn-on-reflection* true)

(def ^:private graph
  "Two cycles, `qp <-> sync` and `app-db <-> settings`, joined one way by `sync -> settings`."
  {'app-db   #{'settings}
   'qp       #{'sync}
   'settings #{'app-db}
   'sync     #{'qp 'settings}})

(def ^:private modules
  (set (keys graph)))

(defn- headlines
  "The first line of each problem, which is all most assertions need."
  [graph anchors]
  (mapv (comp first str/split-lines) (module-cycles/problems graph modules anchors)))

(deftest ^:parallel one-anchor-per-cluster-passes-test
  (is (empty? (module-cycles/problems graph modules '{foundation app-db, galactic-center qp}))))

(deftest ^:parallel growing-and-shrinking-pass-test
  (testing "membership is never recorded, so a named cluster can gain and lose modules"
    (is (empty? (module-cycles/problems (assoc graph 'qp #{'sync 'lib}, 'lib #{'qp})
                                        (conj modules 'lib)
                                        '{foundation app-db, galactic-center qp})))))

(deftest ^:parallel a-merge-fails-and-shows-the-joining-requires-test
  (let [merged (assoc graph 'settings #{'app-db 'qp})
        [msg]  (module-cycles/problems merged modules '{foundation app-db, galactic-center qp})]
    (is (=? [#"foundation and galactic-center merged into one cycle of 4 modules\."
             #".*Please find another way\."
             #"  foundation reaches galactic-center through app-db -> settings -> qp"
             #"  galactic-center reaches foundation through qp -> sync -> settings -> app-db"
             #".*"
             #".*remove all but one of the names.*"]
            (str/split-lines msg)))))

(deftest ^:parallel a-three-way-merge-shows-requires-to-every-named-cluster-test
  (let [graph   (assoc graph 'settings #{'app-db 'qp}, 'lib #{'qp}, 'qp #{'sync 'lib})
        anchors '{foundation app-db, galactic-center qp, darmok lib}
        [msg]   (module-cycles/problems graph (conj modules 'lib) anchors)
        reaches (filter #(str/includes? % " reaches ") (str/split-lines msg))]
    (is (=? [#"  darmok reaches foundation .*"
             #"  foundation reaches darmok .*"
             #"  darmok reaches galactic-center .*"
             #"  galactic-center reaches darmok .*"]
            reaches))))

(deftest ^:parallel an-unnamed-cluster-fails-with-a-proposed-name-test
  (testing "a tie for the most requires inside the cluster proposes the alphabetically first member"
    (is (=? [#"A cluster without a name: 2 modules, qp, sync\."
             #"  It is a cycle through these requires:"
             #"    qp -> sync"
             #"    sync -> qp"
             #".*thank you\. You get to name the new one\."
             #".*name-module-cycle skill.*"
             #"  Then add a line like `qp-knot qp` to .*"
             #".*break it rather than naming it\."]
            (str/split-lines (first (module-cycles/problems graph modules '{foundation app-db}))))))
  (testing "a proposal never reuses a taken name"
    (is (=? [#".*`qp-knot-2 qp`.*"]
            (filter #(str/includes? % "line like") (str/split-lines (first (module-cycles/problems
                                                                            graph modules
                                                                            '{foundation app-db, qp-knot lib})))))))
  (testing "dots and slashes in a module name become dashes"
    (is (= 'enterprise-transforms-python-knot
           (:name (module-cycles/propose '{enterprise/transforms.python #{x}, x #{enterprise/transforms.python}}
                                         '#{enterprise/transforms.python x}
                                         '#{enterprise/transforms.python x}
                                         #{}))))))

(deftest ^:parallel a-dissolved-cluster-fails-until-its-name-is-retired-test
  (is (= ["galactic-center is no longer a cycle: qp is not in any cluster. Nice work."]
         (headlines (assoc graph 'sync #{'settings}) '{foundation app-db, galactic-center qp}))))

(deftest ^:parallel an-anchor-must-be-a-module-test
  (is (=? [#"A cluster without a name.*"
           #"galactic-center is anchored on query-processor, which is not a module\..*"]
          (headlines graph '{foundation app-db, galactic-center query-processor})))
  (testing "even when the anchor is a graph node inside a cycle, it names nothing unless the config declares it"
    (is (=? [#"A cluster without a name: 2 modules, qp, sync\."
             #"galactic-center is anchored on qp, which is not a module\..*"]
            (mapv (comp first str/split-lines)
                  (module-cycles/problems graph (disj modules 'qp) '{foundation app-db, galactic-center qp})))))
  (testing "a proposal only anchors on a configured module"
    (is (=? [#".*`sync-knot sync`.*"]
            (filter #(str/includes? % "line like")
                    (-> (module-cycles/problems graph (disj modules 'qp) '{foundation app-db})
                        first
                        str/split-lines))))))

(deftest ^:parallel malformed-names-throw-test
  (are [anchors msg] (thrown-with-msg? clojure.lang.ExceptionInfo msg (module-cycles/validate-anchors anchors))
    '[foundation app-db]                  #"must hold a map"
    '{:foundation app-db}                 #"not a cluster name"
    '{foundation "app-db"}                #"must be anchored by a module symbol"
    '{foundation app-db, other app-db}    #"app-db anchors more than one cluster: foundation, other"))

(deftest ^:parallel an-empty-file-is-not-an-empty-map-test
  (let [file (io/file (System/getProperty "java.io.tmpdir") (str "cycle-clusters-" (System/nanoTime) ".edn"))]
    (try
      (spit file ";; nothing\n")
      (is (thrown-with-msg? clojure.lang.ExceptionInfo #"is empty" (module-cycles/read-anchors (.getPath file))))
      (finally
        (io/delete-file file true)))))

(deftest module-cycles-test
  ;; Release branches disable the ratchets, and their structure is frozen with them.
  (when-not (kondo-ratchet/disabled?)
    (let [problems (module-cycles/report)]
      (is (empty? problems)
          (str "Every cyclic cluster of the module require graph holds exactly one anchor from "
               module-cycles/clusters-file ".\n\n" (str/join "\n\n" problems))))))
