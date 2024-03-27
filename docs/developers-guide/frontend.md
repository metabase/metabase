---
title: Frontend
---

# Frontend

## Entity Loaders

If you're developing a new feature or just generally need to get at some of the application data on the frontend, Entity Loaders are going to be your friend. They abstract away calling the API, handling loading and error state, cache previously loaded objects, invalidating the cache (in some cases) and let you easily perform updates, or create new items.

### Good uses for Entity Loaders

- I need to get a specific X (user, database, etc) and display it.
- I need to get a list of X (databases, questions, etc) and display it.

### Currently available entities:

- Questions, Dashboards, Pulses
- Collections
- Databases, Tables, Fields, Segments, Metrics
- Users, Groups
- Full current list of entities here: https://github.com/metabase/metabase/tree/master/frontend/src/metabase/entities

There are two ways to use loaders, either as React "render prop" components or as React component class decorators ("higher order components").

### Object loading

In this example we're going to load information about a specific database for a new page.

```js
import React from "react";
import Databases from "metabase/entities/databases";

@Databases.load({ id: 4 })
class MyNewPage extends React.Component {
  render() {
    const { database } = this.props;
    return (
      <div>
        <h1>{database.name}</h1>
      </div>
    );
  }
}
```

This example uses a class decorator to ask for and then display a database with ID 4. If you instead wanted to use a render prop component your code would look like this.

```js
import React from "react";
import Databases from "metabase/entities/databases";

class MyNewPage extends React.Component {
  render() {
    const { database } = this.props;
    return (
      <div>
        <Databases.Loader id={4}>
          {({ database }) => <h1>{database.name}</h1>}
        </Databases.Loader>
      </div>
    );
  }
}
```

Now you most likely don't just want to display just one static item so for cases where some of the values you might need will be dynamic you can use a function to get at the props and return the value you need. If you're using the component approach you can just pass props as you would normally for dynamic values.

```js
@Databases.load({
  id: (state, props) => props.params.databaseId
}))
```

## List loading

Loading a list of items is as easy as applying the `loadList` decorator:

```js
import React from "react";
import Users from "metabase/entities/users";

@Users.loadList()
class MyList extends React.Component {
  render() {
    const { users } = this.props;
    return <div>{users.map(u => u.first_name)}</div>;
  }
}
```

Similar to the object loader's `id` argument you can also pass a `query` object (if the API supports it):

```js
@Users.loadList({
  query: (state, props) => ({ archived: props.showArchivedOnly })
})
```

### Control over loading and error states

By default both `EntityObject` and `EntityList` loaders will handle loading state for you by using `LoadingAndErrorWrapper` under the hood. If for some reason you want to handle loading on your own you can disable this behavior by setting `loadingAndErrorWrapper: false`.

### Wrapped objects

If you pass `wrapped: true` to a loader then the object or objects will be wrapped with helper classes that let you do things like `user.getName()`, `user.delete()`, or `user.update({ name: "new name" )`. Actions are automatically already bound to `dispatch`.

This may incur a performance penalty if there are many objects.

Any additional selectors and actions defined in the entities' `objectSelectors` or `objectActions` will appear as the wrapped object's methods.

### Advanced usage

You can also use the Redux actions and selectors directly, for example, `dispatch(Users.actions.loadList())` and `Users.selectors.getList(state)`.

## Style Guide

### Set up Prettier

