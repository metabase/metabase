import { render, waitForElementToBeRemoved } from "@testing-library/react";
import fetchMock from "fetch-mock";
import userEvent from "@testing-library/user-event";
import { screen } from "__support__/ui";
import type Database from "metabase-lib/metadata/Database";
import type { DeleteDatabaseModalProps } from "./DeleteDatabaseModal";
import DeleteDatabaseModal from "./DeleteDatabaseModal";

const getUsageInfo = (hasContent: boolean) => ({
  question: hasContent ? 10 : 0,
  dataset: hasContent ? 20 : 0,
  metric: hasContent ? 30 : 0,
  segment: hasContent ? 40 : 0,
});

const database = { name: "database name", id: 1 } as Database;

const setup = async ({
  onDelete = jest.fn(),
  hasContent = true,
}: {
  onDelete?: DeleteDatabaseModalProps["onDelete"];
  hasContent?: boolean;
} = {}) => {
  fetchMock.get("path:/api/database/1/usage_info", getUsageInfo(hasContent));
  render(
    <DeleteDatabaseModal
      onClose={jest.fn()}
      onDelete={onDelete}
      database={database}
    />,
  );

  await waitForElementToBeRemoved(() => screen.queryAllByText("Loading..."));

  return {
    onDelete,
  };
};

describe("DeleteDatabaseModal", () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it("should allow deleting database without content after confirming its name", async () => {
    const { onDelete } = await setup({ hasContent: false });

    const deleteButton = screen.getByRole("button", { name: "Delete" });

    expect(
      screen.queryByText("Delete 10 saved questions"),
    ).not.toBeInTheDocument();

    expect(deleteButton).toBeDisabled();

    userEvent.type(
      screen.getByTestId("database-name-confirmation-input"),
      "database name",
    );

    expect(deleteButton).toBeEnabled();

    userEvent.click(deleteButton);

    expect(onDelete).toHaveBeenCalledWith(database);
  });

  it("should allow deleting database with content after confirming its name and its content removal", async () => {
    const { onDelete } = await setup({ hasContent: true });

    const deleteButton = screen.getByRole("button", {
      name: "Delete this content and the DB connection",
    });

    expect(deleteButton).toBeDisabled();

    userEvent.click(screen.getByText("Delete 10 saved questions"));
    userEvent.click(screen.getByText("Delete 20 models"));
    userEvent.click(screen.getByText("Delete 30 metrics"));
    userEvent.click(screen.getByText("Delete 40 segments"));

    expect(deleteButton).toBeDisabled();

    userEvent.type(
      screen.getByTestId("database-name-confirmation-input"),
      "database name",
    );

    expect(deleteButton).toBeEnabled();

    userEvent.click(deleteButton);

    expect(onDelete).toHaveBeenCalledWith(database);
  });

  it("shows an error if removal failed", async () => {
    await setup({
      hasContent: false,
      onDelete: () => {
        throw new Error("Something went wrong");
      },
    });

    const deleteButton = screen.getByRole("button", { name: "Delete" });
    userEvent.type(
      screen.getByTestId("database-name-confirmation-input"),
      "database name",
    );

    userEvent.click(deleteButton);

    expect(screen.getByText("Something went wrong")).toBeInTheDocument();
  });
});
