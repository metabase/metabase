(ns metabase.models.hydrate-test
  (:require [clojure.set :as set]
            [expectations :refer :all]
            [medley.core :as m]
            [metabase.models.hydrate :refer :all]
            (metabase.test [data :refer :all]
                           [util :refer :all])
            [metabase.test.data.users :refer :all]
            [metabase.util :as u]))

;; we'll swap out hydration-key->f with one that will track the keys used, and we'll warn about unused ones at the end

(let [used-fn-keys     (atom #{})
      hydration-key->f @(resolve 'metabase.models.hydrate/hydration-key->f)]
  (intern 'metabase.models.hydrate 'hydration-key->f
          (fn [k]
            (swap! used-fn-keys conj k)
            (hydration-key->f k)))
  (defn- check-all-hydration-keys-used
    {:expectations-options :after-run}
    []
    (let [hydrate-k->f   @@(resolve 'metabase.models.hydrate/k->f)
          available-keys (set (keys hydrate-k->f))
          used-keys      @used-fn-keys
          unused-keys    (set/difference available-keys used-keys)]
      (doseq [k unused-keys]
        (println (u/format-color 'red "WARNING: %s is marked `^:hydrate` but is never used for hydration." (hydrate-k->f k)))))))

(let [used-fn-keys             (atom #{})
      hydration-key->batched-f @(resolve 'metabase.models.hydrate/hydration-key->batched-f)]
  (intern 'metabase.models.hydrate 'hydration-key->batched-f
          (fn [k]
            (swap! used-fn-keys conj k)
            (hydration-key->batched-f k)))
  (defn- check-all-batched-hydration-keys-used
    {:expectations-options :after-run}
    []
    (let [hydrate-k->f   @@(resolve 'metabase.models.hydrate/k->batched-f)
          available-keys (set (keys hydrate-k->f))
          used-keys      @used-fn-keys
          unused-keys    (set/difference available-keys used-keys)]
      (doseq [k unused-keys]
        (println (u/format-color 'red "WARNING: %s is marked `^:batched-hydrate` but is never used for hydration." (hydrate-k->f k)))))))


(defn- ^:hydrate x [{:keys [id]}]
  id)

(defn- ^:hydrate y [{:keys [id2]}]
  id2)

(defn- ^:hydrate z [{:keys [n]}]
  (vec (for [i (range n)]
         {:id i})))

;; ## TESTS FOR HYDRATION HELPER FNS

;; ### k->k_id
(def k->k_id (ns-resolve 'metabase.models.hydrate 'k->k_id))

(expect :user_id
  (k->k_id :user))

(expect :toucan_id
  (k->k_id :toucan))

;; ### can-automagically-batched-hydrate?
(def can-automagically-batched-hydrate? (ns-resolve 'metabase.models.hydrate 'can-automagically-batched-hydrate?))

;; should fail for unknown keys
(expect false
  (can-automagically-batched-hydrate? [{:a_id 1} {:a_id 2}] :a))

;; should work for known keys if k_id present in every map
(expect true
  (can-automagically-batched-hydrate? [{:user_id 1} {:user_id 2}] :user))

;; should fail for known keys if k_id isn't present in every map
(expect false
  (can-automagically-batched-hydrate? [{:user_id 1} {:user_id 2} {:x 3}] :user))

;; ### valid-hydration-form?
(def valid-hydration-form? (ns-resolve 'metabase.models.hydrate 'valid-hydration-form?))
(expect true  (valid-hydration-form? :k))
(expect true  (valid-hydration-form? [:k]))
(expect true  (valid-hydration-form? [:k :k2]))
(expect true  (valid-hydration-form? [:k [:k2]]))
(expect true  (valid-hydration-form? [:k [:k2] :k3]))
(expect true  (valid-hydration-form? [:k [:k2 :k3] :k4]))
(expect true  (valid-hydration-form? [:k [:k2 [:k3]] :k4]))
(expect false (valid-hydration-form? 'k))
(expect false (valid-hydration-form? [[:k]]))
(expect false (valid-hydration-form? [:k [[:k2]]]))
(expect false (valid-hydration-form? [:k 'k2]))
(expect false (valid-hydration-form? ['k :k2]))
(expect false (valid-hydration-form? "k"))


;; ### counts-of
(def counts-of (ns-resolve 'metabase.models.hydrate 'counts-of))

(expect [:atom :atom]
  (counts-of [{:f {:id 1}}
              {:f {:id 2}}]
             :f))

(expect [2 2]
  (counts-of [{:f [{:id 1} {:id 2}]}
              {:f [{:id 3} {:id 4}]}]
             :f))

(expect [3 2]
  (counts-of [{:f [{:g {:i {:id 1}}}
                   {:g {:i {:id 2}}}
                   {:g {:i {:id 3}}}]}
              {:f [{:g {:i {:id 4}}}
                   {:g {:i {:id 5}}}]}]
             :f))

(expect [2 :atom :nil]
  (counts-of [{:f [:a :b]}
              {:f {:c 1}}
              {:f nil}]
             :f))

(expect [:atom
         :atom
         :nil
         :atom]
    (counts-of [{:f {:id 1}}
                {:f {:id 2}}
                {:f nil}
                {:f {:id 4}}]
               :f))

(expect [:atom nil :nil :atom]
  (counts-of [{:h {:i {:id 1}}}
              {}
              {:h nil}
              {:h {:i {:id 3}}}]
             :h))

;; ### counts-flatten
(def counts-flatten (ns-resolve 'metabase.models.hydrate 'counts-flatten))

(expect [{:g {:i {:id 1}}}
         {:g {:i {:id 2}}}
         {:g {:i {:id 3}}}
         {:g {:i {:id 4}}}
         {:g {:i {:id 5}}}]
  (counts-flatten [{:f [{:g {:i {:id 1}}}
                        {:g {:i {:id 2}}}
                        {:g {:i {:id 3}}}]}
                   {:f [{:g {:i {:id 4}}}
                        {:g {:i {:id 5}}}]}]
                  :f))

(expect [1 2 nil]
  (counts-flatten [{:f 1}
                   {:f 2}
                   nil]
                  :f))

(expect [{:g 1} {:g 2} nil {:g 4}]
  (counts-flatten [{:f {:g 1}}
                   {:f {:g 2}}
                   nil
                   {:f {:g 4}}]
                  :f))

;; ### counts-unflatten
(def counts-unflatten (ns-resolve 'metabase.models.hydrate 'counts-unflatten))

(expect [{:f [{:g {:i {:id 1}}}
              {:g {:i {:id 2}}}
              {:g {:i {:id 3}}}]}
         {:f [{:g {:i {:id 4}}}
              {:g {:i {:id 5}}}]}]
  (counts-unflatten [{:g {:i {:id 1}}}
                     {:g {:i {:id 2}}}
                     {:g {:i {:id 3}}}
                     {:g {:i {:id 4}}}
                     {:g {:i {:id 5}}}] :f [3 2]))

(expect [{:f {:g 1}}
                   {:f {:g 2}}
                   nil
                   {:f {:g 4}}]
  (counts-unflatten [{:g 1} {:g 2} nil {:g 4}]
                    :f
                    [:atom :atom nil :atom]))

;; ### counts-apply
(def counts-apply (ns-resolve 'metabase.models.hydrate 'counts-apply))

(expect [{:f {:id 1}}
         {:f {:id 2}}]
  (counts-apply [{:f {:id 1}}
                 {:f {:id 2}}]
                :f
                identity))

(expect [{:f [{:id 1} {:id 2}]}
         {:f [{:id 3} {:id 4}]}]
  (counts-apply [{:f [{:id 1} {:id 2}]}
                 {:f [{:id 3} {:id 4}]}]
                :f
                identity))

(expect [{:f [{:g {:i {:id 1}}}
              {:g {:i {:id 2}}}
              {:g {:i {:id 3}}}]}
         {:f [{:g {:i {:id 4}}}
              {:g {:i {:id 5}}}]}]
  (counts-apply [{:f [{:g {:i {:id 1}}}
                      {:g {:i {:id 2}}}
                      {:g {:i {:id 3}}}]}
                 {:f [{:g {:i {:id 4}}}
                      {:g {:i {:id 5}}}]}]
                :f
                identity))

(expect [{:f {:g 1}}
         {:f {:g 2}}
         {:f nil}
         nil
         {:f {:g 3}}]
  (counts-apply [{:f {:g 1}}
                 {:f {:g 2}}
                 {:f nil}
                 nil
                 {:f {:g 3}}]
                :f
                identity))

;; ## TESTS FOR HYDRATE INTERNAL FNS

;; ### hydrate-vector (nested hydration)
(def hydrate-vector (resolve 'metabase.models.hydrate/hydrate-vector))

;; check with a nested hydration that returns one result
(expect
  [{:f {:id 1, :x 1}}]
  (hydrate-vector [{:f {:id 1}}]
                  [:f :x]))

(expect
  [{:f {:id 1, :x 1}}
   {:f {:id 2, :x 2}}]
  (hydrate-vector [{:f {:id 1}}
                   {:f {:id 2}}]
                  [:f :x]))

;; check with a nested hydration that returns multiple results
(expect
  [{:f [{:id 1, :x 1}
        {:id 2, :x 2}
        {:id 3, :x 3}]}]
  (hydrate-vector [{:f [{:id 1}
                        {:id 2}
                        {:id 3}]}]
                  [:f :x]))

;; ### hydrate-kw
(def hydrate-kw (ns-resolve 'metabase.models.hydrate 'hydrate-kw))
(expect
  [{:id 1, :x 1}
   {:id 2, :x 2}
   {:id 3, :x 3}]
  (hydrate-kw [{:id 1}
               {:id 2}
               {:id 3}] :x))

;; ### batched-hydrate

;; ### hydrate - tests for overall functionality

;; make sure we can do basic hydration
(expect
  {:a 1, :id 2, :x 2}
  (hydrate {:a 1, :id 2}
           :x))

;; specifying "nested" hydration with no "nested" keys should throw an exception and tell you not to do it
(expect "Assert failed: Replace '[:b]' with ':b'. Vectors are for nested hydration. There's no need to use one when you only have a single key.\n(> (count vect) 1)"
  (try (hydrate {:a 1, :id 2}
                [:b])
       (catch Throwable e
         (.getMessage e))))

;; check that returning an array works correctly
(expect {:n 3
         :z [{:id 0}
             {:id 1}
             {:id 2}]}
        (hydrate {:n 3} :z))

;; check that nested keys aren't hydrated if we don't ask for it
(expect {:d {:id 1}}
  (hydrate {:d {:id 1}}
           :d))

;; check that nested keys can be hydrated if we DO ask for it
(expect {:d {:id 1, :x 1}}
  (hydrate {:d {:id 1}}
           [:d :x]))

;; check that nested hydration also works if one step returns multiple results
(expect {:n 3
         :z [{:id 0, :x 0}
             {:id 1, :x 1}
             {:id 2, :x 2}]}
  (hydrate {:n 3} [:z :x]))

;; check nested hydration with nested maps
(expect [{:f {:id 1, :x 1}}
         {:f {:id 2, :x 2}}
         {:f {:id 3, :x 3}}
         {:f {:id 4, :x 4}}]
  (hydrate [{:f {:id 1}}
            {:f {:id 2}}
            {:f {:id 3}}
            {:f {:id 4}}] [:f :x]))

;; check with a nasty mix of maps and seqs
(expect [{:f [{:id 1, :x 1} {:id 2, :x 2} {:id 3, :x 3}]}
         {:f {:id 1, :x 1}}
         {:f [{:id 4, :x 4} {:id 5, :x 5} {:id 6, :x 6}]}]
  (hydrate [{:f [{:id 1}
                 {:id 2}
                 {:id 3}]}
            {:f {:id 1}}
            {:f [{:id 4}
                 {:id 5}
                 {:id 6}]}] [:f :x]))

;; check that hydration works with top-level nil values
(expect [{:id 1, :x 1}
         {:id 2, :x 2}
         nil
         {:id 4, :x 4}]
    (hydrate [{:id 1}
              {:id 2}
              nil
              {:id 4}] :x))

;; check nested hydration with top-level nil values
(expect [{:f {:id 1, :x 1}}
         {:f {:id 2, :x 2}}
         nil
         {:f {:id 4, :x 4}}]
  (hydrate [{:f {:id 1}}
            {:f {:id 2}}
            nil
            {:f {:id 4}}] [:f :x]))

;; check that nested hydration w/ nested nil values
(expect [{:f {:id 1, :x 1}}
         {:f {:id 2, :x 2}}
         {:f nil}
         {:f {:id 4, :x 4}}]
  (hydrate [{:f {:id 1}}
            {:f {:id 2}}
            {:f nil}
            {:f {:id 4}}] [:f :x]))

(expect [{:f {:id 1, :x 1}}
         {:f {:id 2, :x 2}}
         {:f {:id nil, :x nil}}
         {:f {:id 4, :x 4}}]
  (hydrate [{:f {:id 1}}
            {:f {:id 2}}
            {:f {:id nil}}
            {:f {:id 4}}] [:f :x]))

;; check that it works with some objects missing the key
(expect
  [{:f [{:id 1, :x 1}
        {:id 2, :x 2}
        {:g 3, :x nil}]}
   {:f {:id 1, :x 1}}
   {:f [{:id 4, :x 4}
        {:g 5, :x nil}
        {:id 6, :x 6}]}]
  (hydrate [{:f [{:id 1}
                 {:id 2}
                 {:g 3}]}
            {:f  {:id 1}}
            {:f [{:id 4}
                 {:g 5}
                 {:id 6}]}] [:f :x]))

;; check that we can handle wonky results: :f is [sequence, map sequence] respectively
(expect
  [{:f [{:id 1, :id2 10, :x 1, :y 10}
        {:id 2, :x 2, :y nil}
        {:id 3, :id2 30, :x 3, :y 30}]}
   {:f {:id 1, :id2 10, :x 1, :y 10}}
   {:f [{:id 4, :x 4, :y nil}
        {:id 5, :id2 50, :x 5, :y 50}
        {:id 6, :x 6, :y nil}]}]
  (hydrate [{:f [{:id 1, :id2 10}
                 {:id 2}
                 {:id 3, :id2 30}]}
            {:f  {:id 1, :id2 10}}
            {:f [{:id 4}
                 {:id 5, :id2 50}
                 {:id 6}]}] [:f :x :y]))

;; nested-nested hydration
(expect
  [{:f [{:g {:id 1, :x 1}}
        {:g {:id 2, :x 2}}
        {:g {:id 3, :x 3}}]}
   {:f [{:g {:id 4, :x 4}}
        {:g {:id 5, :x 5}}]}]
  (hydrate [{:f [{:g {:id 1}}
                 {:g {:id 2}}
                 {:g {:id 3}}]}
            {:f [{:g {:id 4}}
                 {:g {:id 5}}]}]
           [:f [:g :x]]))

;; nested + nested-nested hydration
(expect
  [{:f [{:id 1, :g {:id 1, :x 1}, :x 1}]}
   {:f [{:id 2, :g {:id 4, :x 4}, :x 2}
        {:id 3, :g {:id 5, :x 5}, :x 3}]}]
  (hydrate [{:f [{:id 1, :g {:id 1}}]}
            {:f [{:id 2, :g {:id 4}}
                 {:id 3, :g {:id 5}}]}]
           [:f :x [:g :x]]))

;; make sure nested-nested hydration doesn't accidentally return maps where there were none
(expect
  {:f [{:h {:id 1, :x 1}}
       {}
       {:h {:id 3, :x 3}}]}
  (hydrate {:f [{:h {:id 1}}
                {}
                {:h {:id 3}}]}
           [:f [:h :x]]))

;; check nested hydration with several keys
(expect
  [{:f [{:id 1, :h {:id 1, :id2 1, :x 1, :y 1}, :x 1}]}
   {:f [{:id 2, :h {:id 4, :id2 2, :x 4, :y 2}, :x 2}
        {:id 3, :h {:id 5, :id2 3, :x 5, :y 3}, :x 3}]}]
  (hydrate [{:f [{:id 1, :h {:id 1, :id2 1}}]}
            {:f [{:id 2, :h {:id 4, :id2 2}}
                 {:id 3, :h {:id 5, :id2 3}}]}]
           [:f :x [:h :x :y]]))

;; multiple nested-nested hydrations
(expect
  [{:f [{:g {:id 1, :x 1}, :h {:i {:id2 1, :y 1}}}]}
   {:f [{:g {:id 2, :x 2}, :h {:i {:id2 2, :y 2}}}
        {:g {:id 3, :x 3}, :h {:i {:id2 3, :y 3}}}]}]
  (hydrate [{:f [{:g {:id 1}
                  :h {:i {:id2 1}}}]}
            {:f [{:g {:id 2}
                  :h {:i {:id2 2}}}
                 {:g {:id 3}
                  :h {:i {:id2 3}}}]}]
           [:f [:g :x] [:h [:i :y]]]))

;; *nasty* nested-nested hydration
(expect
  [{:f [{:id 1, :h {:id2 1, :y 1}, :x 1}
        {:id 2, :x 2}
        {:id 3, :h {:id2 3, :y 3}, :x 3}]}
   {:f {:id 1, :h {:id2 1, :y 1}, :x 1}}
   {:f [{:id 4, :x 4}
        {:id 5, :h {:id2 5, :y 5}, :x 5}
        {:id 6, :x 6}]}]
  (hydrate [{:f [{:id 1, :h {:id2 1}}
                 {:id 2}
                 {:id 3, :h {:id2 3}}]}
            {:f  {:id 1, :h {:id2 1}}}
            {:f [{:id 4}
                 {:id 5, :h {:id2 5}}
                 {:id 6}]}]
           [:f :x [:h :y]]))

;; check that hydration doesn't barf if we ask it to hydrate an object that's not there
(expect {:f [:a 100]}
  (hydrate {:f [:a 100]} :p))

;;; ## BATCHED HYDRATION TESTS

;; Check that batched hydration doesn't try to hydrate fields that already exist and are not delays
(expect {:user_id (user->id :rasta)
         :user "OK <3"}
  (hydrate {:user_id (user->id :rasta)
            :user "OK <3"}
           :user))
