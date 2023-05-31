import React from "react";
import userEvent from "@testing-library/user-event";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";
import { createMockDatabase } from "metabase-types/api/mocks";
import { setupDatabaseEndpoints } from "__support__/server-mocks";
import {
  renderWithProviders,
  screen,
  waitForElementToBeRemoved,
} from "__support__/ui";
import { useDatabaseQuery } from "../use-database-query";
import { useDatabaseUpdate } from "./use-database-update";

const TEST_DB = createMockDatabase();
const TEST_NEW_NAME = "New name";

const TestComponent = () => {
  const { data, isLoading, error } = useDatabaseQuery({ id: TEST_DB.id });
  const updateDatabase = useDatabaseUpdate();

  const handleSubmit = async () => {
    await updateDatabase({ id: TEST_DB.id }, { name: TEST_NEW_NAME });
  };

  if (isLoading || error || !data) {
    return <LoadingAndErrorWrapper loading={isLoading} error={error} />;
  }

  return (
    <div>
      <div>{data.name}</div>
      <button onClick={handleSubmit}>Update</button>
    </div>
  );
};

const setup = async () => {
  setupDatabaseEndpoints(TEST_DB);
  renderWithProviders(<TestComponent />);
  await waitForElementToBeRemoved(() => screen.queryByText(/Loading/i));
};

describe("useDatabaseUpdate", () => {
  it("should update the state from the response", async () => {
    await setup();
    expect(screen.getByText(TEST_DB.name)).toBeInTheDocument();

    userEvent.click(screen.getByRole("button"));
    expect(await screen.findByText(TEST_NEW_NAME)).toBeInTheDocument();
  });
});
