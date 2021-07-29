import React from "react";
import ModerationActions from "./ModerationActions";
import { render, screen } from "@testing-library/react";

describe("ModerationActions", () => {
  describe("when the user is not a moderator", () => {
    it("should not render", () => {
      const { queryByTestId } = render(
        <ModerationActions isModerator={false} />,
      );
      expect(queryByTestId("moderation-verify-action")).toBeNull();
      expect(screen.queryByText("Moderation")).toBeNull();
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
