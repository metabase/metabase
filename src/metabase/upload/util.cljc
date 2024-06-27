(ns metabase.upload.util)

(defn unique-name-generator
  "A fork of [[mbql.u/unique-name-generator]] which accounts for collisions when names are truncated.
  There is due to a limitation where it does not play well with truncation, see the tests for this function.
  This may be a bit slower, and it's a breaking change as far as what ids look like, hence it's a fork."
  [unique-alias-fn]
  (let [id+original->unique (atom {})   ; map of [id original-alias] -> unique-alias
        used-names          (atom #{})]
    (fn generate-name
      ([an-alias]
       (generate-name (gensym) an-alias))

      ([id original]
       (or
        ;; If we already have generated an alias for this key (e.g. `[id original]`), return it as-is.
        (@id+original->unique [id original])
        ;; Otherwise, generate a new unique alias.

        ;; Check if this name is used, marking it as used in the process.
        (if (not= @used-names (swap! used-names conj original))
          ;; If we're the first to try to use this name, register it this id and return it as-is.
          (do (swap! id+original->unique assoc [id original] original)
              original)
          ;; If it's already used, find a unique suffix for it.
          (loop [counter 2]
            ;; Bail out if we're caught in an infinite loop.
            ;; Note: This detection mechanism probably has false positives, but it's better than nothing for now.
            (if (> counter (inc (count @used-names)))
              (throw (ex-info "Entered" {:counter        counter
                                         :original       original
                                         :last-candidate (unique-alias-fn original (dec counter))}))
              ;; Attempt to generate a unique name.
              (let [candidate (unique-alias-fn original counter)]
                (if (get @used-names candidate)
                  ;; If it was not unique, try incrementing the counter.
                  (recur (inc counter))
                  (do (swap! id+original->unique assoc [id original] candidate)
                      (swap! used-names conj candidate)
                      candidate)))))))))))

(defn- unique-alias-with-max-length [max-length]
  (fn [base suffix]
    (let [suffix-len (inc (count (str suffix)))]
      (if (< (+ (count base) suffix-len) max-length)
        (str base "_" suffix)
        (str (subs base 0 (- max-length suffix-len))
             "_"
             suffix)))))

(defn uniquify-names
  "Add numeric suffixes were necessary to ensure that every element of the `names` seq is unique.
  Where the suffix would cause the name to exceed max-length characters, first truncate it further, such that the final
  length will be exactly max-length.
  This function assumes that all names are already truncated to max-length."
  [max-length names]
  (let [generator (unique-name-generator (unique-alias-with-max-length max-length))]
    (map generator names)))
