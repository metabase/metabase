# Decoupling via Defined Interfaces in Functional Programming

## A Cross-Language Survey of Best Practices

This document surveys interface and decoupling mechanisms across functional programming languages, examining how different languages approach polymorphism, dependency injection, and architectural boundaries.

---

## Table of Contents

1. [Overview](#overview)
2. [Haskell](#haskell)
3. [ML Family (OCaml, Standard ML) & Scala](#ml-family-and-scala)
4. [Elixir](#elixir)
5. [F#](#f)
6. [Cross-Cutting Patterns](#cross-cutting-patterns)
7. [Key Papers and Talks](#key-papers-and-talks)
8. [Summary Comparison](#summary-comparison)

---

## Overview

Functional programming languages approach decoupling differently than object-oriented languages. Instead of interface-based inheritance hierarchies, FP languages typically use:

- **Type classes / Protocols** - Ad-hoc polymorphism
- **Module systems** - Encapsulation and abstraction
- **Effect systems** - Separating what from how
- **Higher-order functions** - Functions as first-class dependencies

Each approach has trade-offs in terms of expressiveness, performance, and ease of use.

---

## Haskell

Haskell provides the most sophisticated type-level interface mechanisms among mainstream FP languages.

### Type Classes

Type classes are Haskell's primary interface mechanism, providing ad-hoc polymorphism:

```haskell
class Comparable a where
  compare :: a -> a -> Ordering

  -- Default implementation
  lessThan :: a -> a -> Bool
  lessThan x y = compare x y == LT

instance Comparable Temperature where
  compare (Celsius x) (Celsius y) = Prelude.compare x y
```

**Key advantages over OOP interfaces:**
- Instances can be defined separately from type definitions
- Type safety enforced at compile time
- Laws provide semantic contracts

### Type Class Laws

Laws are semantic contracts that implementations must satisfy:

```haskell
-- Functor Laws
-- 1. Identity: fmap id == id
-- 2. Composition: fmap (f . g) == fmap f . fmap g

-- Monad Laws
-- 1. Left identity:  return a >>= k  ==  k a
-- 2. Right identity: m >>= return    ==  m
-- 3. Associativity:  (m >>= k) >>= h ==  m >>= (\x -> k x >>= h)
```

### Module System

Haskell uses explicit export lists for encapsulation:

```haskell
module Stack
    ( Stack        -- Export type only, not constructors
    , empty
    , push
    , pop
    ) where

-- Implementation hidden
data Stack a = Stack [a]

empty :: Stack a
empty = Stack []
```

**Smart constructors** enforce invariants:

```haskell
module Email (Email, mkEmail, emailText) where

newtype Email = Email Text

mkEmail :: Text -> Either String Email
mkEmail t
    | "@" `T.isInfixOf` t = Right (Email t)
    | otherwise = Left "Invalid email"
```

### Effect Systems

Haskell has evolved multiple approaches to decoupling effects:

#### MTL (Monad Transformer Library)

```haskell
processUser :: (MonadReader Config m, MonadState AppState m, MonadError AppError m)
            => UserId -> m User
```

#### ReaderT Pattern

```haskell
data Env = Env
    { envConfig   :: Config
    , envLogger   :: LogLevel -> Text -> IO ()
    , envDatabase :: Connection
    }

newtype AppM a = AppM { unAppM :: ReaderT Env IO a }
```

#### Modern Effect Systems

| Library | Performance | Ergonomics | Use Case |
|---------|-------------|------------|----------|
| effectful | Excellent | Good | Production |
| fused-effects | Excellent | Medium | Performance-critical |
| polysemy | Poor | Excellent | Prototyping |

### Key Resources

**Papers:**
- ["How to Make Ad-Hoc Polymorphism Less Ad Hoc"](https://dl.acm.org/doi/pdf/10.1145/75277.75283) - Wadler & Blott (1989)
- ["Data Types à la Carte"](https://www.cambridge.org/core/journals/journal-of-functional-programming/article/data-types-a-la-carte/14416CB20C4637164EA9F77097909409) - Swierstra (2008)
- ["Freer Monads, More Extensible Effects"](https://okmij.org/ftp/Haskell/extensible/more.pdf) - Kiselyov & Ishii (2015)

**Blogs:**
- [Three Layer Haskell Cake](https://www.parsonsmatt.org/2018/03/22/three_layer_haskell_cake.html) - Matt Parsons
- [The ReaderT Design Pattern](https://www.fpcomplete.com/blog/readert-design-pattern/) - FP Complete

---

## ML Family and Scala

### OCaml/Standard ML Module System

ML languages have the most powerful module systems with signatures and functors:

```ocaml
(* Signature defines interface *)
module type STACK = sig
  type 'a t
  val empty : 'a t
  val push : 'a -> 'a t -> 'a t
  val pop : 'a t -> ('a * 'a t) option
end

(* Module implements signature *)
module ListStack : STACK = struct
  type 'a t = 'a list
  let empty = []
  let push x s = x :: s
  let pop = function
    | [] -> None
    | x::xs -> Some (x, xs)
end
```

**Functors** enable parameterized modules (dependency injection at the module level):

```ocaml
module MakeCache (S : STORAGE) : CACHE = struct
  let get key = S.read key
  let set key value = S.write key value
end

module RedisCache = MakeCache(RedisStorage)
module MemCache = MakeCache(InMemoryStorage)
```

### Scala Type Classes and Tagless Final

Scala encodes type classes via implicit parameters:

```scala
trait Serializable[A] {
  def serialize(a: A): String
}

implicit val stringSerializable: Serializable[String] =
  (s: String) => s

def save[A: Serializable](a: A): Unit =
  println(implicitly[Serializable[A]].serialize(a))
```

**Tagless Final** provides effect abstraction:

```scala
trait UserRepository[F[_]] {
  def getUser(id: UserId): F[Option[User]]
  def saveUser(user: User): F[Unit]
}

// Production interpreter
class PostgresUserRepo extends UserRepository[IO] { ... }

// Test interpreter
class InMemoryUserRepo extends UserRepository[Id] { ... }
```

### Key Resources

**Papers:**
- ["Applicative Programming with Effects"](https://www.cambridge.org/core/journals/journal-of-functional-programming/article/applicative-programming-with-effects/9A3F61D50B56E6D40E779F9FE91C2021) - McBride & Paterson
- ["Finally Tagless, Partially Evaluated"](https://okmij.org/ftp/tagless-final/JFP.pdf) - Carette, Kiselyov, Shan

**Talks:**
- Odersky's talks on Scala type system
- "Constraints Liberate, Liberties Constrain" - Runar Bjarnason

---

## Elixir

Elixir provides two main mechanisms for polymorphism: behaviours and protocols.

### Behaviours

Behaviours define contracts that modules must implement:

```elixir
defmodule MyApp.Notifier do
  @callback send_notification(user :: term(), message :: String.t()) ::
    {:ok, reference()} | {:error, reason :: term()}
end

defmodule MyApp.EmailNotifier do
  @behaviour MyApp.Notifier

  @impl MyApp.Notifier
  def send_notification(user, message) do
    # Implementation
    {:ok, make_ref()}
  end
end
```

**Best practice:** Always use `@impl ModuleName` rather than `@impl true`.

### Protocols

Protocols enable polymorphism based on data type:

```elixir
defprotocol Size do
  def size(data)
end

defimpl Size, for: BitString do
  def size(string), do: byte_size(string)
end

defimpl Size, for: Map do
  def size(map), do: map_size(map)
end
```

### OTP Patterns

GenServer separates client API from server implementation:

```elixir
defmodule MyApp.Cache do
  use GenServer

  # Client API
  def get(key), do: GenServer.call(__MODULE__, {:get, key})
  def put(key, value), do: GenServer.cast(__MODULE__, {:put, key, value})

  # Server callbacks
  @impl GenServer
  def handle_call({:get, key}, _from, state) do
    {:reply, Map.get(state, key), state}
  end
end
```

### Key Resources

**Talks:**
- Jose Valim's ElixirConf Keynotes
- "Gang of None? Design Patterns in Elixir" - ElixirConf EU 2024

**Documentation:**
- [OTP Design Principles](https://www.erlang.org/doc/system/design_principles.html)
- [Elixir Behaviours](https://hexdocs.pm/elixir/behaviours.html)
- [Elixir Protocols](https://hexdocs.pm/elixir/protocols.html)

---

## F#

F# combines functional programming with .NET's object system.

### Object Expressions

Anonymous interface implementations:

```fsharp
type ILogger =
    abstract member Log : string -> unit

let createConsoleLogger prefix =
    { new ILogger with
        member _.Log(message) =
            printfn "[%s] %s" prefix message }
```

### Type Providers

Compile-time type generation from external schemas:

```fsharp
type MoviesProvider = JsonProvider<"movies.json">

let movies = MoviesProvider.Load("https://api.example.com/movies")
for movie in movies do
    printfn "%s (%d)" movie.Title movie.Year
```

### Computation Expressions

Uniform syntax for monadic computations:

```fsharp
let validateUser name email = result {
    let! validName = validateName name
    let! validEmail = validateEmail email
    return { Name = validName; Email = validEmail }
}
```

### Signature Files (.fsi)

Define public interfaces separately:

```fsharp
// Users.fsi
module Users =
    type User
    val create : name:string -> email:string -> Result<User, string>
    val findById : id:int -> User option
```

### Key Resources

**Talks:**
- ["F# Code I Love"](https://www.microsoft.com/en-us/research/video/f-code-i-love-don-syme/) - Don Syme
- ["The F# Path to Relaxation"](https://www.microsoft.com/en-us/research/video/the-f-path-to-relaxation-don-syme/) - Don Syme

**Articles:**
- [F# for Fun and Profit - Dependency Injection](https://fsharpforfunandprofit.com/posts/dependencies/)
- [Designing with Capabilities](https://fsharpforfunandprofit.com/cap/)

---

## Cross-Cutting Patterns

### Dependency Injection in FP

| Pattern | Description | Example |
|---------|-------------|---------|
| **Partial Application** | Pre-bind dependencies | `(partial save-user db)` |
| **Reader Monad** | Environment passing | `ReaderT Env IO a` |
| **Higher-Order Functions** | Functions as dependencies | `(defn process [get-data] ...)` |
| **Records of Functions** | Service objects | `{:get-user fn :save-user fn}` |

### Interface Design Principles

1. **Minimal Surface Area** - Small, focused interfaces
2. **Composition over Inheritance** - Combine small pieces
3. **Data-Oriented Boundaries** - Pass data, not behavior
4. **Test at the Seams** - Mock at interface boundaries

### Anti-Patterns to Avoid

- **Over-abstraction** - Don't abstract prematurely
- **Leaky abstractions** - Implementation details bleeding through
- **Premature protocol creation** - Start with functions, graduate to protocols
- **Ignoring data-driven alternatives** - Maps are often better than protocols

---

## Key Papers and Talks

### Foundational Papers

| Paper | Authors | Year | Significance |
|-------|---------|------|--------------|
| [How to Make Ad-Hoc Polymorphism Less Ad Hoc](https://dl.acm.org/doi/pdf/10.1145/75277.75283) | Wadler & Blott | 1989 | Introduced type classes |
| [Data Types à la Carte](https://www.cambridge.org/core/journals/journal-of-functional-programming/article/data-types-a-la-carte/14416CB20C4637164EA9F77097909409) | Swierstra | 2008 | Composable data types |
| [Freer Monads, More Extensible Effects](https://okmij.org/ftp/Haskell/extensible/more.pdf) | Kiselyov & Ishii | 2015 | Efficient effect systems |

### Conference Talks

- **"The Evolution of Effects"** - Haskell Symposium 2023 Keynote
- **"Components Just Enough Structure"** - Stuart Sierra, Clojure/West 2014
- **Jose Valim's ElixirConf Keynotes** - Annual Elixir design updates

---

## Summary Comparison

| Language | Primary Mechanism | Dispatch | Key Strength |
|----------|-------------------|----------|--------------|
| **Haskell** | Type classes | Compile-time | Type safety + laws |
| **OCaml** | Module signatures | Compile-time | Powerful functors |
| **Scala** | Implicits/type classes | Compile-time | JVM integration |
| **Elixir** | Behaviours/Protocols | Runtime | OTP patterns |
| **F#** | Object expressions | Runtime | .NET integration |
| **Clojure** | Protocols/Multimethods | Runtime | Maximum flexibility |

### When to Use Each Approach

- **Type classes** - When you need compile-time safety and laws
- **Module systems** - When you need strong encapsulation
- **Effect systems** - When you need to mock/swap implementations
- **Protocols** - When you need open extension
- **Higher-order functions** - When you need maximum simplicity

---

## Next Steps

For Clojure-specific patterns and practices, see:
- [DECOUPLING_INTERFACES_CLOJURE.md](./DECOUPLING_INTERFACES_CLOJURE.md)

This companion document covers:
- Protocols and Multimethods in depth
- Clojure Spec and Malli
- Component, Integrant, and Mount
- Testing and mocking patterns
