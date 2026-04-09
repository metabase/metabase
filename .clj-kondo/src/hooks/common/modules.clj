(ns hooks.common.modules
  (:require
   [clojure.string :as str]))

(defn ignored-namespace? [config ns-symb]
  (some
   (fn [pattern-str]
     (re-find (re-pattern pattern-str) (str ns-symb)))
   (:ignored-namespace-patterns config)))

(defn config [{:keys [config], :as _hook-input}]
  (merge (get-in config [:linters :metabase/modules])
         (select-keys config [:metabase/modules])))

;;;; -------------------------------------------------------------------------
;;;; Module identity and hierarchy
;;;;
;;;; Modules are symbols. Top-level modules have no namespace part (or
;;;; `enterprise`). Nested modules use dotted names:
;;;;
;;;;   `lib`              — top-level module
;;;;   `lib.schema`       — nested child of `lib`
;;;;   `enterprise/foo`   — top-level enterprise module
;;;;   `enterprise/foo.bar` — nested child of `enterprise/foo`
;;;;
;;;; Parent/child relationships are derived from the dotted name.
;;;; -------------------------------------------------------------------------

(defn- declared-modules
  "Set of module symbols declared in the `:metabase/modules` map of `config`."
  [config]
  (set (keys (get config :metabase/modules))))

