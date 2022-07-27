import { UiParameter } from "metabase/parameters/types";
import { fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const user = userEvent.setup();

export const createMockUiParameter = (
  opts?: Partial<UiParameter>,
): UiParameter => ({
  id: "parameter-id",
  slug: "slug",
  name: "Name",
  type: "string/=",
  ...opts,
});

export const backspace = (element: HTMLInputElement) => {
  let actuallyTyped = element.value;

  const backspaceKey = {
    key: "Backspace",
    code: 8,
    inputType: "deleteContentBackward",
  };

  const sharedEventConfig = {
    key: backspaceKey.key,
    charCode: backspaceKey.code,
    keyCode: backspaceKey.code,
    which: backspaceKey.code,
  };
  const downEvent = fireEvent.keyDown(element, sharedEventConfig);

  if (downEvent) {
    actuallyTyped = actuallyTyped.slice(0, -1);

    fireEvent.input(element, {
      target: { value: actuallyTyped },
      inputType: backspaceKey.inputType,
      bubbles: true,
      cancelable: true,
    });
  }

  fireEvent.keyUp(element, sharedEventConfig);
};

export const setInputValue = async (
  input: HTMLInputElement,
  content?: string,
) => {
  input.focus();

  if (content) {
    await user.keyboard(content);
  }

  fireEvent.keyDown(input, {
    key: 13,
    charCode: 13,
    keyCode: 13,
    which: 13,
  });
};
