import React from "react";
import { render, screen } from "@testing-library/react";
import SyncModal from "./SyncModal";

describe("SyncModal", () => {
  it("should not open the modal initially by default", () => {
    const onHideModal = jest.fn();

    render(<SyncModal onHideModal={onHideModal} />);

    expect(screen.queryByText(/your database/)).not.toBeInTheDocument();
    expect(onHideModal).not.toHaveBeenCalled();
  });

  it("should open the modal when there are syncing databases", () => {
    const onHideModal = jest.fn();

    render(
      <SyncModal
        showModal={true}
        hasSyncingDatabases={true}
        onHideModal={onHideModal}
      />,
    );

    expect(screen.getByText(/your database/)).toBeInTheDocument();
    expect(onHideModal).toHaveBeenCalled();
  });
});
