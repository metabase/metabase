import React from "react";
import { render, screen } from "@testing-library/react";
import { SyncModalSwitch } from "./SyncModalSwitch";

const SyncModalMock = () => <div>SyncModal</div>;

jest.mock("../SyncModalContent", () => SyncModalMock);

describe("SyncModalSwitch", () => {
  it("should not open the modal initially by default", () => {
    const onOpen = jest.fn();

    render(<SyncModalSwitch onOpen={onOpen} />);

    expect(screen.queryByText("SyncModalContent")).not.toBeInTheDocument();
    expect(onOpen).not.toHaveBeenCalled();
  });

  it("should open the modal initially if required", () => {
    const onOpen = jest.fn();

    render(<SyncModalSwitch isRequired={true} onOpen={onOpen} />);

    expect(screen.getByText("SyncModalContent")).toBeInTheDocument();
    expect(onOpen).toHaveBeenCalled();
  });

  it("should remain open if opened and no longer required", () => {
    const onOpen = jest.fn();

    render(<SyncModalSwitch isRequired={true} onOpen={onOpen} />);
    render(<SyncModalSwitch isRequired={false} onOpen={onOpen} />);

    expect(screen.getByText("SyncModalContent")).toBeInTheDocument();
    expect(onOpen).toHaveBeenCalled();
  });
});
