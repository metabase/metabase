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
  in the module tree). Top-level modules are siblings of each other only if
  both are top-level and in the same namespace part (e.g. two OSS top-level
  modules are not treated as siblings here — each is its own root)."
  [a b]
  (let [pa (parent-module a)
        pb (parent-module b)]
    (and pa pb (= pa pb))))

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
  outside caller would)."
  [viewer viewed]
  (or (= viewer viewed)
      (ancestor? viewer viewed)
      (siblings? viewer viewed)))

;;;; -------------------------------------------------------------------------
;;;; Namespace → module resolution
;;;; -------------------------------------------------------------------------

(defn- strip-metabase-prefix
  "Given a simple namespace symbol, return `[ns-part suffix]` where `ns-part`
  is `\"enterprise\"` for `metabase-enterprise.*` namespaces, `nil` for
  `metabase.*` namespaces, and the whole thing is `nil` for anything else
  (e.g. `clojure.core`).

    (strip-metabase-prefix 'metabase.lib.schema.foo)
      => [nil \"lib.schema.foo\"]

    (strip-metabase-prefix 'metabase-enterprise.transforms.core)
      => [\"enterprise\" \"transforms.core\"]

    (strip-metabase-prefix 'clojure.core)
      => nil"
  [ns-symb]
  (let [s (str ns-symb)]
    (cond
      (str/starts-with? s "metabase-enterprise.")
      ["enterprise" (subs s (count "metabase-enterprise."))]

      (str/starts-with? s "metabase.")
      [nil (subs s (count "metabase."))]

      :else
      nil)))

(defn- candidate-modules
  "For a given `[ns-part suffix-dotted-string]`, return the seq of candidate
  module symbols that the namespace could resolve to, from longest-prefix
  to shortest (single segment).

    (candidate-modules [nil \"lib.schema.foo.bar\"])
      => (lib.schema.foo.bar lib.schema.foo lib.schema lib)

    (candidate-modules [\"enterprise\" \"transforms.python\"])
      => (enterprise/transforms.python enterprise/transforms)"
  [[ns-part suffix]]
  (let [parts (str/split suffix #"\.")]
    (for [n (range (count parts) 0 -1)]
      (join-module [ns-part (take n parts)]))))

(defn module
  "Resolve a namespace symbol to the module symbol that owns it.

  With one arg (legacy, used by callers without access to a config): return
  the single-segment first-element extraction — the flat mapping behavior
  that predates nested modules. Equivalent to `(module nil ns-symb)`.

  With two args: if `config` is non-nil and has `:metabase/modules`
  declared, do **longest-prefix matching** against the declared module
  set. `metabase.lib.schema.foo` resolves to `lib.schema` if `lib.schema`
  is declared, else `lib`, else to the single-segment fallback. If no
  candidate is declared at all, fall back to the shortest candidate
  (single segment) — preserving backwards compatibility with the flat
  config model.

  CANONICAL: this function is the source-of-truth definition of the
  namespace→module resolution algorithm. Two other sites duplicate its
  behavior because they live in different classpath contexts and cannot
  share code:

    - dev/src/dev/deps_graph.clj              (namespace-symbol based)
    - mage/src/mage/modules.clj/file->module  (file-path based)

  If you change the algorithm here, update both of the above sites. The
  consistency test `metabase.core.modules-consistency-test` verifies they
  stay in sync by comparing the regex literals across the three files.

  Examples:

    (module 'metabase.qp.middleware.wow)
      => 'qp   ; single-segment fallback

    (module config 'metabase.lib.schema.foo)
      => 'lib.schema   ; if lib.schema is declared; else 'lib

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
     ;; Primary path: longest-prefix match against declared modules, if we
     ;; have a config and anything is declared. Uses a regex-free walk to
     ;; match the regex-based fallback below byte-for-byte on fallback.
     (when-let [stripped (strip-metabase-prefix ns-symb)]
       (let [candidates (candidate-modules stripped)
             declared   (when config (declared-modules config))]
         (or
          ;; Longest-prefix match against declared set.
          (when declared
            (first (filter declared candidates)))
          ;; Fallback: single-segment extraction via the original regexes.
          ;; Preserved byte-for-byte so the consistency test can compare
          ;; regex literals across the three mapping sites.
          (some->> (re-find #"^metabase-enterprise\.([^.]+)" (str ns-symb))
                   second
                   (symbol "enterprise"))
          (some-> (re-find #"^metabase\.([^.]+)" (str ns-symb))
                  second
                  symbol)))))))

;;;; -------------------------------------------------------------------------
;;;; Access checks
;;;; -------------------------------------------------------------------------

(defn- module-api-namespaces
  "Set of API namespace symbols for a given module. `:any` means you can use anything, there are no API namespaces for
  this module (yet). If unspecified, the default is just the `<module>.core` namespace."
  [config module]
  (let [module-config (get-in config [:metabase/modules module :api])]
    (cond
      (= module-config :any)
      nil

      (set? module-config)
      module-config

      :else
      (let [ns-prefix (if (= (namespace module) "enterprise")
                        (str "metabase-enterprise." (name module))
                        (name module))]
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
  `current-module`'s `:uses` declaration. Under nested modules, the
  `required-module` is replaced by its `external-face` (the module that
  outside code must reference) before the lookup — so `:uses lib` is
  sufficient to reach `lib.schema` if `lib` opens `lib.schema`."
  [config current-module required-module]
  (let [face            (external-face config required-module)
        allowed-modules (allowed-modules config current-module)]
    (or (= allowed-modules :any)
        (contains? (set allowed-modules) face)
        ;; Also accept a :uses entry that names the required module directly,
        ;; even if it's not the canonical external face. This is lenient but
        ;; matches current expectations where :uses entries literally name
        ;; the module they depend on.
        (contains? (set allowed-modules) required-module))))

(defn- allowed-module-namespace?
  "True if `ns-symb` (the namespace being required) is an allowed reference
  from `current-module`. Checks the external-face's `:api` list, and falls
  back to the face's `:friends` list for legacy escape hatches."
  [config current-module ns-symb]
  (let [required-module       (module config ns-symb)
        face                  (external-face config required-module)
        face-api-namespaces   (module-api-namespaces config face)
        face-friends          (module-friends config face)
        ;; The required-module's own api/friends are also honored for
        ;; backwards compatibility — when no nesting is in play, face ==
        ;; required-module and these are the same.
        direct-api-namespaces (module-api-namespaces config required-module)
        direct-friends        (module-friends config required-module)]
    (or (empty? face-api-namespaces)
        (contains? face-api-namespaces ns-symb)
        (contains? face-friends current-module)
        (empty? direct-api-namespaces)
        (contains? direct-api-namespaces ns-symb)
        (contains? direct-friends current-module))))

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
