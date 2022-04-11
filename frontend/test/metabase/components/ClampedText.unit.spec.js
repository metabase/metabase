import React from "react";

import { render, screen } from "@testing-library/react";

import ClampedText from "metabase/components/ClampedText";

const isTextEl = el => el.classList.contains("clamped-text--text");
const SEE_MORE = "See more";
const SEE_LESS = "See less";
const LESS_HEIGHT = 50;
const MORE_HEIGHT = 100;
const TEXT = "1\n2\n3";

describe("ClampedText", () => {
  const getBoundingClientRectMock = jest.fn();

  beforeEach(() => {
    Element.prototype.getBoundingClientRect = getBoundingClientRectMock;
  });

  describe("and the text is greater than the height of the container", () => {
    beforeEach(() => {
      getBoundingClientRectMock.mockImplementation(function() {
        return {
          height: isTextEl(this) ? MORE_HEIGHT : LESS_HEIGHT,
        };
      });

      render(<ClampedText visibleLines={1} text={TEXT} />);
    });

    it("should show a toggle for showing expanded or clamped text", async () => {
      screen.getByText(SEE_MORE).click();
      screen.getByText(SEE_LESS).click();
      screen.getByText(SEE_MORE);
    });
  });

  describe("and the text is less than the height of the container", () => {
    beforeEach(() => {
      getBoundingClientRectMock.mockImplementation(function() {
        return {
          height: isTextEl(this) ? LESS_HEIGHT : MORE_HEIGHT,
        };
      });

      render(<ClampedText visibleLines={1} text={TEXT} />);
    });

    it("should not show a toggle", () => {
      expect(() => {
        screen.getByText(SEE_MORE);
      }).toThrow();

      expect(() => {
        screen.getByText(SEE_LESS);
      }).toThrow();
    });
  });
});
