import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import MetabotToggleWidget from "./MetabotToggleWidget";

const TOGGLE_LABEL = "Display welcome message on the homepage";

interface SetupOpts {
  value?: boolean | null;
}

const setup = ({ value = null }: SetupOpts = {}) => {
  const setting = { value, default: true };
  const onChange = jest.fn();

  render(<MetabotToggleWidget setting={setting} onChange={onChange} />);

  return { onChange };
};

describe("MetabotToggleWidget", () => {
  it("should disable Metabot", () => {
    const { onChange } = setup();

    userEvent.click(screen.getByText(TOGGLE_LABEL));

    expect(onChange).toHaveBeenCalledWith(false);
  });

  it("should enable Metabot", () => {
    const { onChange } = setup({ value: false });

    userEvent.click(screen.getByText(TOGGLE_LABEL));

    expect(onChange).toHaveBeenCalledWith(true);
  });
});
