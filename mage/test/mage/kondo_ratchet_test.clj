(ns mage.kondo-ratchet-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer [deftest is testing]]
   [mage.kondo-ratchet :as kondo-ratchet]))

;; Referenced by core_test.clj to ensure namespace is loaded
(def keep-me :loaded)

(deftest insert-ignore-lines-test
  (testing "inserts at the flagged line's indentation"
    (is (= "(defn f [x]\n  #_{:clj-kondo/ignore [:equals-true]}\n  (= true x))\n"
           (#'kondo-ratchet/insert-ignore-lines "(defn f [x]\n  (= true x))\n" {2 [:equals-true]}))))
  (testing "multiple rows insert bottom-up so earlier rows stay valid; same-row linters share one form"
    (is (= (str "#_{:clj-kondo/ignore [:x]}\n"
                "(a)\n"
                "#_{:clj-kondo/ignore [:x :y]}\n"
                "(b)\n")
           (#'kondo-ratchet/insert-ignore-lines "(a)\n(b)\n" {1 [:x], 2 [:y :x :y]}))))
  (testing "a file without a trailing newline doesn't gain one"
    (is (= "#_{:clj-kondo/ignore [:x]}\n(a)"
           (#'kondo-ratchet/insert-ignore-lines "(a)" {1 [:x]})))))

(deftest reinsert-ignores-test
  (testing "a whole-line removal returns as its original line(s), comment above at its indentation"
    (is (= {:text          "(defn f [x]\n  ;; why\n  #_{:clj-kondo/ignore [:equals-true]}\n  (= true x))\n"
            :inserted-rows [2 2]}
           (#'kondo-ratchet/reinsert-ignores
            "(defn f [x]\n  (= true x))\n"
            [{:row 2, :comment ";; why"
              :original {:whole-line? true, :text "  #_{:clj-kondo/ignore [:equals-true]}"}}]))))
  (testing "a multi-line whole-line removal returns verbatim, one coarse form -- never several narrow ones"
    (is (= {:text          ";; why\n#_{:clj-kondo/ignore [:x\n                      :y]}\n(a)\n"
            :inserted-rows [1 1 1]}
           (#'kondo-ratchet/reinsert-ignores
            "(a)\n"
            [{:row 1, :comment ";; why"
              :original {:whole-line? true, :text "#_{:clj-kondo/ignore [:x\n                      :y]}"}}]))))
  (testing "an inline removal splices back at its original column"
    (is (= {:text          "(do #_{:clj-kondo/ignore [:x]} (foo))\n"
            :inserted-rows []}
           (#'kondo-ratchet/reinsert-ignores
            "(do (foo))\n"
            [{:row 1, :comment nil
              :original {:whole-line? false, :col 5, :text "#_{:clj-kondo/ignore [:x]}"}}]))))
  (testing "an inline restore's comment sits above at the target line's indentation"
    (is (= {:text          "(f\n  ;; why\n  #_{:clj-kondo/ignore [:x]} :mysql)\n"
            :inserted-rows [2]}
           (#'kondo-ratchet/reinsert-ignores
            "(f\n  :mysql)\n"
            [{:row 2, :comment ";; why"
              :original {:whole-line? false, :col 3, :text "#_{:clj-kondo/ignore [:x]}"}}]))))
  (testing "two inline removals on one row restore right-to-left, so the left splice can't shift the right column"
    (is (= {:text          "(do #_{:clj-kondo/ignore [:x]} (f) #_{:clj-kondo/ignore [:y]} (g))\n"
            :inserted-rows []}
           (#'kondo-ratchet/reinsert-ignores
            "(do (f) (g))\n"
            [{:row 1, :comment nil, :original {:whole-line? false, :col 5, :text "#_{:clj-kondo/ignore [:x]}"}}
             {:row 1, :comment nil, :original {:whole-line? false, :col 9, :text "#_{:clj-kondo/ignore [:y]}"}}]))))
  (testing "a same-row restore with a comment splices first, so the comment can't displace the splice target"
    (is (= {:text          ";; why\n(do #_{:clj-kondo/ignore [:x]} (f) #_{:clj-kondo/ignore [:y]} (g))\n"
            :inserted-rows [1]}
           (#'kondo-ratchet/reinsert-ignores
            "(do (f) (g))\n"
            [{:row 1, :comment ";; why", :original {:whole-line? false, :col 5, :text "#_{:clj-kondo/ignore [:x]}"}}
             {:row 1, :comment nil, :original {:whole-line? false, :col 9, :text "#_{:clj-kondo/ignore [:y]}"}}]))))
  (testing "a whole-line and an inline restore sharing a row each keep their marker adjacent"
    (is (= {:text          (str ";; kept A\n"
                                "#_{:clj-kondo/ignore [:x]}\n"
                                ";; kept B\n"
                                "(do #_{:clj-kondo/ignore [:y]} (f))\n")
            :inserted-rows [1 1 1]}
           (#'kondo-ratchet/reinsert-ignores
            "(do (f))\n"
            [{:row 1, :comment ";; kept A"
              :original {:whole-line? true, :text "#_{:clj-kondo/ignore [:x]}"}}
             {:row 1, :comment ";; kept B"
              :original {:whole-line? false, :col 5, :text "#_{:clj-kondo/ignore [:y]}"}}]))))
  (testing "consecutive whole-line restores on one row each keep their own marker adjacent"
    (is (= {:text          (str ";; kept B\n"
                                "#_{:clj-kondo/ignore [:y]}\n"
                                ";; kept A\n"
                                "#_{:clj-kondo/ignore [:x]}\n"
                                "(f)\n")
            :inserted-rows [1 1 1 1]}
           (#'kondo-ratchet/reinsert-ignores
            "(f)\n"
            [{:row 1, :comment ";; kept A"
              :original {:whole-line? true, :text "#_{:clj-kondo/ignore [:x]}"}}
             {:row 1, :comment ";; kept B"
              :original {:whole-line? true, :text "#_{:clj-kondo/ignore [:y]}"}}]))))
  (testing "multiple sites in one file restore bottom-up"
    (is (= {:text          "#_{:clj-kondo/ignore [:x]}\n(a)\n#_{:clj-kondo/ignore [:y]}\n(b)\n"
            :inserted-rows [2 1]}
           (#'kondo-ratchet/reinsert-ignores
            "(a)\n(b)\n"
            [{:row 1, :comment nil, :original {:whole-line? true, :text "#_{:clj-kondo/ignore [:x]}"}}
             {:row 2, :comment nil, :original {:whole-line? true, :text "#_{:clj-kondo/ignore [:y]}"}}])))))

(deftest site-restore-plan-test
  (let [stamp @#'kondo-ratchet/keep-comment
        wl    (fn [row] {:row row, :linters [:x], :original {:whole-line? true, :text "#_{:clj-kondo/ignore [:x]}"}})
        inl   (fn [row] {:row row, :linters [:y], :original {:whole-line? false, :col 5, :text "#_{:clj-kondo/ignore [:y]}"}})
        plan  (fn [text sites] (#'kondo-ratchet/site-restore-plan (vec (str/split-lines text)) sites))]
    (testing "a whole-line restore onto an unmarked row gets its own marker"
      (is (= [[1 stamp]]
             (map (juxt :row :comment) (plan "(f)\n" [(wl 1)])))))
    (testing "a marker above a still-ignored code line belongs to that line; the block moves above it"
      (is (= [[1 stamp]]
             (map (juxt :row :comment)
                  (plan (str stamp "\n(do #_{:clj-kondo/ignore [:y]} (f))\n") [(wl 2)])))))
    (testing "a site that was itself marked before removal re-restores under its marker, no new marker"
      (is (= [[2 nil]]
             (map (juxt :row :comment)
                  (plan (str stamp "\n(f)\n") [(assoc (wl 2) :was-marked? true)])))))
    (testing "a marked whole-line site over an unrelated inline ignore doesn't donate its marker to it"
      (is (= [[2 nil]]
             (map (juxt :row :comment)
                  (plan (str stamp "\n(do #_{:clj-kondo/ignore [:y]} (f))\n")
                        [(assoc (wl 2) :was-marked? true)])))))
    (testing "same-round marked whole-line and inline restores each get their own marker"
      (let [sites [(assoc (wl 2) :was-marked? true) (inl 2)]
            text  (str stamp "\n(do (f))\n")]
        (is (= {:text          (str stamp "\n"
                                    "#_{:clj-kondo/ignore [:x]}\n"
                                    stamp "\n"
                                    "(do #_{:clj-kondo/ignore [:y]} (f))\n")
                :inserted-rows [2 2]}
               (#'kondo-ratchet/reinsert-ignores text (plan text sites))))))
    (testing "an inline restore preserves a pending whole-line site's marker for the next round"
      (let [owner    (assoc (wl 2) :was-marked? true)
            inline   (inl 2)
            pending  [owner inline]
            text     (str stamp "\n(do (f))\n")
            round1   (#'kondo-ratchet/reinsert-ignores
                      text
                      (#'kondo-ratchet/site-restore-plan
                       (vec (str/split-lines text)) [inline] pending))
            owner'   (#'kondo-ratchet/shift-site-past-inserts owner (:inserted-rows round1))
            round2   (#'kondo-ratchet/reinsert-ignores
                      (:text round1)
                      (#'kondo-ratchet/site-restore-plan
                       (vec (str/split-lines (:text round1))) [owner'] [owner']))]
        (is (= 2 (:row owner')))
        (is (= (str stamp "\n"
                    "#_{:clj-kondo/ignore [:x]}\n"
                    stamp "\n"
                    "(do #_{:clj-kondo/ignore [:y]} (f))\n")
               (:text round2)))))
    (testing "cross-round end to end: the round-two whole-line block lands above the round-one marker"
      (let [round1 (str stamp "\n(do #_{:clj-kondo/ignore [:y]} (f))\n")]
        (is (= {:text          (str stamp "\n#_{:clj-kondo/ignore [:x]}\n" round1)
                :inserted-rows [1 1]}
               (#'kondo-ratchet/reinsert-ignores round1 (plan round1 [(wl 2)]))))))))

(deftest strip-orphan-keep-comments-test
  (let [stamp-line @#'kondo-ratchet/keep-comment
        hand-line  (str ";; real explanation. " kondo-ratchet/keep-marker)]
    (testing "a stamped whole-line marker comment with no ignore below it is dropped"
      (is (= "(a)\n(b)\n"
             (#'kondo-ratchet/strip-orphan-keep-comments (str "(a)\n" stamp-line "\n(b)\n")))))
    (testing "an orphaned hand-written comment keeps its prose and loses only the token"
      (is (= "(a)\n;; real explanation.\n(b)\n"
             (#'kondo-ratchet/strip-orphan-keep-comments (str "(a)\n" hand-line "\n(b)\n")))))
    (testing "a marker comment still above an ignore survives"
      (let [text (str stamp-line "\n#_{:clj-kondo/ignore [:x]}\n(a)\n")]
        (is (= text (#'kondo-ratchet/strip-orphan-keep-comments text)))))
    (testing "comments without the marker survive, orphaned or not"
      (let [text ";; plain comment\n(a)\n"]
        (is (= text (#'kondo-ratchet/strip-orphan-keep-comments text)))))
    (testing "a trailing marker on a code line is left for a hand fix"
      (let [text (str "(foo) " stamp-line "\n")]
        (is (= text (#'kondo-ratchet/strip-orphan-keep-comments text)))))
    (testing "a stamped marker orphaned at the last line of the file is dropped"
      (is (= "(a)\n"
             (#'kondo-ratchet/strip-orphan-keep-comments (str "(a)\n" stamp-line "\n")))))
    (testing "a marker above an ignore whose linter vector wraps to the next line survives"
      (let [text (str stamp-line "\n#_{:clj-kondo/ignore [:x\n                      :y]}\n(a)\n")]
        (is (= text (#'kondo-ratchet/strip-orphan-keep-comments text)))))
    (testing "a marker separated from its ignore by another comment line survives"
      (let [text (str stamp-line "\n;; more context\n#_{:clj-kondo/ignore [:x]}\n(a)\n")]
        (is (= text (#'kondo-ratchet/strip-orphan-keep-comments text)))))))

(deftest shift-past-inserts-test
  (testing "each insertion at or above the row pushes it down one, measured against the original row"
    (is (= 5 (#'kondo-ratchet/shift-past-inserts 5 [])))
    (is (= 6 (#'kondo-ratchet/shift-past-inserts 5 [5 6])))
    (is (= 9 (#'kondo-ratchet/shift-past-inserts 7 [5 6])))
    (is (= 5 (#'kondo-ratchet/shift-past-inserts 5 [6 7])))))

(deftest shift-site-past-inserts-test
  (testing "a marked whole-line owner stays beneath its marker when a same-row stamp is inserted"
    (let [site {:row 5, :was-marked? true, :original {:whole-line? true}}]
      (is (= 6 (:row (#'kondo-ratchet/shift-site-past-inserts site [4 5]))))))
  (testing "ordinary pending sites shift past same-row inserts"
    (let [site {:row 5, :original {:whole-line? false}}]
      (is (= 7 (:row (#'kondo-ratchet/shift-site-past-inserts site [4 5])))))))

(deftest marker-on-line-test
  (testing "the marker counts only inside the line's comment, not in string literals"
    (is (true? (#'kondo-ratchet/marker-on-line? (str ";; " kondo-ratchet/keep-marker " because"))))
    (is (true? (#'kondo-ratchet/marker-on-line? (str "(foo) ;; " kondo-ratchet/keep-marker))))
    (is (false? (#'kondo-ratchet/marker-on-line? (str "(def marker \"" kondo-ratchet/keep-marker "\")"))))
    (is (false? (#'kondo-ratchet/marker-on-line? nil))))
  (testing "a semicolon inside a string doesn't open a comment"
    (is (false? (#'kondo-ratchet/marker-on-line? (str "(def s \"a;b " kondo-ratchet/keep-marker "\")"))))
    (is (true? (#'kondo-ratchet/marker-on-line? (str "(def s \"a;b\") ;; " kondo-ratchet/keep-marker)))))
  (testing "char-literal semicolons and string escapes don't open or close early"
    (is (false? (#'kondo-ratchet/marker-on-line? (str "(= c \\;) (def s \"" kondo-ratchet/keep-marker "\")"))))
    (is (false? (#'kondo-ratchet/marker-on-line? (str "(def s \"a\\\";b " kondo-ratchet/keep-marker "\")"))))))

(defn- remove-ignores-at'
  "[[remove-ignores-at]] with `:original` stripped from `:sites`; [[remove-ignores-at-originals-test]]
  covers the originals."
  [text rows]
  (update (#'kondo-ratchet/remove-ignores-at text rows)
          :sites (partial mapv #(dissoc % :original :removed-line))))

(deftest remove-ignores-at-originals-test
  (testing "each site captures its removed form verbatim, so a restore puts back exactly what was cut"
    (is (= [{:whole-line? true, :text "  #_{:clj-kondo/ignore [:equals-true]}"}]
           (map :original
                (:sites (#'kondo-ratchet/remove-ignores-at
                         "(defn f [x]\n  #_{:clj-kondo/ignore [:equals-true]}\n  (= true x))\n"
                         [2])))))
    (is (= [{:whole-line? false, :col 5, :text "#_{:clj-kondo/ignore [:x]}"}]
           (map :original
                (:sites (#'kondo-ratchet/remove-ignores-at "(do #_{:clj-kondo/ignore [:x]} (foo))\n" [1])))))
    (is (= [{:whole-line? true, :text "#_{:clj-kondo/ignore [:x\n                      :y]}"}]
           (map :original
                (:sites (#'kondo-ratchet/remove-ignores-at
                         "(a)\n#_{:clj-kondo/ignore [:x\n                      :y]}\n(b)\n"
                         [2])))))))

(deftest remove-ignores-at-test
  (testing "a standalone ignore line disappears entirely; :sites points at the uncovered form"
    (is (= {:text      "(defn f [x]\n  (= true x))\n"
            :sites     [{:row 2, :linters [:equals-true]}]
            :skipped   []}
           (remove-ignores-at'
            "(defn f [x]\n  #_{:clj-kondo/ignore [:equals-true]}\n  (= true x))\n"
            [2]))))
  (testing "an inline ignore is cut out of its line, swallowing a doubled space"
    (is (= {:text "(do (foo))\n", :sites [{:row 1, :linters [:x]}], :skipped []}
           (remove-ignores-at' "(do #_{:clj-kondo/ignore [:x]} (foo))\n" [1]))))
  (testing "a multi-line ignore vector goes too"
    (is (= {:text "(a)\n(b)\n", :sites [{:row 2, :linters [:x :y]}], :skipped []}
           (remove-ignores-at' "(a)\n#_{:clj-kondo/ignore [:x\n                      :y]}\n(b)\n" [2]))))
  (testing "an ignore map with extra keys is removed whole, not truncated at the vector"
    (is (= {:text "(a)\n", :sites [{:row 1, :linters [:x]}], :skipped []}
           (remove-ignores-at' "#_{:clj-kondo/ignore [:x] :reason \"legacy\"}\n(a)\n" [1]))))
  (testing "an extra-key map with NESTED braces would be truncated by the regex, so it is skipped whole"
    (is (= {:text      "#_{:clj-kondo/ignore [:x] :reason {:ticket \"ABC-1\"}}\n(a)\n"
            :sites     []
            :skipped   [1]}
           (remove-ignores-at'
            "#_{:clj-kondo/ignore [:x] :reason {:ticket \"ABC-1\"}}\n(a)\n"
            [1]))))
  (testing "a skipped row is reported in post-removal coordinates when removals above it delete lines"
    (is (= {:text      "(a)\n#_{:clj-kondo/ignore [:y] :reason {:nested 1}}\n(b)\n"
            :sites     [{:row 1, :linters [:x]}]
            :skipped   [2]}
           (remove-ignores-at'
            "#_{:clj-kondo/ignore [:x]}\n(a)\n#_{:clj-kondo/ignore [:y] :reason {:nested 1}}\n(b)\n"
            [1 3]))))
  (testing "any form naming a clojure-lsp/* linter survives — a re-lint could never restore that half"
    (is (= {:text      (str "(do #_{:clj-kondo/ignore [:clojure-lsp/unused-public-var]} (foo))\n"
                            "#_{:clj-kondo/ignore [:x :clojure-lsp/unused-public-var]}\n"
                            "(bar)\n")
            :sites     [{:row 1, :linters [:x]}]
            :skipped   []}
           (remove-ignores-at'
            (str "(do #_{:clj-kondo/ignore [:x]} #_{:clj-kondo/ignore [:clojure-lsp/unused-public-var]} (foo))\n"
                 "#_{:clj-kondo/ignore [:x :clojure-lsp/unused-public-var]}\n"
                 "(bar)\n")
            [1 2]))))
  (testing "an inline removal of a wrapped ignore still counts its deleted newlines, shifting later rows"
    (is (= {:text      "(do (foo))\n(a)\n(b)\n"
            :sites     [{:row 3, :linters [:z]} {:row 1, :linters [:x :y]}]
            :skipped   []}
           (remove-ignores-at'
            "(do #_{:clj-kondo/ignore [:x\n                          :y]} (foo))\n(a)\n#_{:clj-kondo/ignore [:z]}\n(b)\n"
            [1 4]))))
  (testing "rows without an ignore are left alone; multiple removals shift later :sites rows up"
    (is (= {:text      "(a)\n(b)\n"
            :sites     [{:row 2, :linters [:y]} {:row 1, :linters [:x]}]
            :skipped   []}
           (remove-ignores-at'
            "#_{:clj-kondo/ignore [:x]}\n(a)\n#_{:clj-kondo/ignore [:y]}\n(b)\n"
            [1 2 3])))))
