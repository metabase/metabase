import React from "react";
import ModerationActions from "./ModerationActions";
import { render, screen } from "@testing-library/react";

describe("ModerationActions", () => {
  describe("when the user is not a moderator", () => {
    it("should not render", () => {
      const { getByTestId } = render(<ModerationActions isModerator={false} />);
      expect(() => getByTestId("moderation-verify-action")).toThrow();
      expect(() => screen.getByText("Moderation")).toThrow();
    });
  });

  describe("when a moderator clicks on the verify button", () => {
    it("should call the onVerify prop", () => {
      const onVerify = jest.fn();
      const { getByTestId } = render(
        <ModerationActions isModerator onVerify={onVerify} />,
      );

      getByTestId("moderation-verify-action").click();

      expect(onVerify).toHaveBeenCalled();
    });
  });
});
