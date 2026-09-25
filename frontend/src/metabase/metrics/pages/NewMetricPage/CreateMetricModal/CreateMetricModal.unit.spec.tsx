import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  setupCardCreateEndpoint,
  setupCollectionByIdEndpoint,
} from "__support__/server-mocks";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import * as Analytics from "metabase/analytics";
import { ROOT_COLLECTION } from "metabase/common/collections/constants";
import * as Lib from "metabase-lib";
import { DEFAULT_TEST_QUERY, SAMPLE_PROVIDER } from "metabase-lib/test-helpers";
import { createMockCollection } from "metabase-types/api/mocks";

import { CreateMetricModal } from "./CreateMetricModal";

function setup() {
  setupCardCreateEndpoint();
  setupCollectionByIdEndpoint({
    collections: [createMockCollection(ROOT_COLLECTION)],
  });

  const onCreate = jest.fn();
  const query = Lib.createTestQuery(SAMPLE_PROVIDER, DEFAULT_TEST_QUERY);

  renderWithProviders(
    <CreateMetricModal
      query={query}
      defaultValues={{}}
      triggeredFrom="main_app"
      onCreate={onCreate}
      onClose={jest.fn()}
    />,
  );

  return { onCreate };
}

describe("CreateMetricModal", () => {
  it("creates a metric card and tracks metric_created", async () => {
    const trackSimpleEvent = jest.spyOn(Analytics, "trackSimpleEvent");
    const { onCreate } = setup();

    await userEvent.type(
      await screen.findByLabelText("Name"),
      "Total Revenue",
    );
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(onCreate).toHaveBeenCalledTimes(1));
    expect(fetchMock.callHistory.calls("card-create")).toHaveLength(1);
    // The create mock echoes the POST body back as the card.
    const createdCard = onCreate.mock.calls[0][0];
    expect(createdCard).toMatchObject({ name: "Total Revenue", type: "metric" });
    expect(trackSimpleEvent).toHaveBeenCalledWith({
      event: "metric_created",
      triggered_from: "main_app",
      result: "success",
      target_id: createdCard.id,
    });
  });
});
