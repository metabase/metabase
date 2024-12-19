import { render, screen, within } from "@testing-library/react";
import userEvent, {
  PointerEventsCheckLevel,
} from "@testing-library/user-event";
import { useState } from "react";

import { MultipleEmailsInput } from "./MultipleEmailsInput";

describe("MultipleEmailsInput", () => {
  it("should allow to add new emails", async () => {
    const { element, onChangeMock } = setup();

    await userEvent.click(element, {
      pointerEventsCheck: PointerEventsCheckLevel.Never,
    });
    await userEvent.type(element, "newemail@example.com{ArrowDown}{Enter}", {
      pointerEventsCheck: PointerEventsCheckLevel.Never,
    });

    expect(onChangeMock).toHaveBeenCalledTimes(1);
    expect(onChangeMock).toHaveBeenLastCalledWith(["newemail@example.com"]);
  });

  it("should allow to remove emails", async () => {
    const inputValues = [
      "vito@metabase.com",
      "john@gmail.com",
      "paul@gmail.com",
      "george@gmail.com",
      "ringo@gmail.com",
    ];
    const { onChangeMock } = setup({
      initialValue: inputValues,
    });

    // eslint-disable-next-line testing-library/no-node-access
    const emailPill = screen.getByText("vito@metabase.com")?.parentElement;
    expect(emailPill).toBeInTheDocument();

    const emailDeleteButton = within(emailPill!).getByRole("button", {
      hidden: true,
    });
    await userEvent.click(emailDeleteButton!, {
      pointerEventsCheck: PointerEventsCheckLevel.Never,
    });

    expect(onChangeMock).toHaveBeenCalledTimes(1);
    expect(onChangeMock).toHaveBeenLastCalledWith(inputValues.slice(1));
  });

  it("should validate input value to be an email", async () => {
    const { element, onChangeMock } = setup();

    await userEvent.click(element, {
      pointerEventsCheck: PointerEventsCheckLevel.Never,
    });
    await userEvent.type(element, "notanemail{ArrowDown}{Enter}", {
      pointerEventsCheck: PointerEventsCheckLevel.Never,
    });

    expect(screen.queryByTestId("select-dropdown")).not.toBeInTheDocument();
    expect(onChangeMock).toHaveBeenCalledTimes(0);

    await userEvent.click(element, {
      pointerEventsCheck: PointerEventsCheckLevel.Never,
    });
    await userEvent.type(element, "@test", {
      pointerEventsCheck: PointerEventsCheckLevel.Never,
    });

    expect(screen.queryByTestId("select-dropdown")).not.toBeInTheDocument();
    expect(onChangeMock).toHaveBeenCalledTimes(0);

    await userEvent.click(element, {
      pointerEventsCheck: PointerEventsCheckLevel.Never,
    });
    await userEvent.type(element, ".com{ArrowDown}{Enter}", {
      pointerEventsCheck: PointerEventsCheckLevel.Never,
    });

    expect(onChangeMock).toHaveBeenCalledTimes(1);
    expect(onChangeMock).toHaveBeenLastCalledWith(["notanemail@test.com"]);
  });

  it("should does not allow to enter more than 50 values", async () => {
    const initialValue = Array.from({ length: 49 }).map(
      (_, index) => `test-${index}@email.com`,
    );
    const { element, onChangeMock } = setup({ initialValue });

    await userEvent.click(element, {
      pointerEventsCheck: PointerEventsCheckLevel.Never,
    });
    await userEvent.type(element, "newemail@example.com{ArrowDown}{Enter}", {
      pointerEventsCheck: PointerEventsCheckLevel.Never,
    });

    expect(onChangeMock).toHaveBeenCalledTimes(1);
    expect(onChangeMock).toHaveBeenLastCalledWith([
      ...initialValue,
      "newemail@example.com",
    ]);

    await userEvent.click(element, {
      pointerEventsCheck: PointerEventsCheckLevel.Never,
    });
    await userEvent.type(element, "newemail-2@example.com{ArrowDown}{Enter}", {
      pointerEventsCheck: PointerEventsCheckLevel.Never,
    });

    expect(onChangeMock).toHaveBeenCalledTimes(1);
  });
});

function setup({ initialValue = [] }: { initialValue?: string[] } = {}) {
  const onChangeMock = jest.fn();

  const TestComponent = () => {
    const [value, setValue] = useState<string[]>(initialValue);

    const handleChange = (newValue: string[]) => {
      onChangeMock(newValue);
      setValue(newValue);
    };

    return <MultipleEmailsInput value={value} onChange={handleChange} />;
  };

  render(<TestComponent />);

  const element = screen.getByTestId("email-selector");

  return {
    onChangeMock,
    element,
  };
}
