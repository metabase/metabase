import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import ClampedText from "metabase/components/ClampedText";

const isTextEl = el => el.classList.contains("clamped-text--text");

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
      getBoundingClientRectMock.mockImplementation(function () {
        return {
          height: isTextEl(this) ? MORE_HEIGHT : LESS_HEIGHT,
        };
      });
    });

    it("should show a toggle for showing expanded or clamped text", async () => {
      render(<ClampedText visibleLines={1} text={TEXT} />);
      await userEvent.click(screen.getByText("See more"));
      await userEvent.click(screen.getByText("See less"));
      expect(screen.getByText("See more")).toBeInTheDocument();
    });
  });

  describe("and the text is less than the height of the container", () => {
    beforeEach(() => {
      getBoundingClientRectMock.mockImplementation(function () {
        return {
          height: isTextEl(this) ? LESS_HEIGHT : MORE_HEIGHT,
        };
      });
    });

    it("should not show a toggle", () => {
      render(<ClampedText visibleLines={1} text={TEXT} />);
      expect(screen.queryByText("See more")).not.toBeInTheDocument();
      expect(screen.queryByText("See less")).not.toBeInTheDocument();
    });
  });
});
