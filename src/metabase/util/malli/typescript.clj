(ns metabase.util.malli.typescript
  (:require
   [metabase.util.malli.typescript.build :as build]
   [metabase.util.malli.typescript.declaration :as declaration]))

(defn schema->ts
  "Convert a Malli schema to a TypeScript type definition."
  [schema]
  (declaration/schema->ts schema))

(defn generate-typescript-interface
  "Generate a TypeScript interface definition from a Malli schema."
  [interface-name schema]
  (declaration/generate-typescript-interface interface-name schema))

(defn generate-typescript-type
  "Generate a TypeScript type alias from a Malli schema."
  [type-name schema]
  (declaration/generate-typescript-type type-name schema))

(defn fn->ts
  "Convert exported CLJS function metadata into TypeScript declarations."
  [defmeta]
  (declaration/fn->ts defmeta))

(defn const->ts
  "Convert exported CLJS constant metadata into a TypeScript declaration."
  [defmeta]
  (declaration/const->ts defmeta))

(defn def->ts
  "Convert exported CLJS analyzer metadata into a TypeScript declaration."
  [defmeta]
  (declaration/def->ts defmeta))

(defn produce-dts
  "Shadow-cljs build hook that writes generated TypeScript declaration files."
  {:shadow.build/stage :flush}
  [state]
  (build/produce-dts state))
