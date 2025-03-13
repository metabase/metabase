(ns metabase-enterprise.data-editing.foreign-keys)

(defn take-with-sentinel
  "Similar to the [[take]] transducer, but emits a final sentinel if there were remaining items."
  ([n sentinel]
   (fn [rf]
     (let [nv (volatile! n)]
       (fn
         ([] (rf))
         ([result]
          (rf result))
         ([result input]
          (let [n      @nv
                nn     (vswap! nv dec)
                result (if (pos? n)
                         (rf result input)
                         result)]
            (if (>= nn 0)
              result
              (ensure-reduced (rf result sentinel))))))))))