We use [Prettier](https://prettier.io/) to format our JavaScript code, and it is enforced by CI. We recommend setting your editor to "format on save". You can also format code using `yarn prettier`, and verify it has been formatted correctly using `yarn lint-prettier`.

We use ESLint to enforce additional rules. It is integrated into the Webpack build, or you can manually run `yarn lint-eslint` to check.

### React and JSX Style Guide

For the most part we follow the [Airbnb React/JSX Style Guide](https://github.com/airbnb/javascript/tree/master/react). ESLint and Prettier should take care of a majority of the rules in the Airbnb style guide. Exceptions will be noted in this document.

- Prefer React [function components over class components](https://reactjs.org/docs/components-and-props.html#function-and-class-components)
- Avoid creating new components within the `containers` folder, as this approach has been deprecated. Instead, store both connected and view components in the `components` folder for a more unified and efficient organization. If a connected component grows substantially in size and you need to extract a view component, opt for using the `View` suffix.
- For control components, typically we use `value` and `onChange`. Controls that have options (e.x. `Radio`, `Select`) usually take an `options` array of objects with `name` and `value` properties.
- Components named like `FooModal` and `FooPopover` typically refer to the modal/popover _content_ which should be used inside a `Modal`/`ModalWithTrigger` or `Popover`/`PopoverWithTrigger`
- Components named like `FooWidget` typically include a `FooPopover` inside a `PopoverWithTrigger` with some sort of trigger element, often `FooName`

- Use arrow function instance properties if you need to bind a method in a class (instead of `this.method = this.method.bind(this);` in the constructor), but only if the function needs to be bound (e.x. if you're passing it as a prop to a React component)

```javascript
class MyComponent extends React.Component {
  constructor(props) {
    super(props);
    // NO:
    this.handleChange = this.handleChange.bind(this);
  }
  // YES:
  handleChange = e => {
    // ...
  };
  // no need to bind:
  componentDidMount() {}
  render() {
    return <input onChange={this.handleChange} />;
  }
}
```

- For styling components we currently use a mix of `styled-components` and ["atomic" / "utility-first" CSS classes](https://github.com/metabase/metabase/tree/master/frontend/src/metabase/css/core).
- Prefer using `grid-styled`'s `Box` and `Flex` components over raw `div`.
- Components should typically pass along their `className` prop to the root element of the component. It can be merged with additional classes using the `cx` function from the `classnames` package.
- In order to make components more reusable, a component should only apply classes or styles to the root element of the component which affects the layout/styling of it's own content, but _not_ the layout of itself within it's parent container. For example, it can include padding or the `flex` class, but it shouldn't include margin or `flex-full`, `full`, `absolute`, `spread`, etc. Those should be passed via `className` or `style` props by the consumer of the component, which knows how the component should be positioned within itself.
- Avoid breaking JSX up into separate method calls within a single component. Prefer inlining JSX so that you can better see what the relation is of the JSX a `render` method returns to what is in the `state` or `props` of a component. By inlining JSX you'll also get a better sense of what parts should and should not be separate components.

```javascript

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

### JavaScript Conventions

- `import`s should be ordered by type, typically:
  1. external libraries (`react` is often first, along with things like `ttags`, `underscore`, `classnames`, etc)
  2. Metabase's top-level React components and containers (`metabase/components/*`, `metabase/containers/*`, etc)
  3. Metabase's React components and containers specific to this part of the application (`metabase/*/components/*` etc)
  4. Metabase's `lib`s, `entities`, `services`, Redux files, etc
- Prefer `const` to `let` (and never use `var`). Only use `let` if you have a specific reason to reassign the identifier (note: this now enforced by ESLint)
- Prefer [arrow functions](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Functions/Arrow_functions) for inline functions, especially if you need to reference `this` from the parent scope (there should almost never be a need to do `const self = this;` etc), but usually even if you don't (e.x. `array.map(x => x * 2)`).
- Prefer `function` declarations for top-level functions, including React function components. The exception is for one-liner functions that return a value

```javascript
// YES:
function MyComponent(props) {
  return <div>...</div>;
}
// NO:
const MyComponent = props => {
  return <div>...</div>;
};
// YES:
const double = n => n * 2;
// ALSO OK:
function double(n) {
  return n * 2;
}
```

- Prefer native `Array` methods over `underscore`'s. We polyfill all ES6 features. Use Underscore for things that aren't implemented natively.
- Prefer [`async`/`await`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/async_function) over using `promise.then(...)` etc directly.
- You may use assignment destructuring or argument destructuring, but avoid deeply nested destructuring, since they can be hard to read and `prettier` sometimes formats them with extra whitespace.
  - avoid destructuring properties from "entity"-like objects, e.x. don't do `const { display_name } = column;`
  - don't destructure `this` directly, e.x. `const { foo } = this.props; const { bar } = this.state;` instead of `const { props: { foo }, state: { bar } } = this;`
- Avoid nested ternaries as they often result in code that is difficult to read. If you have logical branches in your code that are dependent on the value of a string, prefer using an object as a map to multiple values (when evaluation is trivial) or a `switch` statement (when evaluation is more complex, like when branching on which React component to return):

```javascript
// don't do this
const foo = str == 'a' ? 123 : str === 'b' ? 456 : str === 'c' : 789 : 0;

// do this
const foo = {
  a: 123,
  b: 456,
  c: 789,
}[str] || 0;

// or do this
switch (str) {
  case 'a':
    return <ComponentA />;
  case 'b':
    return <ComponentB />;
  case 'c':
    return <ComponentC />;
  case 'd':
  default:
    return <ComponentD />;
}
```

If your nested ternaries are in the form of predicates evaluating to booleans, prefer an `if/if-else/else` statement that is siloed to a separate, pure function:

```javascript
const foo = getFoo(a, b);

function getFoo(a, b, c) {
  if (a.includes("foo")) {
    return 123;
  } else if (a === b) {
    return 456;
  } else {
    return 0;
  }
}
```

- Be conservative with what comments you add to the codebase. Comments shouldn't be used as reminders or as todos--record those by creating a new issue in Github. Ideally, code should be written in such a way that it explains itself clearly. When it does not, you should first try rewriting the code. If for whatever reason you are unable to write something clearly, add a comment to explain the "why".

```javascript

// don't do this--the comment is redundant

// get the native permissions for this db
const nativePermissions = getNativePermissions(perms, groupId, {
  databaseId: database.id,
});

// don't add TODOs -- they quickly become forgotten cruft

isSearchable(): boolean {
  // TODO: this should return the thing instead
  return this.isString();
}

// this is acceptable -- the implementer explains a not-obvious edge case of a third party library

// foo-lib seems to return undefined/NaN occasionally, which breaks things
if (isNaN(x) || isNaN(y)) {
  return;
}

```

- Avoid complex logical expressions inside of if statements

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

- Prefer named exports over default exports

```javascript
// this makes it harder to search for Widget
import Foo from "./Widget";
// do this to enforce using the proper name
import { Widget } from "./Widget";
```

- Avoid magic strings and numbers

```javascript
// don't do this
const options = _.times(10, () => ...);

// do this in a constants file
export const MAX_NUM_OPTIONS = 10;
const options = _.times(MAX_NUM_OPTIONS,  () => ...);
```

### Write Declarative Code

You should write code with other engineers in mind as other engineers will spend more time reading than you spend writing (and re-writing). Code is more readable when it tells the computer "what to do" versus "how to do." Avoid imperative patterns like for loops:

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
const foo = list.filter(entry => entry.bar !== false);
```

When dealing with business logic you don't want to be concerned with the specifics of the language. Instead of writing `const query = new Question(card).query();` which entails instantiating a new `Question` instance and calling a `query` method on said instance, you should introduce a function like `getQueryFromCard(card)` so that implementers can avoid thinking about what goes into getting a `query` value from a card.

## Component Styling Tree Rings

### classic / global CSS with BEM style selectors (deprecated)

```css
.Button.Button--primary {
  color: -var(--color-brand);
}
```

### atomic / utility CSS (discouraged)

```css
.text-brand {
  color: -var(--color-brand);
}
```

```javascript
const Foo = () => <div className="text-brand" />;
```

### inline style (discouraged)

```javascript
const Foo = ({ color ) =>
  <div style={%raw%}{{ color: color }}{%endraw%} />
```

### CSS modules (deprecated)

```css
:local(.primary) {
  color: -var(--color-brand);
}
```

```javascript
import style from "./Foo.css";

const Foo = () => <div className={style.primary} />;
```

### [Emotion](https://emotion.sh/)

```javascript
import styled from "@emotion/styled";

const Foo = styled.div`
  color: ${props => props.color};
`;

const Bar = ({ color }) => <Foo color={color} />;
```

## Popover

Popovers are popups or modals.

In Metabase core, they are visually responsive: they appear above or below the element that triggers their appearance. Their height is automatically calculated to make them fit on the screen.

### Where to Find Popovers in the User Journey

#### When creating custom questions

1. From home, click on `New` and then `Question`
2. 👀 The option picker that automatically opened next to `Pick your starting data` is a `<Popover />`.
3. Choose `Sample Database` if not already selected
4. Choose any of the tables, for example `People`

Here, clicking on the following will open `<Popover />` components:

- `Pick columns` (arrow on the right-hand side of a `FieldsPicker` control in the section labeled `Data`)
- Gray icon of a grid with + below section labeled `Data`
- `Add filters to narrow your answers`
- `Pick the metric you want to see`
- `Pick a column to group by`
- `Sort` icon with arrows pointing up and down above `Visualize` button

## Unit testing

### Setup pattern

We use the following pattern to unit test components:

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
