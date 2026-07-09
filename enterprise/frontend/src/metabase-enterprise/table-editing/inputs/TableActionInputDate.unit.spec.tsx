import userEvent from "@testing-library/user-event";

import { renderWithProviders, screen } from "__support__/ui";

import { TableActionInputDate } from "./TableActionInputDate";
import type { TableActionInputSharedProps } from "./types";

const setup = (props: Partial<TableActionInputSharedProps> = {}) => {
  const onChange = jest.fn();
  const onBlur = jest.fn();
  const onEnter = jest.fn();

  renderWithProviders(
    <TableActionInputDate
      onChange={onChange}
      onBlur={onBlur}
      onEnter={onEnter}
      {...props}
    />,
  );

  return { onChange, onBlur, onEnter };
};

describe("TableActionInputDate", () => {
  it("should fire onChange with the restored date when the value changes (metabase#70647)", async () => {
    const { onChange, onEnter } = setup();

    const input = screen.getByRole("textbox");
    await userEvent.clear(input);
    await userEvent.type(input, "February 15, 2020");
    // commit the value by blurring the input
    await userEvent.tab();

    // The fix routes committed date changes through onChange (formatted as
    // YYYY-MM-DD, timezone Never). The regression fired onEnter instead, so
    // onChange never received the value.
    expect(onChange).toHaveBeenLastCalledWith("2020-02-15");
    expect(onEnter).not.toHaveBeenCalled();
  });
});
