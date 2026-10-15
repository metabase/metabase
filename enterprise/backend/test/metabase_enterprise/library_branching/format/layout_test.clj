(ns metabase-enterprise.library-branching.format.layout-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [clojure.test.check.clojure-test :refer [defspec]]
   [clojure.test.check.generators :as gen]
   [clojure.test.check.properties :as prop]
   [metabase-enterprise.library-branching.format.codec :as codec]
   [metabase-enterprise.library-branching.format.layout :as layout]
   [metabase-enterprise.library-branching.format.toy-codec :as toy]
   [metabase-enterprise.library-branching.mutation.core :as mut])
  (:import
   (org.eclipse.jgit.errors CorruptObjectException)
   (org.eclipse.jgit.lib ObjectChecker)))

(set! *warn-on-reflection* true)

(def ^:private codecs (codec/by-kind toy/codecs))

(defn- directory-kind? [kind] (layout/directory? (get codecs kind)))

(defn- segments [path] (str/split path #"/"))

(defn- parent-dir [path] (str/join "/" (butlast (segments path))))

(defn- own-dir
  "The directory that holds the items that item `id` contains."
  [s paths id]
  (let [path (get paths id)]
    (if (directory-kind? (:kind (get s id)))
      (parent-dir path)
      (subs path 0 (- (count path) (count ".yaml"))))))

(defn- entry
  "The name of item `id` in its directory: its own directory for a directory kind, else its file."
  [s paths id]
  (last (segments (if (directory-kind? (:kind (get s id))) (own-dir s paths id) (get paths id)))))

(defn- dir-prefixes [path]
  (map #(str/join "/" (take % (segments path))) (range 1 (count (segments path)))))

;;; ------------------------------------------------------ Laws -------------------------------------------------------

(defspec unique-paths-test 300
  ;; Alloy UniquePaths (and MergedPathsUnique: a merge result is one more well-formed snapshot).
  (prop/for-all [s (toy/toy-snapshot-gen)]
    (let [paths (layout/layout toy/codecs s)
          dirs  (set (mapcat dir-prefixes (vals paths)))]
      (and (= (set (keys s)) (set (keys paths)))
           (or (empty? paths) (apply distinct? (vals paths)))
           (not-any? dirs (vals paths))))))

(defn- entry-dir
  "The directory that holds the entry of item `id`."
  [s paths id]
  (parent-dir (if (directory-kind? (:kind (get s id))) (own-dir s paths id) (get paths id))))

(defn- plain-entry
  "The entry name of item `id` with no suffix: the slug of its name (or its home's fixed segment), and its word for a
  file kind."
  [s id]
  (let [{:keys [kind name place] :as item} (get s id)
        c    (get codecs kind)
        base (or (when-not place (:segment (layout/home c item))) (layout/slug name))]
    (if (layout/directory? c) base (str base "." (layout/word c)))))

(defspec least-identity-has-no-suffix-test 300
  ;; Of the siblings with one entry name (one name and one kind, or two names with one slug), the least identity has
  ;; the plain entry, and each other one has its identity as the suffix.
  (prop/for-all [s (toy/toy-snapshot-gen)]
    (let [paths  (layout/layout toy/codecs s)
          groups (vals (group-by (fn [[id _]] [(entry-dir s paths id) (plain-entry s id)]) s))]
      (every? (fn [group]
                (let [[least & others] (sort-by (comp layout/identity-segment key) group)]
                  (and (not (str/includes? (entry s paths (key least)) "~"))
                       (every? #(str/includes? (entry s paths (key %)) (str "~" (layout/identity-segment (key %))))
                               others))))
              groups))))

(defspec path-shape-test 300
  (prop/for-all [s (toy/toy-snapshot-gen)]
    (let [paths (layout/layout toy/codecs s)]
      (every? (fn [[id path]]
                (let [{:keys [kind place]} (get s id)
                      word (layout/word (get codecs kind))]
                  (and (every? #(re-matches #"[^/.~][^/]*" %) (butlast (segments path)))
                       (if (directory-kind? kind)
                         (str/ends-with? path (str "/_" word ".yaml"))
                         (re-matches (re-pattern (str ".*/[^./_][^./]*\\." word "\\.yaml|.*/__[^./]*\\." word "\\.yaml"))
                                     (str "/" path)))
                       (or (nil? place)
                           (str/starts-with? path (str (own-dir s paths place) "/"))))))
              paths))))

(defn- git-safe?
  "True iff JGit accepts `path` as a tree path, with the checks for Windows and macOS."
  [^String path]
  (try (.checkPath (doto (ObjectChecker.) (.setSafeForWindows true) (.setSafeForMacOS true)) path)
       true
       (catch CorruptObjectException _ false)))

(defspec git-safe-paths-test 300
  ;; A path with a Windows device name, a reserved character or a trailing dot fails a push from Windows.
  (prop/for-all [s (toy/toy-snapshot-gen)]
    (every? git-safe? (vals (layout/layout toy/codecs s)))))

(defspec layout-is-a-function-of-content-test 100
  (prop/for-all [s (toy/toy-snapshot-gen)]
    (= (layout/layout toy/codecs s)
       (layout/layout (reverse toy/codecs) (into (array-map) (reverse (seq s)))))))

;;; ---------------------------------------------------- Fixed cases --------------------------------------------------

(def ^:private area-id   "aReAaReAaReAaReAaReA0")
(def ^:private birds-id  "bIrDsbIrDsbIrDsbIrDs0")
(def ^:private birds2-id "AbIrDsbIrDsbIrDsbIrD0")
(def ^:private board-id  "bOaRdbOaRdbOaRdbOaRd0")
(def ^:private leaf-id   "lEaFlEaFlEaFlEaFlEaF0")
(def ^:private leaf2-id  "lEaFlEaFlEaFlEaFlEaF1")
(def ^:private loose-id  "lOoSelOoSelOoSelOoSe0")
(def ^:private orders    ["Sample Database" "PUBLIC" "ORDERS"])
(def ^:private orders2   ["Sample Database" nil "ORDERS 2"])

(defn- item [kind name place & {:as attrs}]
  {:kind kind :name name :place place :refs #{} :attrs (or attrs {})})

(def ^:private example
  {area-id   (item :folder "The Area" nil :color true)
   birds-id  (item :folder "Birds" area-id)
   birds2-id (item :folder "BIRDS" area-id)
   board-id  (item :board "Sightings" birds-id)
   leaf-id   (item :leaf "Robin" board-id)
   leaf2-id  (item :leaf "Robin" board-id)
   loose-id  (item :leaf "_Wren" nil)
   orders    (item :published-table "Orders" nil)
   orders2   (item :published-table "Orders" nil)})

(deftest example-layout-test
  (testing "the area folder is the directory area/; a board's leaves are in its own directory; two siblings with one
            slug: the least identity has no suffix"
    (is (= {area-id   "area/_folder.yaml"
            birds2-id "area/birds/_folder.yaml"
            birds-id  "area/birds~bIrDsbIrDsbIrDsbIrDs0/_folder.yaml"
            board-id  "area/birds~bIrDsbIrDsbIrDsbIrDs0/sightings.board.yaml"
            leaf-id   "area/birds~bIrDsbIrDsbIrDsbIrDs0/sightings.board/robin.leaf.yaml"
            leaf2-id  "area/birds~bIrDsbIrDsbIrDsbIrDs0/sightings.board/robin~lEaFlEaFlEaFlEaFlEaF1.leaf.yaml"
            loose-id  "area/_leaves/__wren.leaf.yaml"
            orders    "tables/orders.table.yaml"
            orders2   "tables/orders~+Sample%20Database+~+ORDERS%202.table.yaml"}
           (layout/layout toy/codecs example)))))

(deftest taken-paths-example-test
  (testing "a taken path at the file of an item, or at the directory of an item, gives the item its identity as a
            suffix; the items that it contains move with it. A taken suffixed path gives a number after the suffix"
    (is (= {area-id   "area/_folder.yaml"
            birds2-id "area/birds~AbIrDsbIrDsbIrDsbIrD0/_folder.yaml"
            birds-id  "area/birds~bIrDsbIrDsbIrDsbIrDs0/_folder.yaml"
            board-id  "area/birds~bIrDsbIrDsbIrDsbIrDs0/sightings~bOaRdbOaRdbOaRdbOaRd0.board.yaml"
            leaf-id   "area/birds~bIrDsbIrDsbIrDsbIrDs0/sightings~bOaRdbOaRdbOaRdbOaRd0.board/robin.leaf.yaml"
            leaf2-id  "area/birds~bIrDsbIrDsbIrDsbIrDs0/sightings~bOaRdbOaRdbOaRdbOaRd0.board/robin~lEaFlEaFlEaFlEaFlEaF1~2.leaf.yaml"
            loose-id  "area/_leaves/__wren.leaf.yaml"
            orders    "tables/orders.table.yaml"
            orders2   "tables/orders~+Sample%20Database+~+ORDERS%202.table.yaml"}
           (layout/layout toy/codecs example
                          #{"area/birds/_folder.yaml"
                            "area/birds~bIrDsbIrDsbIrDsbIrDs0/sightings.board"
                            "area/birds~bIrDsbIrDsbIrDsbIrDs0/sightings~bOaRdbOaRdbOaRdbOaRd0.board/robin~lEaFlEaFlEaFlEaFlEaF1.leaf.yaml"})))))

(defn- home-dirs
  "The directories of the homes of the root-level items of `s`, and their parents: no suffix moves them."
  [s]
  (set (for [[_ {:keys [kind place] :as item}] s
             :when (nil? place)
             :let  [dir (:dir (layout/home (get codecs kind) item))]
             n     (range 1 (inc (count dir)))]
         (str/join "/" (take n dir)))))

(defn- tree-paths
  "`paths` with each path removed that is a directory of another one: the file paths of one git tree."
  [paths]
  (let [dirs (set (mapcat dir-prefixes paths))]
    (set (remove dirs paths))))

(def ^:private snapshot-and-taken-gen
  ;; The taken paths come from the paths of the layout itself, from their directories, from paths under them, and from
  ;; the paths that one round of suffixes gives: every kind of clash. No taken path is a home directory, because no
  ;; suffix moves one.
  (gen/bind (toy/toy-snapshot-gen)
            (fn [s]
              (let [paths (vals (layout/layout toy/codecs s))
                    cands (remove (home-dirs s)
                                  (distinct (concat paths
                                                    (mapcat dir-prefixes paths)
                                                    (map #(str % "/x") paths)
                                                    (vals (layout/layout toy/codecs s (set paths))))))]
                (if (empty? cands)
                  (gen/return [s #{}])
                  (gen/fmap (fn [taken] [s (tree-paths taken)])
                            (gen/vector (gen/elements cands) 0 8)))))))

(defspec taken-paths-test 300
  ;; The push keeps each foreign file at its path, so the layout never puts a file of an item, or a directory, where a
  ;; foreign file is, and never puts a file of an item where a foreign file has a directory.
  (prop/for-all [[s taken] snapshot-and-taken-gen]
    (let [paths      (layout/layout toy/codecs s taken)
          taken-dirs (set (mapcat dir-prefixes taken))
          item-dirs  (set (mapcat dir-prefixes (vals paths)))]
      (and (= (set (keys s)) (set (keys paths)))
           (or (empty? paths) (apply distinct? (vals paths)))
           (not-any? item-dirs (vals paths))
           (not-any? taken (vals paths))
           (not-any? taken-dirs (vals paths))
           (not-any? taken item-dirs)))))

(defspec no-taken-paths-change-nothing-test 100
  (prop/for-all [s (toy/toy-snapshot-gen)]
    (= (layout/layout toy/codecs s) (layout/layout toy/codecs s #{}))))

(deftest identity-segment-test
  (testing "an entity id is its own segment; a natural key is escaped and joined with +, nil as ~"
    (is (= "IW8kbqZVaMxdGtCM2F4U6" (layout/identity-segment "IW8kbqZVaMxdGtCM2F4U6")))
    (is (= "+Sample%20Database+~+ORDERS" (layout/identity-segment ["Sample Database" nil "ORDERS"])))
    (is (= "+a%2Bb+c" (layout/identity-segment ["a+b" "c"])))
    (is (= "+%7E+%25" (layout/identity-segment ["~" "%"])))
    (is (= "+%C3%A9t%C3%A9+x%2Ey" (layout/identity-segment ["été" "x.y"]))
        "a dot is escaped too")))

(deftest slug-test
  (are [name expected] (= expected (layout/slug name))
    "Total Revenue"       "total_revenue"
    "Q3-review"           "q3-review"
    "a.b/c\\d~e"          "a_b_c_d_e"
    "ÉCOLE"               "école"
    "_tags"               "__tags"
    "__x"                 "___x"
    "/"                   "__"
    "."                   "__"
    "Ünïcødé 名前"         "ünïcødé_名前"
    "CON"                 "con_"
    "nul"                 "nul_"
    "Com1"                "com1_"
    "lpt9"                "lpt9_"
    "con_"                "con_"
    "console"             "console")
  (testing "names that differ only in their Unicode normal form give one slug"
    (is (= (layout/slug "e\u0301") (layout/slug "\u00e9"))))
  (testing "a slug has at most 100 characters before the escape of a leading _"
    (is (= (apply str (repeat 100 "a")) (layout/slug (apply str (repeat 150 "A")))))
    (is (= (str "_" (apply str (repeat 100 "_"))) (layout/slug (apply str (repeat 150 "!"))))))
  (testing "a slug never starts with one _ and then another character, so it never equals a fixed directory as _tags"
    (is (every? #(not (re-matches #"_[^_].*" (layout/slug %))) ["_tags" "_" "a" "_a_" "!x"]))))

(deftest layout-preconditions-test
  (testing "a place outside the snapshot, or a containment cycle, throws"
    (is (thrown? clojure.lang.ExceptionInfo (layout/layout toy/codecs {birds-id (item :folder "Birds" area-id)})))
    (is (thrown? clojure.lang.ExceptionInfo (layout/layout toy/codecs {birds-id (item :folder "Birds" area-id)
                                                                       area-id  (item :folder "Area" birds-id)}))))
  (testing "a kind with no codec throws"
    (is (thrown? clojure.lang.ExceptionInfo (layout/layout (rest toy/codecs) example))))
  (testing "a word or a home segment that is not a safe directory or file name throws"
    (let [bad-word (fn [w] (assoc (second toy/codecs) :word w))
          bad-home (fn [h] (assoc (second toy/codecs) :home-fn (constantly h)))
          s        {board-id (item :board "Sightings" nil)}]
      (doseq [c [(bad-word "yaml") (bad-word "a.b") (bad-word "") (bad-word "A")
                 (bad-home {:dir [".git"]}) (bad-home {:dir ["a/b"]}) (bad-home {:dir [""]})
                 (bad-home {:dir ["x.yaml"]}) (bad-home {:dir [] :segment "_x"}) (bad-home {:dir []})]]
        (is (thrown? clojure.lang.ExceptionInfo (layout/layout [c] s)) (pr-str c))))))

;;; ---------------------------------------------------- Mutations ----------------------------------------------------

(def ^:private mutations
  [{:name   :greatest-plain
    :doc    "The greatest identity of a clash group keeps the plain name; the rule names the least."
    :target `layout/entries
    :edits  [[:replace '(sort-by (comp identity-segment :id) group) '(reverse (sort-by (comp identity-segment :id) group))]]}
   {:name   :no-suffix
    :doc    "No item gets the identity suffix, so two siblings with one slug and one kind have one path."
    :target `layout/entries
    :edits  [[:replace '(str base "~" (identity-segment id)) 'base]]}
   {:name   :clash-by-name
    :doc    "The clash rule groups siblings by name, not by the entry that the slug gives, so two names with one slug
            collide (the Alloy model treats a name as the segment)."
    :target `layout/entries
    :edits  [[:replace '(group-by (juxt :dir :entry) items) '(group-by (juxt :dir :entry :name) items)]]}
   {:name   :no-underscore-escape
    :doc    "A name that starts with _ keeps it, so its slug can equal a fixed directory as _leaves."
    :target `layout/slug
    :edits  [[:replace '(str/starts-with? cut "_") false]]}
   {:name   :no-normal-form
    :doc    "The slug keeps the Unicode form of the name, so two names that look equal give two directories."
    :target `layout/slug
    :edits  [[:replace '(Normalizer/normalize s Normalizer$Form/NFC) 's]]}
   {:name   :dot-kept
    :doc    "The slug keeps dots, so a directory name can end in .yaml and equal a file."
    :target `layout/slug-char
    :edits  [[:replace '(= cp (int \_)) '(or (= cp (int \_)) (= cp (int \.)))]]}
   {:name   :no-device-name-escape
    :doc    "A name that is a Windows device name keeps it, so the file con.leaf.yaml fails a checkout on Windows."
    :target `layout/slug
    :edits  [[:replace '(windows-device-names escaped) nil]]}
   {:name   :no-case-fold
    :doc    "The slug keeps upper case, so two names that differ in case collide on a file system that ignores case."
    :target `layout/slug
    :edits  [[:replace '(.toLowerCase s Locale/ROOT) 's]]}
   {:name   :taken-ignored
    :doc    "The layout does not look at the taken paths, so an item file can sit where a foreign file is."
    :target `layout/layout
    :edits  [[:replace '(free-entry? taken) '(constantly true)]]}
   {:name   :one-suffix-only
    :doc    "An item whose suffixed path is taken too gets no path that is free."
    :target `layout/entries
    :edits  [[:replace '(iterate inc 1) [1]]]}
   {:name   :place-ignored
    :doc    "Every item sits at its home, as if it were at the root level: containment no longer shows in the paths."
    :target `layout/parent-dir
    :edits  [[:replace '(if place (get dirs place) (:dir (home-of item))) '(:dir (home-of item))]]}])

(deftest layout-mutations-test
  (mut/check mutations {:tests [#'example-layout-test #'slug-test #'unique-paths-test #'git-safe-paths-test
                                #'least-identity-has-no-suffix-test #'path-shape-test #'taken-paths-example-test
                                #'taken-paths-test]}))

;;; ---------------------------------------------------- Coverage -----------------------------------------------------

(deftest toy-snapshot-gen-coverage-test
  (testing "the generator gives the cases that the laws must cover"
    (let [ss    (mapv #(gen/generate (toy/toy-snapshot-gen) 30 %) (range 100))
          lays  (mapv #(layout/layout toy/codecs %) ss)
          paths (mapcat vals lays)]
      (is (some #(str/includes? % "~") paths) "an identity suffix")
      (is (some #(str/includes? % "~+") paths) "the suffix of a natural key")
      (is (some #(re-find #"\.board/" %) paths) "a leaf in a board")
      (is (some #(<= 5 (count (segments %))) paths) "a path five levels deep")
      (is (some #(str/starts-with? % "area/_folder.yaml") paths) "the area folder")
      (is (some #(re-find #"/__" %) paths) "a name that starts with _")
      (is (some (fn [s] (let [slugs (map (comp layout/slug :name) (vals s))]
                          (< (count (set slugs)) (count (set (map :name (vals s)))))))
                ss)
          "two names with one slug"))))
