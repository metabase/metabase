import userEvent from "@testing-library/user-event";
import dayjs from "dayjs";
import fetchMock from "fetch-mock";

import {
  setupDeleteUploadManagementDeleteEndpoint,
  setupUploadManagementEndpoint,
} from "__support__/server-mocks";
import { renderWithProviders, screen, waitFor, within } from "__support__/ui";
import { createMockTable } from "metabase-types/api/mocks";

import { UploadManagementTable } from "./UploadManagementTable";

const threeDaysAgo = dayjs().subtract(3, "day").toISOString();
const threeWeeksAgo = dayjs().subtract(3, "week").toISOString();
const specificDate = dayjs("2009-07-21").toISOString();

const sampleTables = [
  createMockTable({
    id: 1,
    name: "Uploaded Table 1",
    schema: "My schema name",
    is_upload: true,
  }),
  createMockTable({
    id: 2,
    name: "Uploaded Table 2",
    is_upload: true,
    created_at: threeDaysAgo,
  }),
  createMockTable({
    id: 3,
    name: "Uploaded Table 3",
    is_upload: true,
    created_at: threeWeeksAgo,
  }),
  createMockTable({
    id: 99,
    name: "Uploaded Table 99",
    is_upload: true,
    created_at: specificDate,
  }),
];

const setup = async () => {
  setupUploadManagementEndpoint(sampleTables);
  setupDeleteUploadManagementDeleteEndpoint(99);

  renderWithProviders(<UploadManagementTable />, { withUndos: true });

  await screen.findByText("Uploaded Tables");
};

