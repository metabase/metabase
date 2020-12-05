import React from "react";
import "@testing-library/jest-dom/extend-expect";
import { render, screen } from "@testing-library/react";

import { ICON_PATHS, loadIcon, parseViewBox } from "metabase/icon_paths";
import Icon from "metabase/components/Icon";

// find the first icon with a non standard viewBox
const NON_STANDARD_VIEWBOX_ICON = Object.keys(ICON_PATHS).find(key => {
  return ICON_PATHS[key].attrs && ICON_PATHS[key].attrs.viewBox;
});

describe("Icon", () => {
  describe("parseViewBox", () => {
    it("should return the proper values from a viewBox", () => {
      const value = 32;
      const viewBox = `0 0 ${value} ${value}`;

      expect(parseViewBox(viewBox)).toEqual([value, value]);
    });
  });

  describe("loadIcon", () => {
    it("should properly set a width and height based on the viewbox", () => {
      const def = loadIcon(NON_STANDARD_VIEWBOX_ICON);
      const { width, height, viewBox } = def.attrs;
      const [parsedWidth, parsedHeight] = parseViewBox(viewBox);

      expect(width).toEqual(parsedWidth / 2);
      expect(height).toEqual(parsedHeight / 2);
    });
  });

  describe("component", () => {
    it("should render correct icon for the valid `name`", () => {
      // used "google" to cover the use of `dangerouslySetInnerHTML`
      render(<Icon name="google" />);
      const icon = screen.getByRole("img", { name: /google icon/i });

      expect(icon).toHaveClass("Icon-google");
    });

    it("should render `unknown` icon given non-existing `name`", () => {
      render(<Icon name="404-icon-not-found" />);
      const icon = screen.getByRole("img", { name: /unknown icon/i });

      expect(icon).toHaveClass("Icon-unknown");
    });

    it("should render `unknown` icon when `name` is not provided", () => {
      render(<Icon />);
      const icon = screen.getByRole("img", { name: /unknown icon/i });

      expect(icon).toHaveClass("Icon-unknown");
    });

    it("should render an image if `img` attribute is present in `ICON_PATHS`", () => {
      render(<Icon name="slack_colorized" />);
      expect(screen.getByRole("img")).toHaveAttribute("src");
    });
  });
});
