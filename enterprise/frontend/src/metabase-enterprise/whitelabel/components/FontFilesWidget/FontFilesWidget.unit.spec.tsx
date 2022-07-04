import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FontFile } from "metabase-types/api";
import FontFilesWidget from "./FontFilesWidget";

describe("FontFilesWidget", () => {
  it("should add a font file", () => {
    const files = getFontFiles();
    const setting = { value: [] };
    const onChange = jest.fn();

    render(<FontFilesWidget setting={setting} onChange={onChange} />);

    const input = screen.getByLabelText("Regular");
    userEvent.type(input, files[0].src);
    userEvent.tab();

    expect(onChange).toHaveBeenCalledWith([files[0]]);
  });

  it("should remove a font file", () => {
    const files = getFontFiles();
    const setting = { value: files };
    const onChange = jest.fn();

    render(<FontFilesWidget setting={setting} onChange={onChange} />);

    const input = screen.getByLabelText("Regular");
    userEvent.clear(input);
    userEvent.tab();

    expect(onChange).toHaveBeenCalledWith([files[1]]);
  });
});

const getFontFiles = (): FontFile[] => [
  {
    src: "https://metabase.test/regular.ttf",
    fontWeight: 400,
    fontFormat: "truetype",
  },
  {
    src: "https://metabase.test/bold.woff2",
    fontWeight: 700,
    fontFormat: "woff2",
  },
];
