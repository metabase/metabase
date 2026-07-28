(ns metabase-enterprise.mfa.recovery-codes
  "Recovery-code generation and format. Codes are single-use fallbacks for a lost authenticator:
  generated from a CSPRNG, shown to the user exactly once, and stored only as bcrypt hashes — a
  recovery code is only ever compared, never recovered, so hashed storage is safe even when no
  `MB_ENCRYPTION_SECRET_KEY` is set."
  (:import
   (java.security SecureRandom)))

(set! *warn-on-reflection* true)

(def num-codes
  "How many recovery codes a user gets per set."
  10)

;; no ambiguous chars (0/o, 1/l/i) — users type these from a printout
(def ^:private alphabet "abcdefghjkmnpqrstvwxyz23456789")

(def code-pattern
  "What a recovery code looks like: two 5-char groups, ~49 bits of entropy."
  (re-pattern (format "[%s]{5}-[%s]{5}" alphabet alphabet)))

(defn recovery-code?
  "Is `s` shaped like a recovery code (as opposed to a 6-digit TOTP code)?"
  [s]
  (boolean (and (string? s) (re-matches code-pattern s))))

(defn- random-group ^String [^SecureRandom rng]
  (apply str (repeatedly 5 #(nth alphabet (.nextInt rng (count alphabet))))))

(defn generate-codes
  "A fresh set of [[num-codes]] plaintext recovery codes."
  []
  (let [rng (SecureRandom.)]
    (vec (repeatedly num-codes #(str (random-group rng) "-" (random-group rng))))))
