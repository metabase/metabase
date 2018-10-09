// This must be before all other imports
import { eventListeners } from "./mocks";

import Button from "metabase/components/Button";

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
