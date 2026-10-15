(ns metabase-enterprise.library-branching.instance.save-rule
  "The save rule of the instance: a save may not make an in-scope item refer to an item that is not in scope, one
  outside the Library tree or in the trash. A trash or a move out of the Library of an item that in-scope content uses
  is such a save, and so is a save that adds a reference to an item outside the Library. The rule is early feedback:
  the structural validation of a push or a pull finds every such reference."
  (:require
   [clojure.set :as set]
   [metabase-enterprise.library-branching.db :as library-branching.db]
   [metabase-enterprise.library-branching.instance.app-db :as app-db]
   [metabase-enterprise.library-branching.scope :as scope]))

(set! *warn-on-reflection* true)

(defn- item-target?
  [target]
  (not (and (vector? target) (= :env (first target)))))

(defn findings
  "The references of the items of snapshot `s` to items whose identity is not in `in-scope`, a set of identities:
  `#{{:user identity :role role :target identity}}`."
  [s in-scope]
  (set (for [[id {:keys [refs]}] s
             [role target]       refs
             :when               (and (item-target? target) (not (contains? in-scope target)))]
         {:user id :role role :target target})))

(defn current-findings
  "[[findings]] of the synced snapshot of the app DB, against the in-scope identities of every kind of scope, read in
  the current transaction."
  []
  (findings (app-db/read-current) (into #{} cat (vals (scope/scope-ids)))))

(defn- describe
  "The findings `fs` of the snapshots `before` and `after`, with the kind and name of each user, sorted."
  [fs before after]
  (->> fs
       (map (fn [{:keys [user] :as f}]
              (let [{:keys [kind name]} (or (get after user) (get before user))]
                (assoc f :user-kind kind :user-name name))))
       (sort-by (juxt :user-name (comp str :target)))
       vec))

(defn do-with-save-rule
  "Calls `f` with no arguments in a transaction and returns its result, unless the save adds a reference from an
  in-scope item to an item that is not in scope. Then the transaction rolls back, and this throws an ex-info of type
  ::refused with status code 400 and `:findings`: each added reference `{:user :user-kind :user-name :role :target}`.
  A reference that was there before the save does not refuse it."
  [f]
  (library-branching.db/do-in-transaction
   (fn []
     (let [before   (app-db/read-current)
           in-scope #(into #{} cat (vals (scope/scope-ids)))
           old      (findings before (in-scope))
           result   (f)
           after    (app-db/read-current)
           added    (set/difference (findings after (in-scope)) old)]
       (when (seq added)
         (let [described (describe added before after)]
           (throw (ex-info (str "Library items would use items that are not in the Library: "
                                (apply str (interpose ", " (map (fn [{:keys [user-name target]}]
                                                                  (str user-name " uses " target))
                                                                described))))
                           {:type        ::refused
                            :status-code 400
                            :findings    described}))))
       result))))
