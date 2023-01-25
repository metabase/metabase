import { render } from "@testing-library/react";
import React from "react";
import nock from "nock";
import userEvent from "@testing-library/user-event";
import { screen } from "__support__/ui";
import type Database from "metabase-lib/metadata/Database";
import DeleteDatabaseModal from "./DeleteDatabaseModal";

const database = { name: "database name", id: 1 } as Database;

const setup = async (hasContent: boolean) => {
  nock(location.origin)
    .get("/api/database/1/usage_info")
    .reply(200, {
      question: hasContent ? 10 : 0,
      dataset: hasContent ? 20 : 0,
      metric: hasContent ? 30 : 0,
      segment: hasContent ? 40 : 0,
    });

  const onClose = jest.fn();
  const onDelete = jest.fn();

  render(
    <DeleteDatabaseModal
      onClose={onClose}
      onDelete={onDelete}
      database={database}
    />,
  );

  return {
    onClose,
    onDelete,
  };
};

describe("DeleteDatabaseModal", () => {
  afterEach(() => {
    nock.cleanAll();
    jest.restoreAllMocks();
  });

  it("should allow deleting database without content after confirming its name", async () => {
    const { onDelete } = await setup(false);

    const deleteButton = await screen.findByText("Delete");

    expect(
      await screen.findByText("Delete 10 saved questions"),
    ).not.toBeInTheDocument();

    expect(deleteButton).toBeDisabled();

    expect(deleteButton).toBeDisabled();

    userEvent.type(
      await screen.findByTestId("database-name-confirmation-input"),
      "database name",
    );

    expect(deleteButton).toBeEnabled();

    userEvent.click(deleteButton);

    expect(onDelete).toHaveBeenCalledWith(database);
  });

  it("should allow deleting database with content after confirming its name and its content removal", async () => {
    const { onDelete } = await setup(true);

    const deleteButton = await screen.findByText(
      "Delete this content and the DB connection",
    );

    expect(deleteButton).toBeDisabled();

    userEvent.click(await screen.findByText("Delete 10 saved questions"));
    userEvent.click(await screen.findByText("Delete 20 saved models"));
    userEvent.click(await screen.findByText("Delete 30 saved metrics"));
    userEvent.click(await screen.findByText("Delete 40 saved questions"));

    expect(deleteButton).toBeDisabled();

    userEvent.type(
      await screen.findByTestId("database-name-confirmation-input"),
      "database name",
    );

    expect(deleteButton).toBeEnabled();

    userEvent.click(deleteButton);

    expect(onDelete).toHaveBeenCalledWith(database);
  });
});
