(ns metabase.notes)

;; a reducing function (`rf`) is has the signature
;;
;; acc, arg -> acc

(defn incrementing-reducer [acc n]
  (conj acc ((fnil inc 0) n)))

(defn sum-reducer [acc n]
  ((fnil + 0 0) acc n))

;; a transducing function takes a reducing function and returns a new reducing function.
;;
;; rf                -> rf
;; (acc, arg -> acc) -> (acc, arg -> acc)

;; `rf` = the reducing function passed as an arg to this transducer
(defn inc-xf [rf]
  (fn
    ;; initial value arity - should call the init arity on the nested transform rf, which will eventually call out to
    ;; the transducing process.
    ([]
     (rf))

    ;; completion arity - final change to the results such as flushing things in `partition-all`. Produces the final
    ;; value!
    ([result]
     (rf result))

    ;; step arity: The standard reduction function. Should call `rf`
    ([acc n]
     (rf acc (inc n)))))

(defn odd-xf [rf]
  (fn
    ([]
     (rf))

    ([result]
     (rf result))

    ([acc n]
     (if (odd? n)
       (rf acc n)
       acc))))

#_(defn sum-xf [rf]
  (fn
    ([] (rf))

    ([result]
     (rf result))

    ([acc n]
     ((fnil + 0 0) acc n))))

(defn- my-transduce
  "Transducer version of `reduce`."
  []
  ;; (transduce xform rf init coll)
  (transduce
   (comp inc-xf odd-xf)
   ;; `completing` adds a completion arity to a reducing function, default `identity`
   (completing sum-reducer)
   0
   (range 5))

  ;; or
  (transduce
   (comp inc-xf odd-xf)
   (fn
     ([] 0)
     ([result] result)
     ([acc x] ((fnil + 0 0) acc x)))
   (range 5)))
;; -> [1 3 5] -> 9

(defn- my-eduction
  "Returns a reducible/iterable (sequable) application of the transducer. Note you can only `reduce` with an initial
  value."
  []
  (eduction (comp inc-xf odd-xf) (range 5))
  ;; -> (1 3 5)
  (reduce
   sum-reducer
   0
   (eduction (comp inc-xf odd-xf) (range 5))))
;; -> 9

;; map a transducer across a collection using `into` or `sequence`

(defn- my-into
  "Apply transducer to input collection and return an output collection."
  []
  (into [] (comp inc-xf odd-xf) (range 5)))
;; -> [1 3 5]

(defn- my-sequence
  "Returns a lazy sequence."
  []
  (take 2 (sequence (comp inc-xf odd-xf) (range 100))))
