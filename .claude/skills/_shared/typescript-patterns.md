# TypeScript Patterns

Concrete patterns the team expects in frontend PRs. Apply while writing, enforce while reviewing.

## Type tightening

- Do not add `as` casts, `any`, or loose `unknown` to make code compile. Fix the signature instead.
- If a function only needs one field of a wide object, accept that field — not the wide object. The cast often disappears once the signature is right.
- Reach for `Partial<T>`, `Pick<T, K>`, `Record<K, V>`, and generics before reaching for a cast.
- Prefer making props/components generic (`<T>`) when a value flows through unchanged and the caller knows the type.
- Type guards belong in `frontend/src/metabase-types/guards/`. Do not redefine them locally.

## Null and undefined

- Narrow at the source. If a value is optional only in a corner case, don't thread `undefined` through every layer — guard at the producer.
- If a value really is optional, use `?.` and `?? []` at the consumer. Don't compare `undefined` to a number.
- Arrays of `undefined` are almost always a signal that something upstream should have filtered or defaulted.

## Naming

- Names describe the thing, not the mechanism. `LensLocation` beats `ref` when the value isn't a React ref.
- Align sibling concepts: `HoverObject`/`ClickObject`, not `HoveredObject`/`ClickObject`.
- If you introduce a helper like "go back to base path," call it `goBack` and use it everywhere the inline `dispatch(push(BASE_PATH))` appears.

## Extract, move, reuse

- Duplicated logic across 2+ call sites → extract a custom hook or util.
- Generic helpers do not belong in feature folders. Promote to a shared module.
- Feature-specific code does not belong in `metabase-lib`. Put OSS-shared code in an OSS module.
- `CustomVizPlugin["id"]` or a named `CustomVizPluginId` beats restating a primitive type in every signature.

## Inline single-use code, delete dead code

- A component or helper with one call site should usually be inlined.
- A function that no longer computes multiple things is usually no longer worth being a function.
- Remove unused exports and their transitive dependencies rather than leaving them "just in case."

## Comments

- Default: write none. Well-named identifiers carry the `what`.
- Add a short comment only when the `why` is non-obvious: a workaround, a hidden invariant, a subtle ordering constraint, a clever reduction.
- No JSDoc type annotations in `.ts`/`.tsx` files — the types are the types.
- Do not reference tickets, authors, or "added for X flow" — that rots. The PR description is the place for history.

## Mantine and styling conventions

- Prefer Mantine style props (`p`, `m`, `w`, `h`, `c`, `bg`, `position`, `shadow`) over inline CSS or new `.styled.tsx` files.
- Use design tokens, not raw values. `var(--default-border-radius)` beats a hardcoded `4px`; a theme color key beats a hex literal.
- Do not reach into Mantine's internal CSS variables. If a token is missing, add it to the theme, not to a component.
- Normalize styling props across sibling components. If two components render the same kind of thing, their `position`, `shadow`, `w`, and `c` should match.
- Prefer the Metabase component when both exist. `AccordionList` has search and virtualization; Mantine's `Accordion` does not — use the former for heavy lists.
- A boolean flag like `isDashboard` that only tweaks padding is usually a styling prop in disguise. Pass the styling prop instead.

## Internationalization

- Wrap every user-facing string with `` t`...` `` (or `jt` for JSX interpolation). No bare English strings in JSX, error messages, or toast content.
- When you add a string, cover the missing-translation branch in tests if the code has one.
- Do not concatenate translated fragments — use interpolation in a single `` t`...` `` so translators see the whole sentence.

## Before you submit

- [ ] No new `as`, `any`, or `// @ts-expect-error` unless justified in a comment.
- [ ] No `undefined` threaded through more than one layer without a reason.
- [ ] Names describe the thing; siblings align.
- [ ] Any helper or component used exactly once is inlined.
- [ ] Any helper or component used in 2+ places lives in a shared location.
- [ ] Comments exist only where the `why` is non-obvious.
- [ ] Mantine style props used; no raw values where a token exists.
- [ ] Every user-facing string is wrapped in `` t`...` ``.
