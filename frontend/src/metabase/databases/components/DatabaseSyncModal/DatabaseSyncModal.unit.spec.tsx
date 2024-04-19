import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { DatabaseSyncModalView } from "./DatabaseSyncModal";

describe("DatabaseSyncModal", () => {
  it("should render with a table from the sample database", () => {
    render(<DatabaseSyncModalView sampleUrl={"/auto/table/1"} />);

    expect(screen.getByText("Explore sample data")).toBeInTheDocument();
  });

  it("should render with no sample database", async () => {
    const onClose = jest.fn();

    render(<DatabaseSyncModalView onClose={onClose} />);
    await userEvent.click(screen.getByText("Got it"));

    expect(onClose).toHaveBeenCalled();
  });
});
