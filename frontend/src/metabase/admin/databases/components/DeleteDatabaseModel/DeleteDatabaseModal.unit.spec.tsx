import { render } from "@testing-library/react";
import React from "react";
import userEvent from "@testing-library/user-event";
import { screen } from "__support__/ui";
import useFetch from "metabase/hooks/use-fetch";
import type Database from "metabase-lib/metadata/Database";
import DeleteDatabaseModal, {
  DeleteDatabaseModalProps,
} from "./DeleteDatabaseModal";

const getUsageInfo = (hasContent: boolean) => ({
  question: hasContent ? 10 : 0,
  dataset: hasContent ? 20 : 0,
  metric: hasContent ? 30 : 0,
  segment: hasContent ? 40 : 0,
});

jest.mock("metabase/hooks/use-fetch", () => ({
  __esModule: true,
  default: jest.fn(),
}));

const database = { name: "database name", id: 1 } as Database;

const setup = ({
  onDelete = jest.fn(),
}: {
  onDelete?: DeleteDatabaseModalProps["onDelete"];
} = {}) => {
  render(
    <DeleteDatabaseModal
      onClose={jest.fn()}
      onDelete={onDelete}
      database={database}
    />,
  );

  return {
    onDelete,
  };
};

describe("DeleteDatabaseModal", () => {
  const useFetchMock = useFetch as jest.Mock<typeof useFetch>;

  afterEach(() => {
    jest.clearAllMocks();
  });

  it("should allow deleting database without content after confirming its name", () => {
    useFetchMock.mockReturnValue({
      data: getUsageInfo(false),
      isLoading: false,
    } as any);

    const { onDelete } = setup();

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

  it("should allow deleting database with content after confirming its name and its content removal", () => {
    useFetchMock.mockReturnValue({
      data: getUsageInfo(true),
      isLoading: false,
    } as any);

    const { onDelete } = setup();

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

  it("shows an error if removal failed", () => {
    useFetchMock.mockReturnValue({
      data: getUsageInfo(false),
      isLoading: false,
    } as any);

    setup({
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

  it("shows a loader while fetching usage info", () => {
    useFetchMock.mockReturnValue({
      data: undefined,
      isLoading: true,
    } as any);

    setup();

    expect(screen.getByText("Loading...")).toBeInTheDocument();
  });
});
