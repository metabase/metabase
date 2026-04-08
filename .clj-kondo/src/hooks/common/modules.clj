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
;;;; Given a module that wants to reference a namespace from another module,
;;;; we answer two questions:
;;;;
;;;;   1. Can the viewer see the target's INTERNALS (no :api check required)?
;;;;      Yes for: same module, parent→descendant, siblings.
;;;;
;;;;   2. If not, what's the target's EXTERNAL FACE — the module that
;;;;      unrelated outside code must reference in its :uses?
;;;;      Determined by walking up from the target. A module is externally
;;;;      visible iff its parent `:open`s it (and the parent is itself
;;;;      externally visible). Otherwise the face is the closest ancestor
;;;;      that IS externally visible.
;;;;
;;;; The `:open` config key on a module is a SET of direct-child module
;;;; symbols that the parent explicitly exposes to the outside world (as
;;;; if they were top-level modules). An unspecified or empty `:open`
;;;; means no children are externally visible — pure encapsulation.
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
  "True if `m` is visible to unrelated outside code as a referenceable module.

  A module is externally visible iff it is top-level OR its parent both
  `:open`s it AND is itself externally visible. The recursion bottoms out at
  top-level modules."
  [config m]
  (if-let [p (parent-module m)]
    (and (opens-child? config p m)
         (externally-visible? config p))
    true))

(defn- external-face
  "The module that unrelated outside code must reference in order to reach
  anything inside `m`. If `m` is externally visible, returns `m` itself.
  Otherwise returns the closest ancestor of `m` that IS externally visible
  (which is guaranteed to exist, because the root is always externally
  visible)."
  [config m]
  (if (externally-visible? config m)
    m
    (external-face config (parent-module m))))

(defn- internally-visible?
  "True if `viewer` can see `viewed`'s internals without going through the
  target's `:api`. This is the case for:

    - same module
    - parent → descendant (any depth)
    - siblings (same direct parent)

  Crucially it is NOT the case for descendant → parent: a child can still
  see its parent, but only through the parent's `:api` (same as any other
  outside caller would).

  Returns a proper boolean."
  [viewer viewed]
  (boolean
   (or (= viewer viewed)
       (ancestor? viewer viewed)
       (siblings? viewer viewed))))

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

(defn allowed-module?
  "True if `current-module` is allowed to depend on `required-module` based on
  `current-module`'s `:uses` declaration.

  Under nested modules, `:uses lib` covers both `lib` and any of lib's
  externally-visible descendants (those reached via `:open`). We walk from
  the required module's external face upward through the ancestor chain,
  and allow if any ancestor is declared in `current-module`'s `:uses`.
  Every ancestor of the external face is itself externally-visible (by the
  transitivity of `externally-visible?`), so this is the correct reach.

  Also accepts a `:uses` entry that literally names the required module,
  even if it's not the canonical external face — backwards compat for flat
  configs where `:uses` entries name modules directly."
  [config current-module required-module]
  (let [allowed-modules (allowed-modules config current-module)]
    (if (= allowed-modules :any)
      true
      (let [face        (external-face config required-module)
            face-chain  (cons face (ancestor-chain face))
            allowed-set (set allowed-modules)]
        (boolean
         (or (some allowed-set face-chain)
             (contains? allowed-set required-module)))))))

(defn- allowed-module-namespace?
  "True if `ns-symb` (the namespace being required) is an allowed reference
  from `current-module`. Checks the external-face's `:api` list and
  `:friends` list. Under flat configs (no nesting declared), the external
  face of any module is the module itself, so this is equivalent to the
  pre-nesting direct `:api`/`:friends` check."
  [config current-module ns-symb]
  (let [required-module     (module config ns-symb)
        face                (external-face config required-module)
        face-api-namespaces (module-api-namespaces config face)
        face-friends        (module-friends config face)]
    (or (empty? face-api-namespaces)
        (contains? face-api-namespaces ns-symb)
        (contains? face-friends current-module))))

(defn usage-error
  "Find usage errors when a `required-namespace` is required in the `current-module`. Returns a string describing the
  error type if there is one, otherwise `nil` if there are no errors.

  Historical note: this function used to carry a special-case clause that
  forbade non-`-rest` modules from depending on `-rest` modules (plus an
  exception for `-routes` and `core`). That invariant is now enforced
  entirely at test time via
  `metabase.core.modules-test/do-not-use-rest-modules-in-other-modules-test`,
  which is the authoritative check. The inline kondo-hook duplicate has been
  removed so that the hook can stay simple and suffix-based workarounds
  don't proliferate."
  [config current-module required-namespace]
  ;; ignore stuff not in a module i.e. non-Metabase stuff.
  (when-let [required-module (module config required-namespace)]
    (when-not (= current-module required-module)
      ;; Nested-module early-exit: if the required module is internally
      ;; visible to the current module (ancestor, descendant, or sibling),
      ;; no :uses or :api check is required.
      (when-not (internally-visible? current-module required-module)
        (cond
          (not (allowed-module? config current-module required-module))
          (format "Module %s should not be used in the %s module. [:metabase/modules %s :uses]"
                  required-module
                  current-module
                  current-module)

          (not (allowed-module-namespace? config current-module required-namespace))
          (format "Namespace %s is not an allowed external API namespace for the %s module. [:metabase/modules %s :api]"
                  required-namespace
                  required-module
                  required-module))))))
