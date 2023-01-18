import React from "react";
import { render, screen } from "@testing-library/react";

import DeleteGroupMappingModal from ".";
import type { DeleteGroupMappingModalProps } from ".";

const DEFAULT_PROPS = {
  dn: "cn=People",
  groupIds: [1],
  onConfirm: jest.fn(),
  onHide: jest.fn(),
};

const setup = (props?: DeleteGroupMappingModalProps) => {
  render(<DeleteGroupMappingModal {...DEFAULT_PROPS} />);
};

describe("DeleteGroupMappingModal", () => {
  it("something", () => {
    setup();

    expect(
      screen.getByText("Nothing, just remove the mapping"),
    ).toBeInTheDocument();
  });
});