(defn- split-module
  "Split a module symbol into `[ns-part name-parts]` where `ns-part` is the
  namespace component of the symbol (usually `nil` or `\"enterprise\"`) and
  `name-parts` is the vector of dotted segments of the name.

    (split-module 'lib)                  => [nil [\"lib\"]]
    (split-module 'lib.schema)           => [nil [\"lib\" \"schema\"]]
    (split-module 'enterprise/foo.bar)   => [\"enterprise\" [\"foo\" \"bar\"]]"
  [m]
  [(namespace m) (str/split (name m) #"\.")])

(defn- join-module
  "Inverse of `split-module`. Construct a module symbol from `[ns-part name-parts]`."
  [[ns-part name-parts]]
  (if ns-part
    (symbol ns-part (str/join "." name-parts))
    (symbol (str/join "." name-parts))))

(defn- parent-module
  "The direct parent module of `m`, or `nil` if `m` is top-level.

    (parent-module 'lib.schema)         => 'lib
    (parent-module 'lib.schema.foo)     => 'lib.schema
    (parent-module 'lib)                => nil
    (parent-module 'enterprise/foo.bar) => enterprise/foo
    (parent-module 'enterprise/foo)     => nil"
  [m]
  (let [[ns-part parts] (split-module m)]
    (when (> (count parts) 1)
      (join-module [ns-part (butlast parts)]))))

(defn- ancestor-chain
  "Seq of ancestor modules of `m`, from direct parent up to top-level ancestor.
  Empty if `m` is top-level.

    (ancestor-chain 'lib.schema.foo) => (lib.schema lib)"
  [m]
  (take-while some? (iterate parent-module (parent-module m))))

(defn- ancestor?
  "True if `maybe-ancestor` is a strict ancestor of `maybe-descendant`
  (parent, grandparent, etc., but not the module itself)."
  [maybe-ancestor maybe-descendant]
  (boolean (some #(= maybe-ancestor %) (ancestor-chain maybe-descendant))))

(defn- siblings?
  "True if `a` and `b` share the same direct parent (and thus are siblings
  in the module tree). Top-level modules are NOT siblings of each other —
  each top-level module is its own root.

  Returns a proper boolean (never `nil`), so callers using `false?`/`true?`
  on the result get the expected behavior."
  [a b]
  (let [pa (parent-module a)
        pb (parent-module b)]
    (boolean (and pa pb (= pa pb)))))

;;;; -------------------------------------------------------------------------
;;;; Visibility rules
;;;;
;;;; STRICT MODEL: every cross-module access goes through the target's `:api`,
;;;; and every dependency is declared in `:uses`. There is no implicit
;;;; visibility based on tree relationships — neither parent→descendant nor
;;;; descendant→parent nor sibling→sibling. The hierarchy exists for
;;;; encapsulation scoping (controlled by `:open`), not for trust.
;;;;
;;;; The `:open` config key on a module is a SET of direct-child module
;;;; symbols that the parent explicitly promotes to externally-referenceable
;;;; status. An unopened nested child is private to its top-level subtree:
;;;; only modules sharing the same top-level ancestor may name it in their
;;;; `:uses`. An opened child may be named by anyone. Either way, the
;;;; dependency must be declared and the access must respect the target's
;;;; `:api`.
;;;;
;;;; The opened-child-naming rule is enforced by a separate test
;;;; (`uses-references-must-be-namable-test` in modules-test) rather than
;;;; here at require-lint time, because it's a property of the config
;;;; declarations, not of individual require forms.
;;;;
;;;; The helpers below (`open-children`, `opens-child?`, `externally-visible?`,
;;;; `external-face`) are exported in the sense that they're available to
;;;; that test and to dev tooling, but the kondo hook itself uses none of
;;;; them at require-lint time. Require linting is now a strict
;;;; declared-dependency + :api check, nothing more.
;;;; -------------------------------------------------------------------------

(defn- open-children
  "Set of direct child module symbols that `parent` explicitly exposes via
  its `:open` key. Returns `#{}` if no `:open` is declared."
  [config parent]
  (set (get-in config [:metabase/modules parent :open])))

(defn- opens-child?
  "True if `parent` explicitly lists `child` in its `:open` set."
  [config parent child]
  (contains? (open-children config parent) child))

(defn- externally-visible?
  "True if `m` may be named in the `:uses` of a module that is NOT in `m`'s
  top-level subtree. This is the case iff `m` is top-level, OR `m`'s parent
  has `m` in its `:open` set AND the parent is itself externally visible.

  Used by the subtree-membership lint to validate `:uses` declarations.
  NOT used at require-lint time — requires are checked strictly against
  the caller's declared `:uses` and the target's `:api`."
  [config m]
  (if-let [p (parent-module m)]
    (and (opens-child? config p m)
         (externally-visible? config p))
    true))

(defn- external-face
  "The closest externally-visible ancestor of `m` (or `m` itself if it is
  externally visible). Used by the subtree-membership lint to compute the
  module that an outsider would have to name in lieu of `m` itself."
  [config m]
  (if (externally-visible? config m)
    m
    (external-face config (parent-module m))))

;;;; -------------------------------------------------------------------------
;;;; Namespace → module resolution (prefix-map based)
;;;;
;;;; Each declared module has an effective `:ns-prefix` — the namespace-
;;;; prefix string it owns. By convention the default prefix is derived
;;;; from the module's symbol name (e.g. `lib.schema` defaults to
;;;; `"metabase.lib.schema"`, `enterprise/transforms.python` defaults to
;;;; `"metabase-enterprise.transforms.python"`). A module may override
;;;; this with an explicit `:ns-prefix` in its config — used when the
;;;; source files follow a different naming convention than the module
;;;; tree (e.g. nesting `lib.be` as a child of `lib` while its source
;;;; files remain `metabase.lib-be.*`).
;;;;
;;;; Resolution builds a prefix-string → module-symbol map from all
;;;; declared modules and finds the longest matching prefix for the
;;;; given namespace symbol, matching only at segment boundaries (so
;;;; `metabase.lib.bert` never matches prefix `metabase.lib.be`).
;;;; -------------------------------------------------------------------------

(defn- default-ns-prefix
  "Derive the default `:ns-prefix` for a module symbol. For a top-level
  module `lib` this is `\"metabase.lib\"`. For a nested module `lib.schema`
  it's `\"metabase.lib.schema\"`. For enterprise modules the prefix root is
  `metabase-enterprise.` instead of `metabase.`.

    (default-ns-prefix 'lib)                 => \"metabase.lib\"
    (default-ns-prefix 'lib.schema)          => \"metabase.lib.schema\"
    (default-ns-prefix 'enterprise/foo.bar)  => \"metabase-enterprise.foo.bar\""
  [m]
  (if (= (namespace m) "enterprise")
    (str "metabase-enterprise." (name m))
    (str "metabase." (name m))))

(defn- module-ns-prefix
  "Effective namespace prefix for a module: explicit `:ns-prefix` from the
  module's config if set, else the name-derived default."
  [config m]
  (or (get-in config [:metabase/modules m :ns-prefix])
      (default-ns-prefix m)))

(defn- build-prefix->module
  "Build the map of `ns-prefix-string → module-symbol` from all declared
  modules. Used as the lookup table for longest-prefix resolution."
  [config]
  (into {}
        (map (fn [m] [(module-ns-prefix config m) m]))
        (keys (get config :metabase/modules))))

(defn- ns-starts-with-prefix?
  "True if namespace string `ns-str` is either exactly equal to `prefix` or
  begins with `prefix` followed by a `.` (segment boundary). Prevents false
  matches like `metabase.lib.bert` vs prefix `metabase.lib.be`."
  [ns-str prefix]
  (or (= ns-str prefix)
      (str/starts-with? ns-str (str prefix "."))))

(defn- longest-matching-prefix
  "Scan `prefix->module` and return the module whose `:ns-prefix` is the
  longest string prefix of `ns-str` at segment boundaries. Returns `nil`
  if no declared module owns the namespace."
  [prefix->module ns-str]
  (let [matches (filter #(ns-starts-with-prefix? ns-str %) (keys prefix->module))]
    (when (seq matches)
      (get prefix->module (apply max-key count matches)))))

(defn module
  "Resolve a namespace symbol to the module symbol that owns it.

  Uses the `:ns-prefix` mechanism: each declared module has an effective
  namespace prefix (explicit via `:ns-prefix` in config or derived from
  the module's symbol name). Resolution is a longest-prefix match over
  the set of declared prefixes at segment boundaries.

  With one arg (legacy, used by callers without access to a config):
  fall back to the single-segment first-element extraction — the flat
  mapping behavior that predates nested modules. Equivalent to
  `(module nil ns-symb)`.

  With two args: if `config` is non-nil and declares modules, use the
  prefix-map lookup. Falls through to the single-segment regex if no
  declared prefix matches, preserving backwards compatibility.

  CANONICAL: this function is the source-of-truth definition of the
  namespace→module resolution algorithm. Two other sites duplicate its
  behavior because they live in different classpath contexts and cannot
  share code:

    - dev/src/dev/deps_graph.clj              (namespace-symbol based)
    - mage/src/mage/modules.clj/file->module  (file-path based)

  If you change the algorithm here, update both of the above sites. The
  consistency test `metabase.core.modules-consistency-test` verifies they
  stay in sync.

  Examples:

    (module 'metabase.qp.middleware.wow)
      => 'qp   ; single-segment fallback

    (module config 'metabase.lib.schema.foo)
      => 'lib.schema   ; if lib.schema is declared with default :ns-prefix

    (module config 'metabase.lib-be.foo)
      => 'lib.be       ; if lib.be declares :ns-prefix \"metabase.lib-be\"

    (module 'metabase-enterprise.whatever.core)
      => enterprise/whatever"
  ([ns-symb] (module nil ns-symb))
  ([config ns-symb]
   {:pre [(simple-symbol? ns-symb)]}
   ;; treat something like `metabase.driver-test` (for a module that hasn't
   ;; fully been updated to use `.core` namespaces) as being in the `driver`
   ;; module
   (let [ns-symb (if (str/ends-with? (name ns-symb) "-test")
                   (symbol (str/replace (name ns-symb) #"-test$" ""))
                   ns-symb)]
     (or
      ;; Primary path: prefix-map longest match over declared modules.
      (when (seq (get config :metabase/modules))
        (longest-matching-prefix (build-prefix->module config) (str ns-symb)))
      ;; Fallback: single-segment extraction via the original regexes.
      ;; Preserved byte-for-byte so the consistency test can compare
      ;; regex literals across the three mapping sites.
      (some->> (re-find #"^metabase-enterprise\.([^.]+)" (str ns-symb))
               second
               (symbol "enterprise"))
      (some-> (re-find #"^metabase\.([^.]+)" (str ns-symb))
              second
              symbol)))))

;;;; -------------------------------------------------------------------------
;;;; Access checks
;;;; -------------------------------------------------------------------------

(defn- module-api-namespaces
  "Set of API namespace symbols for a given module. `:any` means you can use
  anything, there are no API namespaces for this module (yet). If unspecified,
  the default is the module's `.api`, `.core`, and `.init` namespaces derived
  from the effective `:ns-prefix` (which may be explicit or name-derived)."
  [config module]
  (let [module-config (get-in config [:metabase/modules module :api])]
    (cond
      (= module-config :any)
      nil

      (set? module-config)
      module-config

      :else
      (let [ns-prefix (module-ns-prefix config module)]
        #{(symbol (str ns-prefix ".api"))
          (symbol (str ns-prefix ".core"))
          (symbol (str ns-prefix ".init"))}))))

(defn- module-friends
  [config module]
  "Set of modules that are `:friends` of `module`, i.e. allowed to use *any* namespace from the module, not just the
  designated [[module-api-namespaces]]."
  (set (get-in config [:metabase/modules module :friends])))

(defn allowed-modules
  "Set of namespace symbols that `module` is allowed to use. `:any` means it's allowed to use anything."
  [config module]
  (get-in config [:metabase/modules module :uses]))

(defn- private-module?
  "True if `m` is declared `:private true` in config. Private modules may be
  named ONLY by their direct parent in `:uses`, AND even within the parent
  only the `.init` and `.core` canonical entry-point namespaces may
  statically require anything that resolves to the private module. Any
  other namespace inside the parent must use dynamic loading
  (`classloader/require`) if it needs to trigger private side-effects at
  runtime."
  [config m]
  (true? (get-in config [:metabase/modules m :private])))

(defn- private-loader-ns?
  "True if `current-ns` is one of the canonical entry-point namespaces for
  `parent-module` — i.e., `<parent-ns-prefix>.init` or `<parent-ns-prefix>.core`.
  These are the only namespaces within the parent module that may statically
  require namespaces resolving to a `:private` child module; anything else
  inside the parent must use dynamic loading."
  [config parent-module current-ns]
  (let [parent-prefix (module-ns-prefix config parent-module)]
    (or (= current-ns (symbol (str parent-prefix ".init")))
        (= current-ns (symbol (str parent-prefix ".core"))))))

(defn allowed-module?
  "True if `current-module` is allowed to depend on `required-module` based on
  `current-module`'s `:uses` declaration.

  Strict exact-match: the resolved required module must be a literal entry
  in `current-module`'s `:uses` set. There is no walking of `:open` chains,
  no inheriting from ancestors. If `lib.schema` is what the require resolves
  to, then `:uses #{lib.schema}` is what's required — `:uses #{lib}` does
  NOT cover it.

  The `:any` value is the one wildcard: a module declared `:uses :any` may
  depend on any non-private module (subject to the orthogonal
  subtree-membership rules enforced at config-validation time).

  `:private` rule: if `required-module` is marked `:private true`, only its
  direct parent may name it. This overrides `:any` — `:uses :any` does NOT
  cover private modules. The only exception is when `current-module` is
  the direct parent of `required-module`."
  [config current-module required-module]
  (let [allowed-modules (allowed-modules config current-module)]
    (cond
      ;; Private modules are only nameable by their direct parent. This
      ;; check comes first because it overrides both `:any` and exact-match.
      (private-module? config required-module)
      (= current-module (parent-module required-module))

      ;; `:uses :any` is a wildcard for non-private modules.
      (= allowed-modules :any)
      true

      :else
      (boolean (contains? (set allowed-modules) required-module)))))

(defn- allowed-module-namespace?
  "True if `ns-symb` (the namespace being required) is an allowed reference
  from `current-module`. Strict check against the resolved required module's
  own `:api` set (and its `:friends` list as the audited bypass). No
  external-face walking — the required module is whatever longest-prefix
  resolution returned, and the `:api` is that exact module's `:api`."
  [config current-module ns-symb]
  (let [required-module        (module config ns-symb)
        api-namespaces         (module-api-namespaces config required-module)
        friends                (module-friends config required-module)]
    (or (empty? api-namespaces)
        (contains? api-namespaces ns-symb)
        (contains? friends current-module))))

(defn usage-error
  "Find usage errors when a `required-namespace` is required from `current-ns`
  (which belongs to `current-module`). Returns a string describing the error
  type if there is one, otherwise `nil` if there are no errors.

  Strict checks applied in order:
    1. The required module must be in current-module's `:uses`.
    2. If the required module is `:private`, current-ns must be the
       direct parent's canonical load point (`<parent>.init` or
       `<parent>.core`). Other namespaces inside the parent must use
       dynamic loading.
    3. The required namespace must be in the required module's `:api`
       (or current-module must be in required's `:friends`).

  No implicit visibility based on parent/sibling/descendant relationships
  beyond these checks — every cross-module access goes through `:api`."
  [config current-ns current-module required-namespace]
  ;; ignore stuff not in a module i.e. non-Metabase stuff.
  (when-let [required-module (module config required-namespace)]
    (when-not (= current-module required-module)
      (cond
        (not (allowed-module? config current-module required-module))
        (format "Module %s should not be used in the %s module. [:metabase/modules %s :uses]"
                required-module
                current-module
                current-module)

        (and (private-module? config required-module)
             (not (private-loader-ns? config current-module current-ns)))
        (format (str "Namespace %s cannot statically require %s because it resolves to the "
                     ":private module %s. Only %s's canonical entry points "
                     "(%s.init or %s.core) may statically load a :private child. "
                     "Other namespaces inside %s should use classloader/require for dynamic "
                     "loading at runtime.")
                current-ns
                required-namespace
                required-module
                current-module
                (module-ns-prefix config current-module)
                (module-ns-prefix config current-module)
                current-module)

        (not (allowed-module-namespace? config current-module required-namespace))
        (format "Namespace %s is not an allowed external API namespace for the %s module. [:metabase/modules %s :api]"
                required-namespace
                required-module
                required-module)))))
