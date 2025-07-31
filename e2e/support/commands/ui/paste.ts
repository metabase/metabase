// This convoluted way of emulating paste is necessary due to how React and Cypress are not
//  using native events. We're triggering here React onChange events to let know React and Formik of
//  the new value.

Cypress.Commands.add(
  "paste",
  { prevSubject: "element" },
  (subject, text: string) => {
    cy.wrap(subject).then(($element) => {
      const element = $element[0] as HTMLInputElement | HTMLTextAreaElement;

      // Get React's internal props to trigger proper onChange
      const reactPropsKey = Object.keys(element).find(
        (key) =>
          key.startsWith("__reactProps") ||
          key.startsWith("__reactInternalInstance"),
      );

      if (reactPropsKey && reactPropsKey in element) {
        const reactProps = (element as { [key: string]: any })[reactPropsKey];
        const onChange =
          reactProps?.onChange || reactProps?.memoizedProps?.onChange;

        if (onChange) {
          // Create a synthetic event that mimics React's SyntheticEvent
          const syntheticEvent = {
            target: { value: text },
            currentTarget: element,
            preventDefault: () => {},
            stopPropagation: () => {},
            nativeEvent: new Event("input"),
          };

          // Set the value and call onChange
          element.value = text;
          onChange(syntheticEvent);
          return;
        }
      }

      // Fallback: try to trigger React's internal setValue
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        "value",
      )?.set;

      const nativeTextAreaValueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLTextAreaElement.prototype,
        "value",
      )?.set;

      const setter =
        element instanceof HTMLInputElement
          ? nativeInputValueSetter
          : nativeTextAreaValueSetter;

      if (setter) {
        setter.call(element, text);

        // Dispatch input event
        element.dispatchEvent(new Event("input", { bubbles: true }));
        element.dispatchEvent(new Event("change", { bubbles: true }));
      }
    });

    return cy.wrap(subject);
  },
);

declare global {
  namespace Cypress {
    interface Chainable {
      paste(text: string): Chainable<JQuery<HTMLElement>>;
    }
  }
}

export {};
