import { render, screen, within } from "@testing-library/react";
import userEvent, {
  PointerEventsCheckLevel,
} from "@testing-library/user-event";
import { useState } from "react";

import { AlertsEmailRecipientsSelector } from "./AlertsEmailRecipientsSelector";

describe("AlertsEmailRecipientsSelector", () => {
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
});

function setup({ initialValue = [] }: { initialValue?: string[] } = {}) {
  const onChangeMock = jest.fn();

  const TestComponent = () => {
    const [value, setValue] = useState<string[]>(initialValue);

    const handleChange = (newValue: string[]) => {
      onChangeMock(newValue);
      setValue(newValue);
    };

    return (
      <AlertsEmailRecipientsSelector value={value} onChange={handleChange} />
    );
  };

  render(<TestComponent />);

  const element = screen.getByTestId("email-selector");

  return {
    onChangeMock,
    element,
  };
}
