// This must be before all other imports
import { eventListeners } from "./mocks";

import { ReactWrapper } from "enzyme";
import proxymise from "proxymise";

import { delay } from "metabase/lib/promise";
import Button from "metabase/components/Button";

// convienence
export { mount } from "enzyme";
export { delay } from "metabase/lib/promise";

// Triggers events that are being listened to with `window.addEventListener` or `document.addEventListener`
export const dispatchBrowserEvent = (eventName, ...args) => {
  if (eventListeners[eventName]) {
    eventListeners[eventName].forEach(listener => listener(...args));
  } else {
    throw new Error(
      `No event listeners are currently attached to event '${eventName}'. List of event listeners:\n` +
        Object.entries(eventListeners)
          .map(([name, funcs]) => `${name} (${funcs.length} listeners)`)
          .join("\n"),
    );
  }
};

export const click = enzymeWrapper => {
  if (enzymeWrapper.length === 0) {
    throw new Error("The wrapper you provided for `click(wrapper)` is empty.");
  }
  const nodeType = enzymeWrapper.type();
  if (nodeType === Button || nodeType === "button") {
    console.trace(
      "You are calling `click` for a button; you would probably want to use `clickButton` instead as " +
        "it takes all button click scenarios into account.",
    );
  }
  // Normal click event. Works for both `onClick` React event handlers and react-router <Link> objects.
  // We simulate a left button click with `{ button: 0 }` because react-router requires that.
  enzymeWrapper.simulate("click", { button: 0 });

  // add a slight delay for robustness
  return delay(10);
};

export const clickButton = enzymeWrapper => {
  if (enzymeWrapper.length === 0) {
    throw new Error(
      "The wrapper you provided for `clickButton(wrapper)` is empty.",
    );
  }
  // `clickButton` is separate from `click` because `wrapper.closest(..)` sometimes results in error
  // if the parent element isn't found, https://github.com/airbnb/enzyme/issues/410

  // Submit event must be called on the button component itself (not its child components), otherwise it won't work
  const closestButton = enzymeWrapper.closest("button");

  if (closestButton.length === 1) {
    closestButton.simulate("submit"); // for forms with onSubmit
    closestButton.simulate("click", { button: 0 }); // for lone buttons / forms without onSubmit
  } else {
    // Assume that the current component wraps a button element
    enzymeWrapper.simulate("submit");

    // For some reason the click sometimes fails when using a Button component
    try {
      enzymeWrapper.simulate("click", { button: 0 });
    } catch (e) {}
  }

  // add a slight delay for robustness
  return delay(10);
};

export const setInputValue = (inputWrapper, value, { blur = true } = {}) => {
  if (inputWrapper.length === 0) {
    throw new Error(
      "The wrapper you provided for `setInputValue(...)` is empty.",
    );
  }

  inputWrapper.simulate("change", { target: { value: value } });
  if (blur) {
    inputWrapper.simulate("blur");
  }
};

export const chooseSelectOption = optionWrapper => {
  if (optionWrapper.length === 0) {
    throw new Error(
      "The wrapper you provided for `chooseSelectOption(...)` is empty.",
    );
  }

  const optionValue = optionWrapper.prop("value");
  const parentSelect = optionWrapper.closest("select");
  parentSelect.simulate("change", { target: { value: optionValue } });
};

const TIMEOUT = 15000;

async function eventually(fn, timeout = TIMEOUT) {
  const start = Date.now();
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      return fn();
    } catch (e) {
      if (Date.now() - start > timeout) {
        throw e;
      } else {
        await delay(100);
      }
    }
  }
}

export async function getFormValues(wrapper) {
  const values = {};
  const inputs = await wrapper.async.find("input");
  for (const input of inputs) {
    values[input.props.name] = input.props.value;
  }
  return values;
}

async function fillFormValues(wrapper, values) {
  const inputs = await wrapper.async.find("input");
  for (const input of inputs) {
    const name = input.props.name;
    if (name in values) {
      input.props.onChange(values[name]);
    }
  }
}

function submitForm(wrapper) {
  wrapper
    .find("form")
    .first()
    .props()
    .onSubmit();
}

export async function fillAndSubmitForm(wrapper, values) {
  await fillFormValues(wrapper, values);
  submitForm(wrapper);
}

export function findButtonByText(wrapper, text) {
  return wrapper
    .find("button")
    .findWhere(n => n.type() === "button" && n.text() === text);
}

function findByText(wrapper, text) {
  return wrapper.find(`[children=${JSON.stringify(text)}]`);
}
function findByIcon(wrapper, icon) {
  return wrapper.find(`.Icon-${icon}`);
}

// adds helper  methods to enzyme ReactWrapper
addReactWrapperMethod("click", click);
addReactWrapperMethod("clickButton", clickButton);
addReactWrapperMethod("findByText", findByText);
addReactWrapperMethod("findByIcon", findByIcon);
addReactWrapperMethod("setInputValue", setInputValue);

// creates the magic "async" namespace for `find` methods
Object.defineProperty(ReactWrapper.prototype, "async", {
  get() {
    if (!this.__async) {
      this.__async = {
        find: asyncFind(this, "find"),
        findWhere: asyncFind(this, "findWhere"),
        findByText: asyncFind(this, "findByText"),
        findByIcon: asyncFind(this, "findByIcon"),
      };
    }
    return this.__async;
  },
});

function addReactWrapperMethod(name, method) {
  ReactWrapper.prototype[name] = function(...args) {
    return method(this, ...args);
  };
}

function asyncFind(wrapper, name) {
  return (...args) =>
    // proxymise allows chaining like app.async.find(...).click()
    proxymise(
      eventually(() => {
        const node = wrapper[name](...args);
        if (node.exists()) {
          if (node.length > 1) {
            console.warn(
              `Found ${node.length} nodes: ${name}(${args.join(", ")})`,
            );
          }
          return node;
        } else {
          throw new Error(
            `Not found within timeout: ${name}(${args.join(", ")})`,
          );
        }
      }),
    );
}
