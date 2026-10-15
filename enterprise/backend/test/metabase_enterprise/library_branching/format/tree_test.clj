(ns metabase-enterprise.library-branching.format.tree-test
  (:require
   [clojure.test :refer :all]
   [clojure.test.check.clojure-test :refer [defspec]]
   [clojure.test.check.generators :as gen]
   [clojure.test.check.properties :as prop]
   [metabase-enterprise.library-branching.format.codec :as codec]
   [metabase-enterprise.library-branching.format.layout :as layout]
   [metabase-enterprise.library-branching.format.toy-codec :as toy]
   [metabase-enterprise.library-branching.format.tree :as tree]
   [metabase-enterprise.library-branching.format.writer :as writer]
   [metabase-enterprise.library-branching.mutation.core :as mut]))

(set! *warn-on-reflection* true)

(defn- utf-8 ^bytes [^String s] (.getBytes s "UTF-8"))

(defn- bytes= [a b] (= (seq a) (seq b)))

(defn- trees= [a b]
  (and (= (set (keys a)) (set (keys b)))
       (every? #(bytes= (get a %) (get b %)) (keys a))))

(defn- scramble
  "Equal to `x`, with every map and set built in a different order."
  [x]
  (cond
    (map? x)    (apply array-map (mapcat (fn [[k v]] [(scramble k) (scramble v)]) (reverse (seq x))))
    (set? x)    (into (sorted-set-by #(compare (pr-str %2) (pr-str %1))) (map scramble) x)
    (vector? x) (mapv scramble x)
    :else       x))

;;; ------------------------------------------------------ Laws -------------------------------------------------------

(defspec round-trip-test 200
  (prop/for-all [s (toy/toy-snapshot-gen)]
    (= {:snapshot s} (tree/decode-tree toy/codecs (vals (writer/encode-tree toy/codecs s))))))

(defspec path-law-test 200
  ;; Alloy DecodeIgnoresPaths: the files at any other paths, a flat list `<n>.yaml` in a random order included, decode
  ;; to the same snapshot. decode-tree takes no path, so a renaming is a new order of the files.
  (prop/for-all [[s order] (gen/bind (toy/toy-snapshot-gen)
                                     (fn [s] (gen/tuple (gen/return s) (gen/shuffle (range (inc (count s)))))))]
    (let [files (vec (vals (writer/encode-tree toy/codecs s)))
          flat  (into {} (map-indexed (fn [n i] [(str n ".yaml") (nth files i)])) order)]
      (= {:snapshot s} (tree/decode-tree toy/codecs (vals flat))))))

(defspec canonical-tree-test 200
  (prop/for-all [s (toy/toy-snapshot-gen)]
    (trees= (writer/encode-tree toy/codecs s)
            (writer/encode-tree (reverse toy/codecs) (scramble s)))))

(defspec tree-paths-test 100
  (prop/for-all [s (toy/toy-snapshot-gen)]
    (let [t (writer/encode-tree toy/codecs s)]
      (and (= (set (keys t)) (conj (set (vals (layout/layout toy/codecs s))) tree/format-path))
           (not (tree/old-format? (keys t)))))))

;;; ---------------------------------------------------- Fixed cases --------------------------------------------------

(def ^:private folder-id "fOlDeRfOlDeRfOlDeRfOl")
(def ^:private leaf-id   "lEaFlEaFlEaFlEaFlEaF0")

(def ^:private example
  {folder-id {:kind :folder :name "Birds" :place nil :refs #{} :attrs {:description "Birds of the area."}}
   leaf-id   {:kind  :leaf :name "Robin" :place folder-id
              :refs  #{[:card folder-id] [:source-table [:env ["Aviary" nil "SIGHTINGS"]]]}
              :attrs {:position 3}}})

(deftest encode-tree-test
  (testing "each item is at its layout path, and the format version file is at .metabase/format.yaml"
    (let [t (writer/encode-tree toy/codecs example)]
      (is (= #{".metabase/format.yaml" "area/birds/_folder.yaml" "area/birds/robin.leaf.yaml"} (set (keys t))))
      (is (= "format: library-branching/1\n" (String. ^bytes (get t ".metabase/format.yaml") "UTF-8")))
      (is (= (str "kind: leaf\n"
                  "id: lEaFlEaFlEaFlEaFlEaF0\n"
                  "attrs: {position: 3}\n"
                  "name: Robin\n"
                  "place: fOlDeRfOlDeRfOlDeRfOl\n"
                  "refs:\n"
                  "- env: [Aviary, null, SIGHTINGS]\n"
                  "  role: source-table\n"
                  "- {role: card, target: fOlDeRfOlDeRfOlDeRfOl}\n")
             (String. ^bytes (get t "area/birds/robin.leaf.yaml") "UTF-8")))))
  (testing "a kind with no codec throws"
    (is (thrown? clojure.lang.ExceptionInfo (writer/encode-tree (rest toy/codecs) example)))))

(defn- example-files [] (vec (vals (writer/encode-tree toy/codecs example))))

(defn- findings [files] (:findings (tree/decode-tree toy/codecs files)))

(defn- finding-types [files] (set (map :type (findings files))))

(def ^:private leaf-file
  (utf-8 "kind: leaf\nid: lEaFlEaFlEaFlEaFlEaF0\nname: Robin\n"))

(def ^:private format-file (utf-8 "format: library-branching/1\n"))

(deftest duplicate-identity-test
  (testing "two files with one identity are a finding that names both files, and no snapshot"
    (let [files (conj (example-files) leaf-file)
          r     (tree/decode-tree toy/codecs files)
          dup   (first (filter #(= :duplicate-identity (:type %)) (:findings r)))]
      (is (not (contains? r :snapshot)))
      (is (= leaf-id (:id dup)))
      (is (= 2 (count (:files dup))))
      (is (= (dec (count files)) (peek (:files dup))) "the added file is the second one named")))
  (testing "two equal files with one identity are a finding too"
    (is (= #{:duplicate-identity} (finding-types [format-file leaf-file leaf-file])))))

(deftest file-findings-test
  (testing "each file that does not decode is one finding with its position and a reason; the others decode"
    (let [files [format-file
                 (utf-8 "kind: leaf\nid: [unclosed\n")
                 leaf-file
                 (utf-8 "# README\n\nSome text.\n")
                 (utf-8 "- a\n- list\n")
                 (utf-8 "")
                 (utf-8 "plain text")
                 (utf-8 "kind: dashboard\nid: x\n")
                 (utf-8 "kind: leaf\nid: 12\nname: Robin\n")
                 (utf-8 "kind: leaf\nid: lEaFlEaFlEaFlEaFlEaF1\nname: ''\n")]
          fs    (findings files)]
      (is (= [1 3 4 5 6 7 8 9] (mapv :file fs)))
      (is (= [:unreadable :unreadable :unreadable :unreadable :unreadable :unknown-kind :invalid :invalid]
             (mapv :type fs)))
      (is (every? (comp string? :reason) fs))
      (is (= :dashboard (:kind (nth fs 5)))))))

(deftest format-findings-test
  (testing "no format file, an unknown format version, or two format files is a finding"
    (is (= #{:no-format} (finding-types [leaf-file])))
    (is (= #{:no-format} (finding-types [])))
    (is (= #{:unknown-format} (finding-types [(utf-8 "format: library-branching/2\n") leaf-file])))
    (is (= #{:unknown-format} (finding-types [(utf-8 "format: 1\n") leaf-file])))
    (is (= #{:duplicate-format} (finding-types [format-file format-file leaf-file]))))
  (testing "a tree with only the format file is the empty snapshot"
    (is (= {:snapshot {}} (tree/decode-tree toy/codecs [format-file])))))

(defspec decode-files-test 100
  (prop/for-all [s (toy/toy-snapshot-gen)]
    (let [contents (vec (vals (writer/encode-tree toy/codecs s)))
          r        (tree/decode-files toy/codecs contents)
          by-name  (update-keys (codec/by-kind toy/codecs) name)]
      (and (= (tree/decode-tree toy/codecs contents) (dissoc r :files))
           (= (set (keys s)) (set (keys (:files r))))
           (every? (fn [[id n]] (= id (first (:item (tree/decode-file by-name (nth contents n)))))) (:files r))))))

(deftest decode-files-findings-test
  (testing "a tree that does not decode gives the findings of decode-tree, and no files"
    (let [contents (conj (example-files) leaf-file)]
      (is (= (tree/decode-tree toy/codecs contents) (tree/decode-files toy/codecs contents))))))

(deftest place-from-directory-fails-test
  ;; Alloy PlaceFromDirectoryFails: if a file does not hold its place, two different snapshots give the same files.
  (testing "without the place in the file, a nested folder and a root-level folder give the same file contents"
    (let [no-place (fn [c] (reify codec/Codec
                             (kind [_] (codec/kind c))
                             (encode [_ id item] (dissoc (codec/encode c id item) :place))
                             (decode [_ doc] (codec/decode c doc))
                             (schema [_] (codec/schema c))))
          folder   (no-place (first toy/codecs))
          contents (fn [s] (frequencies (map (fn [[id item]] (seq (writer/write-yaml (codec/encode folder id item)))) s)))
          a        {folder-id {:kind :folder :name "A" :place nil :refs #{} :attrs {}}
                    leaf-id   {:kind :folder :name "B" :place nil :refs #{} :attrs {}}}
          b        (assoc-in a [leaf-id :place] folder-id)]
      (is (not= a b))
      (is (= (contents a) (contents b)))
      (testing "with the place in the file, they differ"
        (is (not= (vals (writer/encode-tree toy/codecs a)) (vals (writer/encode-tree toy/codecs b))))
        (is (= {:snapshot b} (tree/decode-tree toy/codecs (vals (writer/encode-tree toy/codecs b)))))))))

;;; ---------------------------------------------------- Mutations ----------------------------------------------------

(def ^:private mutations
  [{:name   :duplicates-allowed
    :doc    "decode-tree keeps one of two files with one identity, so a hand-edit or a text merge loses an item in
            silence."
    :target `tree/duplicate-findings
    :edits  [[:replace '(< 1 (count files)) false]]}
   {:name   :format-unchecked
    :doc    "decode-tree accepts a tree with no format file or with an unknown version."
    :target `tree/format-findings
    :edits  [[:replace '(= format-version (:format doc)) true] [:replace '(empty? docs) false]]}
   {:name   :schema-unchecked
    :doc    "decode-tree takes what a codec returns without the check against the codec's schema."
    :target `tree/decode-file
    :edits  [[:replace '(registry/validate (codec/schema c) item) true]]}])

(deftest tree-mutations-test
  (mut/check mutations {:tests [#'duplicate-identity-test #'format-findings-test #'file-findings-test]}))
