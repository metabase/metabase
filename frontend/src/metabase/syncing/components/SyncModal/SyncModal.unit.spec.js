import React from "react";
import { render, screen } from "@testing-library/react";
import SyncModal from "./SyncModal";

const SyncModalMock = () => <div>SyncModalContent</div>;

jest.mock("../../containers/SyncModalContent", () => SyncModalMock);

describe("SyncModal", () => {
  it("should not open the modal initially by default", () => {
    const onOpen = jest.fn();

    render(<SyncModal onOpen={onOpen} />);

    expect(screen.queryByText("SyncModalContent")).not.toBeInTheDocument();
    expect(onOpen).not.toHaveBeenCalled();
  });

  it("should open the modal initially if required", () => {
    const onOpen = jest.fn();

    render(<SyncModal isRequired={true} onOpen={onOpen} />);

    expect(screen.getByText("SyncModalContent")).toBeInTheDocument();
    expect(onOpen).toHaveBeenCalled();
  });

  it("should remain open if opened and no longer required", () => {
    const { rerender } = render(<SyncModal isRequired={true} />);
    rerender(<SyncModal isRequired={false} />);

    expect(screen.getByText("SyncModalContent")).toBeInTheDocument();
  });
});
