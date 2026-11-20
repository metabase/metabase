import userEvent from "@testing-library/user-event";

import { findRequests } from "__support__/server-mocks/util";
import { screen, waitFor } from "__support__/ui";

import {
  changeInput,
  getCacheStrategySelect,
  getSaveButton,
  selectCacheStrategy,
  setupStrategyEditorForDatabases as setup,
} from "./test-utils";

describe("StrategyEditorForDatabases (OSS)", () => {
  beforeEach(() => {
    setup();
  });

  it("shows two policy options for the default policy: Adaptive and Don't cache", async () => {
    await userEvent.click(await screen.findByTestId("cache-strategy-select"));
    expect(await screen.findAllByRole("option")).toHaveLength(2);
    expect(
      screen.getByRole("option", { name: /Adaptive/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: /Don.t cache/i }),
    ).toBeInTheDocument();
  });

  it("lets user change the default policy to 'Adaptive', then 'No caching'", async () => {
    expect(
      screen.queryByRole("button", { name: "Save changes" }),
    ).not.toBeInTheDocument();

    // The form loads only the root policy: the OSS backend rejects any other model
    await screen.findByTestId("cache-strategy-select");
    const cacheRequests = (await findRequests("GET")).filter(
      ({ url }) => new URL(url).pathname === "/api/cache",
    );
    expect(cacheRequests).toHaveLength(1);
    expect(new URL(cacheRequests[0].url).searchParams.getAll("model")).toEqual([
      "root",
    ]);

    await selectCacheStrategy(/Adaptive/i);

    expect((await screen.findAllByRole("spinbutton")).length).toBe(2);

    expect(await getSaveButton()).toBeInTheDocument();

    await changeInput(/minimum query duration/i, 1, 5);
    await changeInput(/multiplier/i, 10, 3);

    await userEvent.click(
      await screen.findByTestId("strategy-form-submit-button"),
    );

    const putRequests = await findRequests("PUT");
    expect(putRequests).toHaveLength(1);
    expect(putRequests[0].body).toEqual({
      model: "root",
      model_id: 0,
      strategy: { type: "ttl", min_duration_ms: 5000, multiplier: 3 },
    });
    // The refetched config becomes the form's saved state: the form shows it
    // and, once the post-save "Saved" window elapses, is no longer dirty
    await waitFor(() => {
      expect(
        screen.queryByTestId("strategy-form-submit-button"),
      ).not.toBeInTheDocument();
    });
    expect(getCacheStrategySelect()).toHaveValue("Adaptive");

    await selectCacheStrategy(/Don.t cache/i);
    expect(screen.queryByRole("spinbutton")).not.toBeInTheDocument();

    (await screen.findByTestId("strategy-form-submit-button")).click();
  });

  it("does not regard form as dirty when a default value is entered into an input (metabase#42974)", async () => {
    await selectCacheStrategy(/Adaptive/i);
    await changeInput(/minimum query duration/i, 1, 1);
    await changeInput(/multiplier/i, 10, 10);
    await userEvent.click(await getSaveButton());
    // Re-entering the value it was saved with does not make the form dirty,
    // so the save button is not present
    await changeInput(/multiplier/i, 10, 10);
    expect(
      screen.queryByTestId("strategy-form-submit-button"),
    ).not.toBeInTheDocument();
  });
});
