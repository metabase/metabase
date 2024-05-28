import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { createMockFontFile } from "metabase-types/api/mocks";

import FontFilesWidget from "./FontFilesWidget";

describe("FontFilesWidget", () => {
  it("should add a font file with a query string in the URL", async () => {
    const file = createMockFontFile({
      src: "https://metabase.test/regular.ttf?raw=true",
      fontWeight: 400,
      fontFormat: "truetype",
    });
    const setting = { value: [] };
    const onChange = jest.fn();

    render(<FontFilesWidget setting={setting} onChange={onChange} />);

    const input = screen.getByLabelText("Regular");
    await userEvent.type(input, file.src);
    await userEvent.tab();

    expect(onChange).toHaveBeenCalledWith([file]);
  });

  it("should add a font file with an invalid URL", async () => {
    const file = createMockFontFile({
      src: "invalid",
      fontWeight: 400,
      fontFormat: "woff2",
    });
    const setting = { value: [] };
    const onChange = jest.fn();

    render(<FontFilesWidget setting={setting} onChange={onChange} />);

    const input = screen.getByLabelText("Regular");
    await userEvent.type(input, file.src);
    await userEvent.tab();

    expect(onChange).toHaveBeenCalledWith([file]);
  });

  it("should remove a font file", async () => {
    const files = [
      createMockFontFile({
        src: "https://metabase.test/regular.ttf?raw=true",
        fontWeight: 400,
        fontFormat: "truetype",
      }),
      createMockFontFile({
        src: "https://metabase.test/bold.woff2",
        fontWeight: 700,
        fontFormat: "woff2",
      }),
    ];
    const setting = { value: files };
    const onChange = jest.fn();

    render(<FontFilesWidget setting={setting} onChange={onChange} />);

    const input = screen.getByLabelText("Regular");
    await userEvent.clear(input);
    await userEvent.tab();

    expect(onChange).toHaveBeenCalledWith([files[1]]);
  });
});
