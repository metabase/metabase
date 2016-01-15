(ns metabase.models.hydrate-test
  (:require [expectations :refer :all]
            [medley.core :as m]
            [metabase.models.hydrate :refer :all]
            (metabase.test [data :refer :all]
                           [util :refer :all])
            [metabase.test.data.users :refer :all]))

(def d1 (delay 1))
(def d2 (delay 2))
(def d3 (delay 3))
(def d4 (delay 4))
(def d5 (delay 5))
(def d6 (delay 6))

;; ## TESTS FOR HYDRATION HELPER FNS

;; ### k->k_id
(def k->k_id (ns-resolve 'metabase.models.hydrate 'k->k_id))

(expect :user_id
  (k->k_id :user))

(expect :toucan_id
  (k->k_id :toucan))

;; ### can-batched-hydrate?
(def can-batched-hydrate? (ns-resolve 'metabase.models.hydrate 'can-batched-hydrate?))

;; should fail for unknown keys
(expect false
  (can-batched-hydrate? [{:a_id 1} {:a_id 2}] :a))

;; should work for known keys if k_id present in every map
(expect true
  (can-batched-hydrate? [{:user_id 1} {:user_id 2}] :user))

;; should fail for known keys if k_id isn't present in every map
(expect false
  (can-batched-hydrate? [{:user_id 1} {:user_id 2} {:x 3}] :user))

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
  (counts-of [{:f d1}
              {:f d2}]
             :f))

(expect [2 2]
  (counts-of [{:f [d1 d2]}
              {:f [d3 d4]}]
             :f))

