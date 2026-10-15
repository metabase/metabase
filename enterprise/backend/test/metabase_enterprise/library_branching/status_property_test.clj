(ns metabase-enterprise.library-branching.status-property-test
  "Laws of the status: the remote changes over the changed paths equal the remote changes of a full decode, and both
  equal the difference of content of the two snapshots, whatever paths the files of the head have; the local changes by
  digest equal the difference of content; the change list lists each change once; the cache answers only for its key
  and its time to live."
  {:clj-kondo/config '{:lint-as {metabase-enterprise.library-branching.push-test-util/with-remote clojure.core/fn}}}
  (:require
   [clojure.set :as set]
   [clojure.test :refer :all]
   [clojure.test.check.clojure-test :refer [defspec]]
   [clojure.test.check.generators :as gen]
   [clojure.test.check.properties :as prop]
   [metabase-enterprise.library-branching.engine.diff :as diff]
   [metabase-enterprise.library-branching.features-test-util :as features.tu]
   [metabase-enterprise.library-branching.format.kinds :as kinds]
   [metabase-enterprise.library-branching.format.writer :as writer]
   [metabase-enterprise.library-branching.pull-test-util :as pltu]
   [metabase-enterprise.library-branching.push-test-util :as ptu :refer [with-remote]]
   [metabase-enterprise.library-branching.snapshot :as snapshot]
   [metabase-enterprise.library-branching.status :as status]
   [metabase-enterprise.library-branching.store :as store]
   [metabase.test.fixtures :as fixtures]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db) features.tu/with-features)

;;; ---------------------------------------------------- Generators ----------------------------------------------------

(defn- leaves
  "The identities of the items of `s` that are the place of no item."
  [s]
  (set/difference (set (keys s)) (set (keep :place (vals s)))))

(defn- edited
  "Snapshot `s` with the edit of `choices` (a vector of keywords, used in turn) for each item in the order of the
  identities: `:keep`, `:rename`, or `:delete` (for a leaf only), then the items of `added`."
  [s choices added]
  (let [ids    (sort snapshot/compare-identities (keys s))
        leaf?  (leaves s)
        choice (fn [i] (if (seq choices) (nth choices (mod i (count choices))) :keep))]
    (merge (reduce (fn [acc [i id]]
                     (case (choice i)
                       :keep   acc
                       :rename (assoc-in acc [id :name] (str (get-in acc [id :name]) " renamed"))
                       :delete (if (leaf? id) (dissoc acc id) acc)))
                   s
                   (map-indexed vector ids))
           added)))

(def ^:private edit-gen
  (gen/vector (gen/elements [:keep :keep :rename :delete]) 1 8))

(defn- moved-tree
  "The tree of snapshot `s`, with the file of each item for which `moves` (booleans, used in turn) says true at a new
  path, and `foreign` foreign files."
  [s moves foreign]
  (let [files (writer/encode-tree kinds/codecs s)
        paths (sort (keys files))]
    (merge (into {}
                 (map-indexed (fn [i p]
                                (if (and (seq moves) (nth moves (mod i (count moves))) (not= ".metabase/format.yaml" p))
                                  [(str "moved/" i ".yaml") (get files p)]
                                  [p (get files p)])))
                 paths)
           (into {} (map (fn [i] [(str "notes/" i ".txt") (ptu/utf8 (str "note " i))])) (range foreign)))))

;;; -------------------------------------------------- Remote changes --------------------------------------------------

(defspec remote-changes-equal-the-difference-of-content-property-test 40
  (prop/for-all [b       ptu/pushable-snapshot-gen
                 edits   edit-gen
                 added   (gen/frequency [[2 (gen/return {})] [1 ptu/pushable-snapshot-gen]])
                 moves   (gen/vector gen/boolean 0 6)
                 foreign (gen/choose 0 2)]
    (with-remote [repo s]
      (let [r    (edited b edits added)
            c1   (pltu/commit-snapshot! repo ptu/branch [] b)
            h    (pltu/commit-on! repo ptu/branch [c1] (moved-tree r moves foreign))
            _    (store/head s ptu/branch)
            opts {:base-digests (writer/item-digests kinds/codecs b)}
            want {:changes (diff/diff b r)}]
        (and (= want (status/remote-changes s c1 h opts))
             (= want (status/full-remote-changes s c1 h opts))
             (= want (status/full-remote-changes s c1 h {})))))))

;;; -------------------------------------------------- Local changes ---------------------------------------------------

(defspec local-changes-equal-the-difference-of-content-property-test 50
  (prop/for-all [b     ptu/pushable-snapshot-gen
                 edits edit-gen
                 added (gen/frequency [[2 (gen/return {})] [1 ptu/pushable-snapshot-gen]])]
    (let [l    (edited b edits added)
          inst (pltu/memory-instance (atom {:snapshot l :base "base" :digests (writer/item-digests kinds/codecs b)}))
          {:keys [changes local]} (status/local-changes inst (fn [_f] (throw (ex-info "no store" {}))) ptu/branch {})]
      (and (= l local)
           (= (diff/diff b l) changes)
           (= (status/changed? changes) (not= b l))))))

(defspec change-list-lists-each-change-once-property-test 50
  (prop/for-all [b     ptu/pushable-snapshot-gen
                 edits edit-gen
                 added (gen/frequency [[2 (gen/return {})] [1 ptu/pushable-snapshot-gen]])]
    (let [l       (edited b edits added)
          changes (diff/diff b l)
          entries (status/change-list changes l b)]
      (and (= (map :id entries) (sort snapshot/compare-identities (map :id entries)))
           (= (count entries) (count (distinct (map :id entries))))
           (= changes (merge status/no-changes
                             (update-vals (group-by :change entries) #(set (map :id %)))))
           (every? (fn [{:keys [id change] :as entry}]
                     (let [item (get (if (= :deleted change) b l) id)]
                       (= entry {:id id :kind (:kind item) :name (:name item) :change change})))
                   entries)))))

;;; ------------------------------------------------------ Cache -------------------------------------------------------

(defspec cached-answer-law-property-test 200
  (prop/for-all [k       (gen/elements [[:a] [:b]])
                 key     (gen/elements [[:a] [:b]])
                 at      (gen/choose 0 1000)
                 elapsed (gen/choose 0 2000)
                 ttl     (gen/choose 0 1000)]
    (let [entry {:key k :at at :answer {:has-changes true}}]
      (= (when (and (= k key) (< elapsed ttl)) {:has-changes true})
         (status/cached-answer entry key (+ at elapsed) ttl)))))
