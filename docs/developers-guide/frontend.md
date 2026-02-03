---
title: Frontend
---

# Frontend

## Typescript

We are aggressively pressing toward having our entire frontend codebase in typescript. If you find yourself working on a javascript file, consider making a small initial PR to convert it to typescript before making further changes (and making it a functional component if you've happened upon a class component 😱).

Avoid typecasts, and avoid use of `any` at all costs.

Most of our widely-used types are located in [metabase-types](https://github.com/metabase/metabase/tree/master/frontend/src/metabase-types). Generally they break down as

- API Types: should reflect the data we receive from the backend API
- Store Types: should reflect the shape of data in the redux store

In cases where types are only used by some local components, they should be defined locally in a `types.ts` file. (see e.g. [DataGrid](https://github.com/metabase/metabase/blob/master/frontend/src/metabase/data-grid/types.ts) types)

## Redux

We use Redux for global state. You will find domain-specific actions, reducers, and selectors generally grouped with the components that use them. e.g:

- [query_builder](https://github.com/metabase/metabase/tree/master/frontend/src/metabase/query_builder)
- [dashboard](https://github.com/metabase/metabase/tree/master/frontend/src/metabase/dashboard)

Use Redux global state as little as possible, and wherever possible, prefer local component state, or narrowly-defined context.

## Data Fetching

We use [RTK Query](https://redux-toolkit.js.org/rtk-query/overview) for data fetching and caching. All API endpoints are defined in `metabase/api`. These should be properly typed, and should not depend on any other application code or contain business logic outside of invalidating tags within the API.

### Entity Loaders

Legacy code uses `metabase/entities` to load data. These entity loaders are deprecated, and wherever possible, use of RTK query apis should be preferred.

## UI Library

Our UI library in `metabase/ui` is built on top of [`Mantine`](https://mantine.dev/core/package/). You should almost always prefer using mantine components above anything else in the codebase. We have a lot of customization on top of mantine, but no business logic should leak into the `metabase/ui` folder. It should remain purely display-level. All components added to the UI library must have a storybook file to demonstrate usage.

## Styling

You'll note several styling patterns in the codebase. Currently you should prefer

1. [Mantine Style Props](https://mantine.dev/styles/style-props/) for most simple styling
2. [CSS Modules](https://github.com/css-modules/css-modules) for more complex styling

Other patterns, such as emotion styled components and global utility CSS classes are deprecated and should not be used for new code. Where convenient, please updated deprecated styling patterns to the updated ones.

Familiarize yourself with Mantine's Layout components. You can often save a lot of CSS with built-in components like [`Center`](https://mantine.dev/core/center/) and [`SimpleGrid`](https://mantine.dev/core/simple-grid/)

## Colors

Colors should only be used in the form of mantine color props (primarily `c` and `bg`), or in css modules using variables eg: `color: var(--mb-color-text-primary);`. Using these colors ensures consistent visual design and user experience across both dark and light modes. Literal color values such as `black` or `#FFF` are not allowed, as well as using `color-mix` in your CSS modules to adjust the color or transparency of a variable. The full list of keys can be found in `frontend/src/metabase/lib/colors/types/color-keys.ts`, with their light and dark values found in `frontend/src/metabase/lib/colors/constants/themes`. If you find yourself requiring a color that does not already exist but is present in designs, reach out to the design team for guidance.

## Unit testing

All code must be tested. Unit tests should always be preferred over end-to-end tests; they are much faster to run and debug, even if they take a little longer to write initially.

Unit tests should be placed with the components they are testing.

Setting up unit tests in metabase can be quite complex due to all the data mocking that must be done for even simple components. We have many helpers to make this faster, for app context providers, data mocking, and API mocking. (also note: LLMs are quite good at absorbing existing mocking patterns and helping set up mock data)

### Setup pattern

We use the following pattern to setup test components:

```tsx
import React from "react";
import userEvent from "@testing-library/user-event";
import { Collection } from "metabase-types/api";
import { createMockCollection } from "metabase-types/api/mocks";
import { renderWithProviders, screen } from "__support__/ui";
import CollectionHeader from "./CollectionHeader";

interface SetupOpts {
  collection: Collection;
}

const setup = ({ collection }: SetupOpts) => {
  const onUpdateCollection = jest.fn();

  renderWithProviders(
    <CollectionHeader
      collection={collection}
      onUpdateCollection={onUpdateCollection}
    />,
  );

  return { onUpdateCollection };
};

describe("CollectionHeader", () => {
  it("should be able to update the name of the collection", () => {
    const collection = createMockCollection({
      name: "Old name",
    });

    const { onUpdateCollection } = setup({
      collection,
    });

    await userEvent.clear(screen.getByDisplayValue("Old name"));
    await userEvent.type(screen.getByPlaceholderText("Add title"), "New title");
    await userEvent.tab();

    expect(onUpdateCollection).toHaveBeenCalledWith({
      ...collection,
      name: "New name",
    });
  });
});
```

Key points:

- `setup` function
- `renderWithProviders` adds providers used by the app, including `redux`

### Request mocking

We use [`fetch-mock`](https://www.npmjs.com/package/fetch-mock) to mock requests:

```tsx
import fetchMock from "fetch-mock";
import { setupCollectionsEndpoints } from "__support__/server-mocks";

interface SetupOpts {
  collections: Collection[];
}

const setup = ({ collections }: SetupOpts) => {
  setupCollectionsEndpoints({ collections });

  // renderWithProviders and other setup
};

describe("Component", () => {
  it("renders correctly", async () => {
    setup();
    expect(await screen.findByText("Collection")).toBeInTheDocument();
  });
});
```

Key points:

- `setup` function
- Call helpers from `__support__/server-mocks` to setup endpoints for your data

## Localization

The frontend uses [ttag](https://www.npmjs.com/package/ttag) to localize strings. All user-facing strings must be tagged, and automation will handle the rest. It is often helpful to add context for strings, especially when interpolating parameters

```ts
<div>{t`This is a user-facing string`}</div>

<div>
	{c("{0} is a number of engineers").t`${numEngineers} engineers at metabase`}
</div>
```

As much as possible, try to translate phrases, rather than words, to make localization across languages with different structures possible.

```ts
// ❌
const output = name + t` is going to the ` + place + t`with` + anotherName;

// ✅
const output = t`${name} is going to the ${place} with ${anotherName}`;

// 😍
const output = c("{0} and {2} are people's names, and {1} is a place")
  .t`${name} is going to the ${place} with ${anotherName}`;
```

## Style Guide

The first rule of frontend style, is we want to avoid talking about frontend style. Wherever possible, style-level considerations should be encapsulated in lint rules.

### Prettier + Eslint

We use [Prettier](https://prettier.io/) to format our JavaScript code, and it is enforced by CI. We recommend setting your editor to "format on save". You can also format code using `yarn prettier`, and verify it has been formatted correctly using `yarn lint-prettier`.

We use ESLint to enforce additional rules. It is integrated into the Webpack build, or you can manually run `yarn lint-eslint` to check. Nitpicky things like import order, spacing, etc. are all enforced by eslint.

### Miscellaneous notes on coding style

- Avoid creating separate `Container` and `Components` directories. In some cases it makes sense to separate components for data loading and viewing, but this is easy to do in a single file.
- Avoid nested ternaries as they often result in code that is difficult to read. If you have logical branches in your code that are dependent on the value of a string, prefer using an object as a map to multiple values (when evaluation is trivial) or a `switch` statement. Where logic is complex, we often use [ts-pattern](https://github.com/gvergnaud/ts-pattern) over a set of if/else statement.
- Be conservative with what comments you add to the codebase. Ideally, code should be written in such a way that it explains itself clearly. When it does not, you should first try rewriting the code. If for whatever reason you are unable to write something clearly, add a comment to explain the "why".
- Avoid breaking JSX up into separate method calls within a single component. Prefer inlining JSX so that you can better see what the relation is of the JSX a `render` method returns to what is in the `state` or `props` of a component. By inlining JSX you'll also get a better sense of what parts should and should not be separate components.

```ts
// don't do this
render () {
  return (
    <div>
      {this.renderThing1()}
      {this.renderThing2()}
      {this.state.thing3Needed && this.renderThing3()}
    </div>
  );
}

// do this
render () {
  return (
    <div>
      <button onClick={this.toggleThing3Needed}>toggle</button>
      <Thing2 randomProp={this.props.foo} />
      {this.state.thing3Needed && <Thing3 randomProp2={this.state.bar} />}
    </div>
  );
}
```

- Avoid complex logical expressions inside of if statements. Often extracting logic to a well-named boolean variable can make code much easier to read.

```javascript
// don't do this
if (typeof children === "string" && children.split(/\n/g).length > 1) {
  // ...
}

// do this
const isMultilineText =
  typeof children === "string" && children.split(/\n/g).length > 1;
if (isMultilineText) {
  // ...
}
```

- Use ALL_CAPS for constants

```javascript
// do this
const MIN_HEIGHT = 200;

// also acceptable
const OBJECT_CONFIG_CONSTANT = {
  camelCaseProps: "are OK",
  abc: 123,
};
```

- Avoid magic strings and numbers

```javascript
// don't do this
const options = _.times(10, () => ...);

// do this in a constants file
export const MAX_NUM_OPTIONS = 10;
const options = _.times(MAX_NUM_OPTIONS,  () => ...);
```

- prefer declarative over imperative patterns where possible. You should write code with other engineers in mind as other engineers will spend more time reading than you spend writing (and re-writing). Code is more readable when it tells the computer "what to do" versus "how to do." Avoid imperative patterns like for loops:

```javascript
// don't do this
let foo = [];
for (let i = 0; i < list.length; i++) {
  if (list[i].bar === false) {
    continue;
  }

  foo.push(list[i]);
}

// do this
const foo = list.filter((entry) => entry.bar !== false);
```
