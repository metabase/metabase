import React from "react";
import ModerationActions from "./ModerationActions";
import { render } from "@testing-library/react";

describe("ModerationActions", () => {
  describe("when a moderator clicks on the verify button", () => {
    it("should call the onVerify prop", () => {
      const onVerify = jest.fn();
      const { getByTestId } = render(<ModerationActions onVerify={onVerify} />);

      getByTestId("moderatio-verify-action").simulate("click");

      expect(onVerify).toHaveBeenCalled();
    });
  });
});
