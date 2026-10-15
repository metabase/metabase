(ns metabase-enterprise.library-branching.branch
  "The creation of a branch of the repository, with no instance: a compare-and-swap of a ref that must not exist."
  (:require
   [metabase-enterprise.library-branching.store :as store]))

(set! *warn-on-reflection* true)

(defn create-branch!
  "Creates branch `branch-name` of `store` at the head of branch `from`. Returns one of:

  - `{:result :created :commit h}`: `branch-name` is at `h`, the head of `from`;
  - `{:result :branch-exists :head actual}`: `branch-name` exists at `actual`, and stays there;
  - `{:result :no-branch :ref from}`: `from` does not exist;
  - `{:result :fenced :reason r}`: `(:commit-point opts)` returned `r`, and the remote did not change.

  Only `:created` changes a ref. `opts`: `:commit-point`, a function of no argument that is called once, after the
  checks and before the remote changes, and returns nil to go on, else the reason to stop (default: always nil)."
  ([store branch-name from]
   (create-branch! store branch-name from {}))
  ([store branch-name from {:keys [commit-point] :or {commit-point (constantly nil)}}]
   (let [h        (store/head store from)
         existing (when h (store/head store branch-name))]
     (cond
       (nil? h)                 {:result :no-branch :ref from}
       existing                 {:result :branch-exists :head existing}
       :else
       (if-let [reason (commit-point)]
         {:result :fenced :reason reason}
         ;; the compare-and-swap from no ref also refuses a branch that someone created after the read
         (let [moved (store/cas-ref! store branch-name nil h)]
           (if (= :ok moved)
             {:result :created :commit h}
             {:result :branch-exists :head (:moved moved)})))))))