describe("uploadManagementTable", () => {
  it("should render a table with names", async () => {
    await setup();
    sampleTables.forEach(table => {
      expect(screen.getByText(table.name)).toBeInTheDocument();
    });
  });

  it("should display the schema name", async () => {
    await setup();
    expect(screen.getByText(sampleTables[0].schema)).toBeInTheDocument();
  });

  it("should display relative dates for recently created tables", async () => {
    await setup();
    expect(screen.getByText("3 days ago")).toBeInTheDocument();
    expect(screen.getByText("21 days ago")).toBeInTheDocument();
  });

  it("should display absolute dates for older tables", async () => {
    await setup();
    expect(screen.getByText("Jul 21, 2009")).toBeInTheDocument();
  });

  it("should sort by date", async () => {
    await setup();
    const dateColumn = screen.getByText("Created at");

    await userEvent.click(dateColumn);
    expect(screen.getByLabelText("chevrondown icon")).toBeInTheDocument();
    expect(getFirstRow()).toHaveTextContent(/Uploaded Table 99/);

    await userEvent.click(dateColumn);
    expect(screen.getByLabelText("chevronup icon")).toBeInTheDocument();
    expect(getFirstRow()).toHaveTextContent(/Uploaded Table 2/);
  });

  it("should delete a single table", async () => {
    await setup();
    const deleteButton = screen.getAllByLabelText("trash icon")[0];

    await userEvent.click(deleteButton);
    expect(
      await screen.findByText("Delete Uploaded Table 1?"),
    ).toBeInTheDocument();

    const confirmButton = screen.getByRole("button", { name: "Delete" });
    await userEvent.click(confirmButton);
  });

  it("should delete dependent questions by default", async () => {
    await setup();
    const deleteButton = screen.getAllByLabelText("trash icon")[0];

    await userEvent.click(deleteButton);
    expect(
      await screen.findByText("Delete Uploaded Table 1?"),
    ).toBeInTheDocument();

    const modal = screen.getByRole("dialog");
    const confirmButton = within(modal).getByRole("button", { name: "Delete" });
    await userEvent.click(confirmButton);
    await waitFor(() =>
      expect(
        screen.queryByText("Delete Uploaded Table 1?"),
      ).not.toBeInTheDocument(),
    );

    await waitFor(() => {
      const [url, details] = fetchMock.calls()[1]; // next to last call should be the DELETE request

      expect(details?.method).toEqual("DELETE");
      return expect(url).toContain("?archive-cards=true");
    });
  });

  it("can toggle off dependent question deletion", async () => {
    await setup();
    const deleteButton = screen.getAllByLabelText("trash icon")[0];

    await userEvent.click(deleteButton);
    expect(
      await screen.findByText("Delete Uploaded Table 1?"),
    ).toBeInTheDocument();

    const modal = screen.getByRole("dialog");
    const confirmButton = within(modal).getByRole("button", { name: "Delete" });
    const toggle = within(modal).getByLabelText(
      /Also send all models and questions based on this table to the trash/i,
    );
    await userEvent.click(toggle);

    await userEvent.click(confirmButton);
    await waitFor(() =>
      expect(
        screen.queryByText("Delete Uploaded Table 1?"),
      ).not.toBeInTheDocument(),
    );

    await waitFor(() => {
      const [url, details] = fetchMock.calls()[1]; // next to last call should be the DELETE request

      expect(details?.method).toEqual("DELETE");
      return expect(url).toContain("?archive-cards=false");
    });
  });

  it("should delete multiple tables", async () => {
    await setup();
    const checkboxes = screen.getAllByRole("checkbox");

    await userEvent.click(checkboxes[0]);
    await userEvent.click(checkboxes[1]);
    await userEvent.click(checkboxes[2]);

    // bulk action popover
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));

    // modal
    expect(screen.getByText("Delete 3 tables?")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));

    await waitFor(() =>
      expect(screen.queryByText("Delete")).not.toBeInTheDocument(),
    );
    expect(fetchMock.calls().map(call => call?.[1]?.method)).toEqual([
      "GET",
      "DELETE",
      "DELETE",
      "DELETE",
      "GET",
    ]);
  });

  it("should show a single-success toast", async () => {
    await setup();
    const deleteButton = screen.getAllByLabelText("trash icon")[1];

    await userEvent.click(deleteButton);
    expect(
      await screen.findByText("Delete Uploaded Table 2?"),
    ).toBeInTheDocument();

    const confirmButton = screen.getByRole("button", { name: "Delete" });
    await userEvent.click(confirmButton);
    expect(await screen.findByText("1 table deleted")).toBeInTheDocument();
  });

  it("should show a multi-success toast", async () => {
    await setup();
    const checkboxes = screen.getAllByRole("checkbox");

    await userEvent.click(checkboxes[0]);
    await userEvent.click(checkboxes[1]);
    await userEvent.click(checkboxes[2]);

    // bulk action popover
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));

    // modal
    expect(screen.getByText("Delete 3 tables?")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));

    await waitFor(() =>
      expect(screen.queryByText("Delete")).not.toBeInTheDocument(),
    );
    expect(await screen.findByText("3 tables deleted")).toBeInTheDocument();
  });

  it("should show an error toast", async () => {
    await setup();
    const checkboxes = screen.getAllByRole("checkbox");

    await userEvent.click(checkboxes[3]);

    // bulk action popover
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));

    // modal
    expect(screen.getByText("Delete Uploaded Table 99?")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));

    await waitFor(() =>
      expect(screen.queryByText("Delete")).not.toBeInTheDocument(),
    );
    expect(await screen.findByText("Error deleting table")).toBeInTheDocument();
  });

  it("should show a multi-error toast", async () => {
    await setup();
    const checkboxes = screen.getAllByRole("checkbox");

    await userEvent.click(checkboxes[2]);
    await userEvent.click(checkboxes[3]);

    // bulk action popover
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));

    // modal
    expect(screen.getByText("Delete 2 tables?")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));

    await waitFor(() =>
      expect(screen.queryByText("Delete")).not.toBeInTheDocument(),
    );
    expect(
      await screen.findByText("Error deleting tables"),
    ).toBeInTheDocument();
  });
});

function getFirstRow() {
  return screen.getAllByRole("row")[1];
}
