import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import MetabotToggleWidget from "./MetabotToggleWidget";
import { MetabotSetting } from "./types";

const TOGGLE_LABEL = "Display our little friend on the homepage";

describe("MetabotToggleWidget", () => {
  it("should disable Metabot", () => {
    const setting = getSetting();
    const onChange = jest.fn();

    render(<MetabotToggleWidget setting={setting} onChange={onChange} />);
    userEvent.click(screen.getByText(TOGGLE_LABEL));

    expect(onChange).toHaveBeenCalledWith(false);
  });

  it("should enable Metabot", () => {
    const setting = getSetting({ value: false });
    const onChange = jest.fn();

    render(<MetabotToggleWidget setting={setting} onChange={onChange} />);
    userEvent.click(screen.getByText(TOGGLE_LABEL));

    expect(onChange).toHaveBeenCalledWith(true);
  });
});

const getSetting = (opts?: Partial<MetabotSetting>): MetabotSetting => ({
  value: null,
  default: true,
  ...opts,
});
