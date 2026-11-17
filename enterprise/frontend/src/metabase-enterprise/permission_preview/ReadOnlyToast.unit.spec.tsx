import fetchMock from "fetch-mock";

import { act, renderWithProviders, screen } from "__support__/ui";
import { api } from "metabase/api/client";
import { UndoListing } from "metabase/common/components/UndoListing";

import { ReadOnlyToast } from "./ReadOnlyToast";

const READ_ONLY_REFUSAL = {
  message: "You're previewing another user, so changes aren't allowed.",
  error_code: "permission-preview-read-only",
};

const TOAST_TEXT = "This preview is read-only, so your change wasn't saved.";

describe("ReadOnlyToast", () => {
  it("says the preview is read-only when the preview guard refuses a bookmark", async () => {
    fetchMock.post("path:/api/bookmark/card/1", {
      status: 403,
      body: READ_ONLY_REFUSAL,
    });
    setup();

    await sendIgnoringRefusal("/api/bookmark/card/1");

    expect(await screen.findByText(TOAST_TEXT)).toBeInTheDocument();
  });

  it("shows one toast for several refused writes", async () => {
    fetchMock.post("path:/api/bookmark/card/1", {
      status: 403,
      body: READ_ONLY_REFUSAL,
    });
    setup();

    await sendIgnoringRefusal("/api/bookmark/card/1");
    await sendIgnoringRefusal("/api/bookmark/card/1");

    expect(await screen.findAllByText(TOAST_TEXT)).toHaveLength(1);
  });

  it("stays silent when the refused write is recording a recently opened item", async () => {
    fetchMock.post("path:/api/activity/recents", {
      status: 403,
      body: READ_ONLY_REFUSAL,
    });
    setup();

    await sendIgnoringRefusal("/api/activity/recents");

    expect(screen.queryByText(TOAST_TEXT)).not.toBeInTheDocument();
  });

  it("stays silent on a 403 that isn't the preview guard's", async () => {
    fetchMock.post("path:/api/bookmark/card/1", {
      status: 403,
      body: { message: "You don't have permissions to do that." },
    });
    setup();

    await sendIgnoringRefusal("/api/bookmark/card/1");

    expect(screen.queryByText(TOAST_TEXT)).not.toBeInTheDocument();
  });
});

function setup() {
  renderWithProviders(
    <>
      <ReadOnlyToast />
      <UndoListing />
    </>,
  );
}

async function sendIgnoringRefusal(url: string) {
  await act(async () => {
    await api.request({ method: "POST", url, body: {} }).catch(() => undefined);
  });
}
