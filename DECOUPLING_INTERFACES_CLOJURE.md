# Decoupling via Defined Interfaces in Clojure

## A Deep Dive into Clojure's Interface Mechanisms

This document provides comprehensive coverage of Clojure's approaches to decoupling and defining interfaces, including protocols, multimethods, spec, Malli, and component systems.

---

## Table of Contents

1. [Protocols](#protocols)
2. [Multimethods](#multimethods)
3. [Protocols vs Multimethods Decision Matrix](#protocols-vs-multimethods-decision-matrix)
4. [Clojure Spec](#clojure-spec)
5. [Malli](#malli)
6. [Component Systems](#component-systems)
7. [Dependency Injection Patterns](#dependency-injection-patterns)
8. [Best Practices](#best-practices)
9. [Resources and References](#resources-and-references)

---

## Protocols

Protocols provide high-performance, type-based polymorphism that solves the expression problem.

### Definition and Basic Usage

```clojure
(defprotocol Greetable
  "A protocol for things that can greet"
  (greet [this] "Return a greeting")
  (greet-with-name [this name] "Return a personalized greeting"))
```

### Implementation with defrecord

```clojure
(defprotocol WereCreature
  (full-moon-behavior [creature]))

(defrecord WereWolf [name title]
  WereCreature
  (full-moon-behavior [this]
    (str name " will howl and murder")))

;; Usage
(def jacob (->WereWolf "Jacob" "Alpha"))
(full-moon-behavior jacob)  ; => "Jacob will howl and murder"
```

### Extension Mechanisms

**extend-type** - One type, multiple protocols:

```clojure
(extend-type java.lang.String
  Greetable
  (greet [this] (str "Hello, I am " this))
  (greet-with-name [this name] (str this " says hello to " name)))
```

**extend-protocol** - One protocol, multiple types:

```clojure
(extend-protocol Greetable
  java.lang.String
  (greet [s] (str "String: " s))

  clojure.lang.PersistentVector
  (greet [v] (str "Vector with " (count v) " items"))

  java.lang.Object
  (greet [o] "Generic greeting"))
```

**Reification** - Anonymous implementations:

```clojure
(defn open-resource [path]
  (let [resource (load-resource path)]
    (reify
      Closeable
      (close [this] (cleanup resource))

      Object
      (toString [this] (str "Resource: " path)))))
```

### When to Use Protocols

- Single dispatch on first argument's type
- Need maximum performance (~5x faster than multimethods)
- Defining coherent abstractions (group of related functions)
- Building libraries for others to extend

---

## Multimethods

Multimethods provide maximum flexibility with dispatch on any function of any arguments.

### Basic Pattern

```clojure
(defmulti encounter
  (fn [creature1 creature2]
    [(:species creature1) (:species creature2)]))

(defmethod encounter [:human :dog]
  [h d]
  (str (:name h) " pets " (:name d)))

(defmethod encounter :default
  [c1 c2]
  (str (:name c1) " ignores " (:name c2)))
```

### Hierarchies

```clojure
(derive ::square ::rect)
(derive ::rect ::shape)

(defmulti area :shape-type)

(defmethod area ::rect
  [{:keys [width height]}]
  (* width height))

;; Square inherits rect implementation
(area {:shape-type ::square :width 5 :height 5})  ; => 25
```

### When to Use Multimethods

- Dispatch on multiple arguments
- Dispatch on values (not types)
- Need custom hierarchies
- Dispatch logic is complex or arbitrary

---

## Protocols vs Multimethods Decision Matrix

| Scenario | Recommendation |
|----------|----------------|
| Dispatch on first argument's type only | **Protocols** |
| Performance critical | **Protocols** (~5x faster) |
| Dispatch on multiple arguments | **Multimethods** |
| Dispatch on values/keywords | **Multimethods** |
| Custom hierarchies | **Multimethods** |
| Maximum REPL flexibility | **Multimethods** |

### Key References

**Talks:**
- [Rich Hickey on Protocols (InfoQ 2010)](https://www.infoq.com/interviews/hickey-clojure-protocols/)
- [Clojure's Solutions to the Expression Problem (Strange Loop)](https://www.infoq.com/presentations/Clojure-Expression-Problem/)

**Documentation:**
- [Clojure Protocols Reference](https://clojure.org/reference/protocols)
- [Clojure Multimethods Reference](https://clojure.org/reference/multimethods)

**Books:**
- ["The Joy of Clojure" Chapter 9](https://www.manning.com/books/the-joy-of-clojure-second-edition)
- ["Clojure for the Brave and True"](https://www.braveclojure.com/multimethods-records-protocols/)

---

## Clojure Spec

Spec provides specifications for data and function contracts with generative testing support.

### Defining Specifications

```clojure
(require '[clojure.spec.alpha :as s])

;; Simple predicates
(s/def ::email string?)
(s/def ::age pos-int?)

;; Map specs
(s/def ::person
  (s/keys :req [::name ::age]
          :opt [::email]))

;; Using specs
(s/valid? ::person {::name "Alice" ::age 30})  ; => true
```

### Function Contracts

```clojure
(defn ranged-rand [start end]
  (+ start (rand-int (- end start))))

(s/fdef ranged-rand
  :args (s/and (s/cat :start int? :end int?)
               #(< (:start %) (:end %)))
  :ret int?
  :fn (s/and #(>= (:ret %) (-> % :args :start))
             #(< (:ret %) (-> % :args :end))))
```

### Instrumentation

```clojure
(require '[clojure.spec.test.alpha :as stest])

;; Enable validation during development
(stest/instrument)

;; Run generative tests
(stest/check `ranged-rand)
```

### Key Resources

**Talks:**
- [Rich Hickey - "Spec-ulation" (Clojure/conj 2016)](https://www.youtube.com/watch?v=oyLBGkS5ICk)
- [Rich Hickey - "Maybe Not" (Clojure/conj 2018)](https://www.youtube.com/watch?v=YR5WdGrpoug)
- [Alex Miller - "clojure.spec" (Strange Loop 2016)](https://www.youtube.com/watch?v=VNTQ-M_uSo8)

**Documentation:**
- [Clojure Spec Guide](https://clojure.org/guides/spec)
- [Spec 2 Alpha Repository](https://github.com/clojure/spec-alpha2)

---

## Malli

Malli is a high-performance, data-driven schema library from Metosin.

### Schema Definition

```clojure
(require '[malli.core :as m])

(def Person
  [:map
   [:name :string]
   [:age :int]
   [:email {:optional true} :string]])

(m/validate Person {:name "Alice" :age 30})  ; => true

;; Compiled validator for performance
(def valid-person? (m/validator Person))
```

### Function Schemas

```clojure
(m/=> plus [:=> [:cat :int :int] :int])

(defn plus [x y] (+ x y))

;; Instrumentation
(require '[malli.instrument :as mi])
(mi/instrument!)
```

### Transformations and Coercion

```clojure
(require '[malli.transform :as mt])

(m/decode :int "42" (mt/string-transformer))
; => 42

(m/decode
  [:map [:x :boolean] [:y :int]]
  {:x "true" :y "1"}
  (mt/string-transformer))
; => {:x true, :y 1}
```

### Error Messages

```clojure
(require '[malli.error :as me])

(-> Person
    (m/explain {:name 123})
    (me/humanize))
; => {:name ["should be a string"]}
```

### Spec vs Malli Comparison

| Feature | Clojure Spec | Malli |
|---------|--------------|-------|
| **Syntax** | Macro-based | Data-driven |
| **Performance** | Good | Excellent (10-100x) |
| **Transformation** | Not supported | Built-in |
| **Error Messages** | Basic | Rich with spell-check |
| **JSON Schema** | Third-party | Built-in |
| **Global Registry** | Required | Optional |

### When to Choose Malli

- Runtime schema creation
- Data transformation/coercion
- Better error messages
- JSON Schema generation
- Performance-critical validation

### Key Resources

**Documentation:**
- [Malli GitHub](https://github.com/metosin/malli)
- [Function Schemas](https://github.com/metosin/malli/blob/master/docs/function-schemas.md)
- [Value Transformation](https://github.com/metosin/malli/blob/master/docs/value-transformation.md)

---

## Component Systems

Three major libraries for managing application state and dependencies.

### Component (Stuart Sierra)

**Philosophy:** Explicit dependency injection with lifecycle management.

```clojure
(require '[com.stuartsierra.component :as component])

(defrecord Database [host port connection]
  component/Lifecycle
  (start [this]
    (assoc this :connection (connect host port)))
  (stop [this]
    (.close connection)
    (assoc this :connection nil)))

(defn create-system [config]
  (component/system-map
    :database (new-database (:db-host config) (:db-port config))
    :app (component/using
           (new-application)
           [:database])))

(def system (component/start (create-system config)))
```

**GitHub:** https://github.com/stuartsierra/component

### Integrant (James Reeves)

**Philosophy:** Data-driven configuration with multimethod lifecycle.

**config.edn:**
```clojure
{:adapter/jetty {:port 8080
                 :handler #ig/ref :handler/api}
 :handler/api {:database #ig/ref :database/postgres}
 :database/postgres {:host "localhost" :port 5432}}
```

```clojure
(require '[integrant.core :as ig])

(defmethod ig/init-key :database/postgres [_ {:keys [host port]}]
  (create-connection host port))

(defmethod ig/halt-key! :database/postgres [_ conn]
  (.close conn))

(def system (ig/init config))
```

**GitHub:** https://github.com/weavejester/integrant

### Mount (Anatoly Polinsky)

**Philosophy:** Namespace-based states with compiler-driven ordering.

```clojure
(require '[mount.core :refer [defstate]])

(defstate conn
  :start (create-connection config)
  :stop (close-connection conn))

;; Start all states
(mount/start)

;; Testing with substitutes
(mount/start-with {#'myapp.db/conn mock-conn})
```

**GitHub:** https://github.com/tolitius/mount

### Comparison Table

| Feature | Component | Integrant | Mount |
|---------|-----------|-----------|-------|
| **Configuration** | Code | EDN | In defstate |
| **Dependencies** | Explicit | Refs | Implicit |
| **Multiple instances** | Native | Composite keys | Limited |
| **Learning curve** | Moderate | Moderate | Easy |
| **Boilerplate** | High | Medium | Low |

### When to Use Each

- **Component** - Large apps, explicit dependencies, DI familiar teams
- **Integrant** - Data-driven config, Duct framework
- **Mount** - Incremental adoption, minimal ceremony, REPL-first

### Avoiding the "God Object" Problem

A common criticism of Component/Integrant is that they lead to functions requiring large system objects with all dependencies. Here's how to avoid this anti-pattern:

#### 1. Pass Only What's Needed

```clojure
;; Bad - god object
(defn create-user [app-component user-data]
  (let [db (:database app-component)
        email (:email-service app-component)]
    ...))

;; Good - explicit minimal dependencies
(defn create-user [db email-service user-data]
  ...)
```

#### 2. Functional Core, Imperative Shell

Keep business logic pure - it doesn't need dependencies:

```clojure
;; Pure core - no dependencies needed
(defn calculate-order-total [order discounts tax-rate]
  (let [subtotal (reduce + (map :price (:items order)))
        discount (apply-discounts subtotal discounts)]
    (* discount (+ 1 tax-rate))))

;; Thin shell - only this needs dependencies
(defn process-order! [db email-service order]
  (let [discounts (db/get-discounts db (:user-id order))
        tax-rate (db/get-tax-rate db (:region order))
        total (calculate-order-total order discounts tax-rate)]
    (db/save-order! db (assoc order :total total))
    (email/send-receipt! email-service order)))
```

#### 3. Partial Application / Closures

Pre-bind dependencies at system startup:

```clojure
(defn make-user-creator [db email-service]
  (fn [user-data]
    (let [user (db/insert! db :users user-data)]
      (email/send-welcome! email-service user)
      user)))

(defrecord UserService [database email-service create-user]
  component/Lifecycle
  (start [this]
    (assoc this :create-user
           (make-user-creator database email-service)))
  (stop [this]
    (assoc this :create-user nil)))

;; Usage - clean single-purpose function
((:create-user user-service) {:name "Alice" :email "alice@example.com"})
```

#### 4. Protocol Segregation

Define narrow, focused protocols instead of one big component:

```clojure
;; Good - segregated protocols
(defprotocol UserRepository
  (find-user [this id])
  (save-user [this user]))

(defprotocol EmailSender
  (send-email [this to subject body]))

;; Functions declare exactly what they need
(defn notify-user [email-sender user message]
  (send-email email-sender (:email user) "Notification" message))
```

#### 5. The "Has" Pattern

Define capability protocols that document requirements:

```clojure
(defprotocol HasDatabase
  (get-database [this]))

(defprotocol HasEmailService
  (get-email-service [this]))

(defrecord AppComponent [database email-service]
  HasDatabase
  (get-database [this] database)
  HasEmailService
  (get-email-service [this] email-service))

;; Function documents exactly what it needs
(defn create-user [component user-data]
  {:pre [(satisfies? HasDatabase component)
         (satisfies? HasEmailService component)]}
  (let [db (get-database component)
        email (get-email-service component)]
    ...))
```

#### 6. Layered Architecture

Organize components so each layer has limited scope:

```clojure
;; Layer 1: Infrastructure
:database (new-database config)
:cache (new-cache config)

;; Layer 2: Repositories (only infrastructure deps)
:user-repo (component/using (new-user-repo) [:database :cache])

;; Layer 3: Services (repos + services)
:user-service (component/using (new-user-service)
                [:user-repo :email-client])

;; Layer 4: Handlers (only services they need)
:user-handler (component/using (new-user-handler) [:user-service])
```

#### Key Principle

The god object problem comes from conflating "what I depend on" with "what I need for this operation."

| Anti-Pattern | Better Approach |
|--------------|-----------------|
| Pass whole system | Pass specific dependencies |
| One big component | Many small, focused components |
| All logic in components | Pure functions + thin component shell |
| Components do everything | Components just wire things together |

### REPL-Friendly Patterns

A common pain point with component systems is needing to start the entire system just to run a quick query. Here's how to maintain REPL productivity:

#### 1. Standalone Resource Constructors

Design components so resources can be created independently:

```clojure
;; This should work without any system
(def conn (db/create-connection {:host "localhost" :port 5432}))
(jdbc/execute! conn ["SELECT * FROM users LIMIT 5"])
(.close conn)

;; The component just automates lifecycle
(defrecord Database [config conn]
  component/Lifecycle
  (start [this] (assoc this :conn (db/create-connection config)))
  (stop [this] (.close conn) (assoc this :conn nil)))
```

#### 2. Dev Namespace with Helpers

```clojure
(ns user
  (:require [integrant.repl :refer [go halt reset]]
            [integrant.repl.state :refer [system]]))

;; Convenience accessors
(defn db [] (:database/postgres system))
(defn cache [] (:cache/redis system))

;; Quick connection without system
(defn dev-db []
  (db/create-connection (load-dev-config)))

(defmacro with-dev-db [binding & body]
  `(let [~binding (dev-db)]
     (try ~@body (finally (.close ~binding)))))

;; At REPL:
(with-dev-db [conn]
  (jdbc/execute! conn ["SELECT count(*) FROM users"]))
```

#### 3. Partial System Startup

Start only what you need:

```clojure
;; Integrant - start specific keys
(def db-only (ig/init config [:database/postgres]))
(jdbc/execute! (:database/postgres db-only) ["SELECT 1"])
(ig/halt! db-only)

;; Mount - start specific states
(mount/start #'myapp.db/conn)
(jdbc/execute! myapp.db/conn ["SELECT 1"])
```

#### 4. The "Bag of Functions" Pattern

Return pre-bound functions that manage their own resources:

```clojure
(defn make-user-operations [db-config]
  (let [get-conn #(db/create-connection db-config)]
    {:get-user (fn [id]
                 (with-open [conn (get-conn)]
                   (jdbc/get-by-id conn :users id)))
     :list-users (fn []
                   (with-open [conn (get-conn)]
                     (jdbc/execute! conn ["SELECT * FROM users"])))}))

;; At REPL - no system needed
(def ops (make-user-operations dev-config))
((:list-users ops))
```

#### Key Insight

**Separate resource creation from lifecycle management.** Your constructors should work standalone; the component system just manages them.

### Combining Multimethods with Component Systems

Multimethods and component systems solve different problems and work well together:

| Concern | Solution |
|---------|----------|
| **Polymorphism** - Different behavior by type/value | Multimethods / Protocols |
| **Lifecycle & Dependencies** - Managing stateful resources | Component / Integrant / Mount |

#### When Multimethods Are Enough

If your implementations are **stateless** (use global resources like database pools), pure multimethods work great:

```clojure
;; No components needed - uses global database access
(defmulti authenticate (fn [provider _request] provider))

(defmethod authenticate :provider/password
  [_provider request]
  ;; t2/select uses global connection pool
  (let [user (t2/select-one :model/User :email (:email request))]
    (when (check-password user (:password request))
      {:success? true :user-id (:id user)})))
```

#### When to Add Components

Add component management when providers need:
- **Connection pools** - LDAP, HTTP clients
- **Caching** - Provider-specific caches
- **Background processes** - Token refresh
- **Expensive initialization** - SAML metadata, keys

#### Pattern 1: Pass Dependencies Through Context

Multimethod receives dependencies via context map:

```clojure
(defmulti authenticate
  (fn [provider _context _request] provider))

;; Simple providers ignore context
(defmethod authenticate :provider/password
  [_provider _context request]
  (password-authenticate request))

;; Complex providers use context
(defmethod authenticate :provider/ldap
  [_provider {:keys [ldap-client]} request]
  (ldap-authenticate ldap-client request))

;; Component creates context
(defrecord AuthService [ldap-client saml-config database]
  component/Lifecycle
  (start [this]
    (assoc this :context {:ldap-client ldap-client
                          :saml-config saml-config
                          :database database}))
  (stop [this] this))

;; Public API with default context
(defn authenticate-user
  ([provider request]
   (authenticate provider default-context request))
  ([provider context request]
   (authenticate provider context request)))
```

#### Pattern 2: Component Registry of Providers

Each provider is a component implementing a protocol:

```clojure
(defprotocol AuthProvider
  (authenticate [this request]))

(defrecord LdapProvider [ldap-client config]
  component/Lifecycle
  (start [this]
    (assoc this :ldap-client (ldap/connect config)))
  (stop [this]
    (ldap/disconnect ldap-client)
    this)

  AuthProvider
  (authenticate [this request]
    (ldap-authenticate ldap-client request)))

;; Registry holds all providers
(defrecord AuthRegistry [ldap-provider saml-provider]
  component/Lifecycle
  (start [this]
    (assoc this :providers
           {:provider/ldap ldap-provider
            :provider/saml saml-provider}))
  (stop [this] this))

;; Lookup and delegate
(defn authenticate-user [registry provider-key request]
  (if-let [provider (get-in registry [:providers provider-key])]
    (authenticate provider request)
    (throw (ex-info "Unknown provider" {:provider provider-key}))))
```

#### Recommended Hybrid Approach

Use multimethods for dispatch with optional context for dependencies:

```clojure
(defmulti authenticate
  (fn [provider _context _request] provider))

;; Stateless - ignores context
(defmethod authenticate :provider/password
  [_provider _context request]
  (password-authenticate request))

;; Stateful - uses context
(defmethod authenticate :provider/ldap
  [_provider {:keys [ldap-pool]} request]
  (ldap-authenticate ldap-pool request))

;; Default context for production
(def default-auth-context
  {:ldap-pool @ldap-connection-pool
   :http-client @http-client})

;; Testable public API
(defn authenticate-user
  ([provider request]
   (authenticate-user provider default-auth-context request))
  ([provider context request]
   (authenticate provider context request)))
```

This gives you:
- Backward compatibility with stateless providers
- Dependency injection for providers that need it
- Testability (pass mock context)
- No forced component system overhead

### Key Resources

**Talks:**
- [Stuart Sierra - Components Just Enough Structure](https://www.youtube.com/watch?v=av9Xi6CNqq4) (Clojure/West 2014)

**Books:**
- [Clojure Applied](https://pragprog.com/titles/vmclojeco/clojure-applied/) - Chapters 6 & 7

**Comparisons:**
- [Yogthos - Contrasting Component and Mount](https://yogthos.net/posts/2016-01-19-ContrastingComponentAndMount.html)
- [Mount - Differences from Component](https://github.com/tolitius/mount/blob/master/doc/differences-from-component.md)

---

## Dependency Injection Patterns

### Pattern 1: Higher-Order Functions

```clojure
(defn calculate-total [get-price items]
  (reduce + (map get-price items)))

;; Production
(calculate-total db/get-price items)

;; Test
(calculate-total (constantly 10.0) items)
```

### Pattern 2: Configuration Maps

```clojure
(defn process-order [{:keys [db-conn email-service]} order]
  (-> order
      (save-to-db db-conn)
      (send-confirmation email-service)))
```

### Pattern 3: Protocols and Records

```clojure
(defprotocol EmailService
  (send-email [this to subject body]))

(defrecord SmtpService [config]
  EmailService
  (send-email [this to subject body]
    (smtp/send config to subject body)))

(defrecord MockEmailService [sent-emails]
  EmailService
  (send-email [this to subject body]
    (swap! sent-emails conj {:to to :subject subject})))
```

### Pattern 4: Functional Core, Imperative Shell

```clojure
;; Pure core
(defn calculate-discount [user order]
  (cond
    (:premium user) (* 0.8 (:total order))
    (:member user) (* 0.9 (:total order))
    :else (:total order)))

;; Impure shell
(defn process-order! [db user-id order-id]
  (let [user (db/get-user db user-id)
        order (db/get-order db order-id)
        discounted (calculate-discount user order)]  ; Pure!
    (db/update-order! db order-id {:total discounted})))
```

---

## Toucan Lifecycle Hooks and Model Coupling

Toucan2 lifecycle hooks (`define-before-insert`, `define-after-update`, etc.) are a form of implicit coupling that deserves special consideration.

### The Trade-off

Lifecycle hooks provide **automatic enforcement** - you can't forget to call them - but create **hidden dependencies** that are hard to trace and test.

### When Hooks Work Well

**Use hooks for single-model concerns:**

```clojure
;; Good - validation and normalization
(t2/define-before-insert :model/User
  [user]
  (-> user
      (update :email u/lower-case-en)
      (assoc :date_joined (t/offset-date-time))))

;; Good - simple defaults
(t2/define-before-insert :model/Card
  [card]
  (assoc card :creator_id api/*current-user-id*))
```

### When Hooks Cause Problems

**Avoid hooks for complex multi-model operations:**

```clojure
;; Problematic - hidden cross-model coupling
(t2/define-after-insert :model/User
  [user]
  ;; Caller has no idea this happens
  (t2/insert! :model/AuthIdentity {:user_id (:id user) ...})
  (t2/insert! :model/PermissionsGroupMembership {:user_id (:id user) ...})
  (events/publish-event! :event/user-joined {:user user})
  user)
```

**Problems with this pattern:**
- Callers don't know what else happens on insert
- Hard to create a "bare" user for testing
- Transaction boundaries are unclear
- Can cause N+1 queries or circular dependencies

### Better Alternatives

#### 1. Service Functions for Complex Operations

```clojure
;; Explicit orchestration - caller knows what happens
(defn create-user!
  "Create a user with all related entities."
  [user-data]
  (t2/with-transaction [_conn]
    (let [user (t2/insert-returning-instance! :model/User user-data)]
      (t2/insert! :model/AuthIdentity {:user_id (:id user) ...})
      (add-to-default-group! user)
      (events/publish-event! :event/user-joined {:user user})
      user)))

;; Keep the hook simple
(t2/define-before-insert :model/User
  [user]
  (-> user
      (update :email u/lower-case-en)
      (assoc :date_joined (t/offset-date-time))))
```

#### 2. Events for Async Side Effects

```clojure
;; Loose coupling via events
(t2/define-after-insert :model/Card
  [card]
  (events/publish-event! :event/card-create {:object card})
  card)

;; Handlers are separate and testable
(methodical/defmethod events/publish-event! :event/card-create
  [_topic {:keys [object]}]
  (search/update-index! object)
  (audit/log-create! object))
```

#### 3. Derived Hooks for Cross-Cutting Concerns

```clojure
;; Metabase pattern - declare capabilities
(methodical/defmethod t2/model-hooks :model/Card
  [_model]
  [:hook/timestamped? :hook/entity-id :hook/search-index])

;; Single implementation for all models with this hook
(t2/define-before-insert :hook/timestamped?
  [instance]
  (assoc instance
         :created_at (t/offset-date-time)
         :updated_at (t/offset-date-time)))
```

### Coupling Analysis: When to Use What

| Pattern | Use For | Coupling | Testability |
|---------|---------|----------|-------------|
| **Lifecycle Hooks** | Validation, defaults, single-model transforms | Tight | Hard |
| **Service Functions** | Complex multi-model operations | Medium | Good |
| **Events** | Async side effects (indexing, notifications) | Loose | Good |
| **Derived Hooks** | Cross-cutting concerns (timestamps, IDs) | Medium | Good |

### Problem Patterns to Avoid

1. **Hidden N+1 queries** - Hook that iterates over related entities
2. **Circular dependencies** - Model A hook calls Model B which calls Model A
3. **Transaction ambiguity** - Unclear if hook runs in same transaction
4. **Requiring-resolve hacks** - Sign of circular dependency

### Recommendations

1. **Keep hooks simple** - Validation and single-model transforms only
2. **Use service functions** - For anything that touches multiple models
3. **Use events** - For side effects that don't need to be transactional
4. **Document what happens** - If a hook does something surprising, document it

```clojure
;; Good documentation
(t2/define-after-insert :model/Database
  [database]
  ;; NOTE: This creates DataPermissions entries for ALL groups
  ;; and schedules sync tasks. See `create-database!` for the
  ;; full orchestration.
  (create-default-permissions! database)
  (schedule-sync-tasks! database)
  database)
```

The goal is **explicit over implicit** - callers should be able to understand what happens when they call `t2/insert!` vs `create-database!`.

---

## Best Practices

### Interface Design

1. **Keep interfaces small** - Single-method protocols are easier to extend
2. **Start with maps** - Graduate to records when needed
3. **Spec at boundaries** - Not everywhere, just system edges
4. **Program to abstractions** - Not implementations

### Protocol Usage

```clojure
;; Good - small, focused
(defprotocol Nameable (get-name [x]))
(defprotocol Describable (get-description [x]))

;; Avoid - too broad
(defprotocol Entity
  (get-name [x])
  (get-description [x])
  (get-id [x])
  (serialize [x]))
```

### Multimethod Usage

```clojure
;; Good - simple dispatch
(defmulti process :type)

;; Avoid - expensive dispatch function
(defmulti process (fn [x] (expensive-calculation x)))

;; Always provide default
(defmethod process :default [x]
  (throw (ex-info "Unknown type" {:input x})))
```

### Spec/Malli Usage

```clojure
;; Good - at API boundary
(s/fdef api-handler :args (s/cat :request ::api-request))

;; Avoid - internal implementation
;; (s/fdef private-helper ...)

;; Don't use spec for coercion (use Malli instead)
```

### Testing

```clojure
;; Test with protocol implementations
(deftest service-test
  (let [mock-db (->MockDatabase (atom {}))]
    (is (valid? (process-data mock-db input)))))

;; Test with spec/malli generators
(defspec round-trip 100
  (prop/for-all [person (mg/generator Person)]
    (= person (-> person serialize deserialize))))
```

---

## Resources and References

### Official Documentation

- [Clojure Protocols](https://clojure.org/reference/protocols)
- [Clojure Multimethods](https://clojure.org/reference/multimethods)
- [Clojure Spec Guide](https://clojure.org/guides/spec)

### Video Talks

| Talk | Speaker | Event | Link |
|------|---------|-------|------|
| Protocols and Clojure 1.3 | Rich Hickey | InfoQ 2010 | [Link](https://www.infoq.com/interviews/hickey-clojure-protocols/) |
| Spec-ulation | Rich Hickey | Clojure/conj 2016 | [Link](https://www.youtube.com/watch?v=oyLBGkS5ICk) |
| Maybe Not | Rich Hickey | Clojure/conj 2018 | [Link](https://www.youtube.com/watch?v=YR5WdGrpoug) |
| clojure.spec | Alex Miller | Strange Loop 2016 | [Link](https://www.youtube.com/watch?v=VNTQ-M_uSo8) |
| Components | Stuart Sierra | Clojure/West 2014 | [Link](https://www.youtube.com/watch?v=av9Xi6CNqq4) |

### Books

- [The Joy of Clojure](https://www.manning.com/books/the-joy-of-clojure-second-edition) - Chapter 9
- [Clojure for the Brave and True](https://www.braveclojure.com/multimethods-records-protocols/)
- [Clojure Applied](https://pragprog.com/titles/vmclojeco/clojure-applied/) - Chapters 6 & 7

### Libraries

| Library | Purpose | Link |
|---------|---------|------|
| Component | Dependency injection | [GitHub](https://github.com/stuartsierra/component) |
| Integrant | Data-driven systems | [GitHub](https://github.com/weavejester/integrant) |
| Mount | Namespace states | [GitHub](https://github.com/tolitius/mount) |
| Malli | Data schemas | [GitHub](https://github.com/metosin/malli) |
| Spec-tools | Spec utilities | [GitHub](https://github.com/metosin/spec-tools) |
| Expound | Better spec errors | [GitHub](https://github.com/bhb/expound) |

### Blog Posts

- [Polymorphic Performance](https://insideclojure.org/2015/04/27/poly-perf/) - Alex Miller
- [Contrasting Component and Mount](https://yogthos.net/posts/2016-01-19-ContrastingComponentAndMount.html) - Yogthos
- [Data Validation in Clojure](https://ostash.dev/posts/2021-08-22-data-validation-in-clojure/)

---

## Summary

Clojure provides multiple mechanisms for decoupling:

| Mechanism | Use Case | Performance |
|-----------|----------|-------------|
| **Protocols** | Type-based dispatch | Excellent |
| **Multimethods** | Flexible dispatch | Good |
| **Spec** | Contracts + testing | Good |
| **Malli** | Schemas + transforms | Excellent |
| **Component/Integrant/Mount** | System management | N/A |

**Recommendations:**

1. Start with **higher-order functions** for simple DI
2. Use **protocols** for type-based polymorphism
3. Use **multimethods** for complex dispatch logic
4. Use **Malli** for validation with transformation
5. Use **Spec** for function contracts and generative testing
6. Choose **Component/Integrant/Mount** based on team preference and app complexity

The key principle: **start simple, add abstraction when needed**. Maps and functions go a long way before you need protocols or multimethods.