(expect [3 2]
  (counts-of [{:f [{:g {:i d1}}
                   {:g {:i d2}}
                   {:g {:i d3}}]}
              {:f [{:g {:i d4}}
                   {:g {:i d5}}]}]
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
    (counts-of [{:f {:g d1}}
                {:f {:g d2}}
                {:f nil}
                {:f {:g d4}}]
               :f))

(expect [:atom nil :nil :atom]
  (counts-of [{:h {:i d1}}
              {}
              {:h nil}
              {:h {:i d3}}]
             :h))

;; ### counts-flatten
(def counts-flatten (ns-resolve 'metabase.models.hydrate 'counts-flatten))

(expect [{:g {:i d1}}
         {:g {:i d2}}
         {:g {:i d3}}
         {:g {:i d4}}
         {:g {:i d5}}]
  (counts-flatten [{:f [{:g {:i d1}}
                        {:g {:i d2}}
                        {:g {:i d3}}]}
                   {:f [{:g {:i d4}}
                        {:g {:i d5}}]}]
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

(expect [{:f [{:g {:i d1}}
              {:g {:i d2}}
              {:g {:i d3}}]}
         {:f [{:g {:i d4}}
              {:g {:i d5}}]}]
  (counts-unflatten [{:g {:i d1}}
                     {:g {:i d2}}
                     {:g {:i d3}}
                     {:g {:i d4}}
                     {:g {:i d5}}] :f [3 2]))

(expect [{:f {:g 1}}
                   {:f {:g 2}}
                   nil
                   {:f {:g 4}}]
  (counts-unflatten [{:g 1} {:g 2} nil {:g 4}]
                    :f
                    [:atom :atom nil :atom]))

;; ### counts-apply
(def counts-apply (ns-resolve 'metabase.models.hydrate 'counts-apply))

(expect [{:f d1}
         {:f d2}]
  (counts-apply [{:f d1}
                 {:f d2}]
                :f
                identity))

(expect [{:f [d1 d2]}
         {:f [d3 d4]}]
  (counts-apply [{:f [d1 d2]}
                 {:f [d3 d4]}]
                :f
                identity))

(expect [{:f [{:g {:i d1}}
              {:g {:i d2}}
              {:g {:i d3}}]}
         {:f [{:g {:i d4}}
              {:g {:i d5}}]}]
  (counts-apply [{:f [{:g {:i d1}}
                      {:g {:i d2}}
                      {:g {:i d3}}]}
                 {:f [{:g {:i d4}}
                      {:g {:i d5}}]}]
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
(def hydrate-vector (ns-resolve 'metabase.models.hydrate 'hydrate-vector))

;; check with a nested hydration that returns one result
(expect [{:f {:g 1}}]
    (hydrate-vector [{:f (delay {:g d1})}]
                    [:f :g]))

(expect [{:f {:g 1}}
         {:f {:g 2}}]
  (hydrate-vector [{:f (delay {:g d1})}
                   {:f (delay {:g d2})}]
                  [:f :g]))

;; check with a nested hydration that returns multiple results
(expect [{:f [{:g 1}
              {:g 2}
              {:g 3}]}]
  (hydrate-vector [{:f (delay [{:g d1}
                               {:g d2}
                               {:g d3}])}]
                  [:f :g]))

;; ### hydrate-kw
(def hydrate-kw (ns-resolve 'metabase.models.hydrate 'hydrate-kw))
(expect [{:g 1}
         {:g 2}
         {:g 3}]
    (hydrate-kw [{:g d1}
                 {:g d2}
                 {:g d3}] :g))

;; ### batched-hydrate

;; ### hydrate - tests for overall functionality

;; make sure we can do basic hydration
(expect {:a 1 :b 2}
        (hydrate {:a 1
                  :b d2}
                 :b))

;; specifying "nested" hydration with no "nested" keys should throw an exception and tell you not to do it
(expect "Assert failed: Replace '[:b]' with ':b'. Vectors are for nested hydration. There's no need to use one when you only have a single key.\n(> (count vect) 1)"
  (try (hydrate {:a 1
                 :b d2}
                [:b])
       (catch Throwable e
         (.getMessage e))))

;; check that returning an array works correctly
(expect {:c [1 2 3]}
        (hydrate {:c (delay [1 2 3])} :c))

;; check that nested keys aren't hydrated if we don't ask for it
(expect {:d {:e d1}}
  (hydrate {:d (delay {:e d1})}
           :d))

;; check that nested keys can be hydrated if we DO ask for it
(expect {:d {:e 1}}
  (hydrate {:d (delay {:e d1})}
           [:d :e]))

;; check that nested hydration also works if one step returns multiple results
(expect {:f [{:g 1}
             {:g 2}
             {:g 3}]}
  (hydrate {:f (delay [{:g d1}
                       {:g d2}
                       {:g d3}])}
           [:f :g]))

;; check nested hydration with nested maps
(expect [{:f {:g 1}}
         {:f {:g 2}}
         {:f {:g 3}}
         {:f {:g 4}}]
  (hydrate [{:f {:g d1}}
            {:f {:g d2}}
            {:f {:g d3}}
            {:f {:g d4}}] [:f :g]))

;; check with a nasty mix of maps and seqs
(expect [{:f [{:g 1} {:g 2} {:g 3}]}
         {:f {:g 1}}
         {:f [{:g 4} {:g 5} {:g 6}]}]
  (hydrate [{:f [{:g d1}
                 {:g d2}
                 {:g d3}]}
            {:f {:g d1}}
            {:f [{:g d4}
                 {:g d5}
                 {:g d6}]}] [:f :g]))

;; check that hydration works with top-level nil values
(expect [{:f 1}
         {:f 2}
         nil
         {:f 4}]
    (hydrate [{:f d1}
              {:f d2}
              nil
              {:f d4}] :f))

;; check nested hydration with top-level nil values
(expect [{:f {:g 1}}
         {:f {:g 2}}
         nil
         {:f {:g 4}}]
  (hydrate [{:f {:g d1}}
            {:f {:g d2}}
            nil
            {:f {:g d4}}] [:f :g]))

;; check that nested hydration w/ nested nil values
(expect [{:f {:g 1}}
         {:f {:g 2}}
         {:f nil}
         {:f {:g 4}}]
  (hydrate [{:f {:g d1}}
            {:f {:g d2}}
            {:f nil}
            {:f {:g d4}}] [:f :g]))

(expect [{:f {:g 1}}
         {:f {:g 2}}
         {:f {:g nil}}
         {:f {:g 4}}]
  (hydrate [{:f {:g d1}}
            {:f {:g d2}}
            {:f {:g nil}}
            {:f {:g d4}}] [:f :g]))

;; check that it works with some objects missing the key
(expect [{:f [{:g 1} {:g 2} {:h d3}]}
         {:f {:g 1}}
         {:f [{:g 4} {:h d5} {:g 6}]}]
    (hydrate [{:f [{:g d1}
                   {:g d2}
                   {:h d3}]}
              {:f  {:g d1}}
              {:f [{:g d4}
                   {:h d5}
                   {:g d6}]}] [:f :g]))

;; check that we can handle wonky results: :f is [sequence, map sequence] respectively
(expect [{:f [{:g 1, :h 1} {:g 2} {:g 3, :h 3}]}
         {:f {:g 1, :h 1}}
         {:f [{:g 4} {:g 5, :h 5} {:g 6}]}]
  (hydrate [{:f [{:g d1 :h d1}
                 {:g d2}
                 {:g d3 :h d3}]}
            {:f  {:g d1 :h d1}}
            {:f [{:g d4}
                 {:g d5 :h d5}
                 {:g d6}]}] [:f :g :h]))

;; nested-nested hydration
(expect [{:f [{:g {:i 1}}
              {:g {:i 2}}
              {:g {:i 3}}]}
         {:f [{:g {:i 4}}
              {:g {:i 5}}]}]
  (hydrate [{:f [{:g {:i d1}}
                 {:g {:i d2}}
                 {:g {:i d3}}]}
            {:f [{:g {:i d4}}
                 {:g {:i d5}}]}]
           [:f [:g :i]]))

;; nested + nested-nested hydration
(expect [{:f [{:g 1 :h {:i 1}}]}
         {:f [{:g 2 :h {:i 4}}
              {:g 3 :h {:i 5}}]}]
  (hydrate [{:f [{:g d1 :h {:i d1}}]}
            {:f [{:g d2 :h {:i d4}}
                 {:g d3 :h {:i d5}}]}]
           [:f :g [:h :i]]))

;; make sure nested-nested hydration doesn't accidentally return maps where there were none
(expect {:f [{:h {:i 1}}
             {}
             {:h {:i 3}}]}
  (hydrate {:f [{:h {:i d1}}
                {}
                {:h {:i d3}}]}
           [:f [:h :i]]))

;; check nested hydration with several keys
(expect [{:f [{:g 1
               :h {:i 1, :j 1}}]}
         {:f [{:g 2
               :h {:i 4, :j 2}}
              {:g 3
               :h {:i 5, :j 3}}]}]
  (hydrate [{:f [{:g d1 :h {:i d1 :j d1}}]}
            {:f [{:g d2 :h {:i d4 :j d2}}
                 {:g d3 :h {:i d5 :j d3}}]}]
           [:f :g [:h :i :j]]))

;; multiple nested-nested hydrations
(expect [{:f [{:g {:k 1}
               :h {:i {:j 1}}}]}
         {:f [{:g {:k 2}
               :h {:i {:j 2}}}
              {:g {:k 3}
               :h {:i {:j 3}}}]}]
  (hydrate [{:f [{:g {:k d1}
                  :h (delay {:i {:j d1}})}]}
            {:f [{:g {:k d2}
                  :h (delay {:i {:j d2}})}
                 {:g {:k d3}
                  :h (delay {:i {:j d3}})}]}]
           [:f [:g :k] [:h [:i :j]]]))

;; *nasty* nested-nested hydration
(expect [{:f [{:g 1 :h {:i 1}}
              {:g 2}
              {:g 3 :h {:i 3}}]}
         {:f  {:g 1 :h {:i 1}}}
         {:f [{:g 4}
              {:g 5 :h {:i 5}}
              {:g 6}]}]
  (hydrate [{:f [{:g d1 :h {:i d1}}
                 {:g d2}
                 {:g d3 :h {:i d3}}]}
            {:f  {:g d1 :h {:i d1}}}
            {:f [{:g d4}
                 {:g d5 :h {:i d5}}
                 {:g d6}]}]
           [:f :g [:h :i]]))

;; check that hydration doesn't barf if we ask it to hydrate an object that's not there
(expect {:f [:a 100]}
  (hydrate {:f [:a 100]} :x))

;;; ## BATCHED HYDRATION TESTS

(resolve-private-fns metabase.middleware remove-fns-and-delays)

;; Just double-check that batched hydration can hydrate fields with no delays
(expect (match-$ (fetch-user :rasta)
          {:email "rasta@metabase.com"
           :first_name "Rasta"
           :last_login $
           :is_superuser false
           :id $
           :last_name "Toucan"
           :date_joined $
           :common_name "Rasta Toucan"})
  (->> (hydrate {:user_id (user->id :rasta)} :user)
       :user
       remove-fns-and-delays))

;; Check that batched hydration doesn't try to hydrate fields that already exist and are not delays
(expect {:user_id (user->id :rasta)
         :user "OK <3"}
  (hydrate {:user_id (user->id :rasta)
            :user "OK <3"}
           :user))

;; Check that batched hydration just re-uses values of delays that have been realized
(expect {:user_id (user->id :rasta)
         :user "OK <3"}
  (let [user-delay (delay "OK <3")]
    @user-delay
    (hydrate {:user_id (user->id :rasta)
              :user user-delay}
             :user)))
