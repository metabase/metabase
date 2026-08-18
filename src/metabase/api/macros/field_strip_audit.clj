(ns metabase.api.macros.field-strip-audit
  "Throwaway Lane A probes for the field-strip audit.

  Ships in the e2e uberjar so runtime decode diffs and invalid-params 400s
  land in `logs/field-strip-audit.jsonl`. Not product code; delete with the
  throwaway branch.

  Emitter record shape matches `local/src/field_strip_audit/emitter.clj`."
  (:require
   [clojure.java.io :as io]
   [clojure.string :as str]
   [metabase.util :as u]
   [metabase.util.json :as json]))

(set! *warn-on-reflection* true)

(def ^:private output-path
  "logs/field-strip-audit.jsonl")

(def ^:private emitter-failure-modes
  #{"stripped" "dynamic_keys" "rejected"})

(def ^:private sources
  #{"runtime" "contract" "typecheck" "manual"})

(def ^:private confidences
  #{"confirmed" "likely" "possible"})

(def ^:private param-types
  #{"route" "query" "body" "request"})

(def ^:private write-lock (Object.))

(def ^:private seen (atom #{}))

(defn- keyword-or-str->str
  [x]
  (cond
    (nil? x) nil
    (keyword? x) (name x)
    (string? x) x
    :else (str x)))

(defn- param-segment?
  [segment]
  (boolean
   (or (= segment "*")
       (str/starts-with? segment ":")
       (re-matches #"\$\{[^}]+\}" segment))))

(defn- malformed-param-segment?
  [segment]
  (boolean
   (or (and (str/starts-with? segment "${")
            (not (re-matches #"\$\{[^}]+\}" segment)))
       (= segment ":"))))

(defn- normalize-path
  [path]
  (let [raw (keyword-or-str->str path)]
    (cond
      (str/blank? raw)
      {:ok false :path raw :error "path is blank"}

      (not (str/starts-with? raw "/"))
      {:ok false :path raw :error "path must start with /"}

      :else
      (let [segments (->> (str/split raw #"/")
                          (remove str/blank?))]
        (if (some malformed-param-segment? segments)
          {:ok false
           :path raw
           :error (str "malformed param segment in path: " raw)}
          {:ok true
           :path (->> segments
                      (map (fn [seg] (if (param-segment? seg) "*" seg)))
                      (str/join "/")
                      (str "/"))})))))

(defn- normalize-method
  [method]
  (let [raw (keyword-or-str->str method)]
    (if (str/blank? raw)
      {:ok false :method raw :error "method is blank"}
      {:ok true :method (u/lower-case-en raw)})))

(defn- normalize-endpoint
  [method path]
  (let [m (normalize-method method)
        p (normalize-path path)]
    (if (and (:ok m) (:ok p))
      {:ok true
       :method (:method m)
       :path (:path p)
       :endpoint (str (:method m) " " (:path p))}
      {:ok false
       :method (or (:method m) (keyword-or-str->str method))
       :path (or (:path p) (keyword-or-str->str path))
       :error (->> [(:error m) (:error p)]
                   (remove nil?)
                   (str/join "; "))})))

(defn- validate-enum!
  [label value allowed]
  (let [s (keyword-or-str->str value)]
    (when-not (contains? allowed s)
      (throw (ex-info (format "Invalid %s %s; expected one of %s"
                              label (pr-str value) (pr-str allowed))
                      {:label label :value value :allowed allowed})))
    s))

(defn- make-record
  [{:keys [method path param_type field_path failure_mode source confidence evidence]
    :or   {evidence {}}}]
  (let [norm         (normalize-endpoint method path)
        failure_mode (validate-enum! "failure_mode" failure_mode emitter-failure-modes)
        source       (validate-enum! "source" source sources)
        confidence   (validate-enum! "confidence" confidence confidences)
        param_type   (validate-enum! "param_type" param_type param-types)
        field_path   (if (string? field_path)
                       field_path
                       (throw (ex-info "field_path must be a string"
                                       {:field_path field_path})))
        evidence     (cond-> (or evidence {})
                       (not (:ok norm))
                       (assoc :normalization_error (:error norm)
                              :raw_method (keyword-or-str->str method)
                              :raw_path (keyword-or-str->str path)))]
    (array-map
     :endpoint     (if (:ok norm)
                     (:endpoint norm)
                     (str (or (:method norm) "?") " " (or (:path norm) "?")))
     :method       (or (:method norm) (keyword-or-str->str method))
     :path         (or (:path norm) (keyword-or-str->str path))
     :param_type   param_type
     :field_path   field_path
     :failure_mode failure_mode
     :source       source
     :confidence   confidence
     :evidence     evidence)))

(defn- write-record!
  [record]
  (let [f (io/file output-path)]
    (when-let [parent (.getParentFile f)]
      (.mkdirs parent))
    (spit f (str (json/encode record) "\n") :append true)))

(defn- emit-once!
  [endpoint param-type field-path failure-mode evidence]
  (let [record (make-record {:method       (or (:method endpoint) "")
                             :path         (or (:path endpoint) "")
                             :param_type   param-type
                             :field_path   field-path
                             :failure_mode failure-mode
                             :source       "runtime"
                             :confidence   "confirmed"
                             :evidence     evidence})
        k      [(:method record) (:path record) (:param_type record)
                (:field_path record) (:failure_mode record)]]
    (locking write-lock
      (when-not (contains? @seen k)
        (swap! seen conj k)
        (write-record! record)))
    record))

(defn full-path
  "Reconstruct the full route template (`/api/card/:id`) from the ns-local
  defendpoint path and the Ring request URI."
  [route-path uri]
  (if (str/blank? uri)
    (or route-path "")
    (let [route-segs (into [] (remove str/blank?) (str/split (or route-path "") #"/"))
          uri-segs   (into [] (remove str/blank?) (str/split uri #"/"))
          n          (count route-segs)
          prefix     (subvec uri-segs 0 (max 0 (- (count uri-segs) n)))
          joined     (str "/" (str/join "/" (concat prefix route-segs)))]
      (if (or (= joined "/api") (str/starts-with? joined "/api/"))
        joined
        (str "/api" joined)))))

(defn- field-key
  [k]
  (cond
    (keyword? k) (u/qualified-name k)
    (string? k) k
    :else (str k)))

(defn- data-key?
  "True when a map key looks like keywordized *data* rather than a field name:
  negative temp ids (`:-10`), encoded JSON (`:_PRICE_`), serialized field refs."
  [k]
  (let [s (field-key k)]
    (boolean
     (or (re-matches #"-?\d+" s)
         (re-find #"^_.+_$" s)
         (str/includes? s "[")
         (str/includes? s "{")
         (str/includes? s "\"")))))

(defn- child-path
  [path k]
  (if (str/blank? path)
    k
    (str path "." k)))

(declare walk-diff)

(defn- walk-maps
  [endpoint param-type path ref live]
  (when (some data-key? (concat (keys ref) (keys live)))
    (emit-once! endpoint param-type (if (str/blank? path) "_root" path)
                "dynamic_keys" {:probe "decode-diff"}))
  (let [ref-i  (into {} (map (fn [[k v]] [(field-key k) v]) ref))
        live-i (into {} (map (fn [[k v]] [(field-key k) v]) live))]
    (doseq [k (into (set (keys ref-i)) (keys live-i))]
      (let [p (child-path path k)]
        (cond
          (and (contains? ref-i k) (not (contains? live-i k)))
          (emit-once! endpoint param-type p "stripped" {:probe "decode-diff"})

          (and (contains? ref-i k) (contains? live-i k))
          (walk-diff endpoint param-type p (get ref-i k) (get live-i k)))))))

(defn- walk-diff
  [endpoint param-type path ref live]
  (cond
    (and (map? ref) (map? live))
    (walk-maps endpoint param-type path ref live)

    (and (sequential? ref) (sequential? live))
    (doseq [[r l] (map vector ref live)]
      (walk-diff endpoint param-type path r l))))

(defn log-decode-diff!
  "Compare a pre-hardening (reference) decode to the live decode and emit
  `stripped` / `dynamic_keys` records for residual differences. No-ops when
  the two values are equal."
  [endpoint param-type reference decoded]
  (when-not (= reference decoded)
    (walk-diff endpoint param-type "" reference decoded)))

(defn- error-path-items
  [explanation]
  (for [{:keys [in]} (:errors explanation)
        :let [ks         (remove integer? in)
              field-path (->> ks (map field-key) (str/join "."))
              dynamic?   (boolean (some data-key? ks))]
        :when (not (str/blank? field-path))]
    {:field-path field-path :dynamic? dynamic?}))

(defn log-rejection!
  "Emit `rejected` (or `dynamic_keys` when an error path is a data-looking key)
  for a Malli explanation from `decode-and-validate-params`."
  [endpoint param-type explanation]
  (let [items (vec (error-path-items explanation))]
    (if (seq items)
      (doseq [{:keys [field-path dynamic?]} items]
        (emit-once! endpoint param-type field-path
                    (if dynamic? "dynamic_keys" "rejected")
                    {:probe "rejection"}))
      (emit-once! endpoint param-type "_root" "rejected" {:probe "rejection"}))))
