import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { setupForcePasswordResetEndpoint } from "__support__/server-mocks/user";
import { mockSettings } from "__support__/settings";
import { createMockState } from "__support__/state";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import { UndoListing } from "metabase/common/components/UndoListing";
import { redirect } from "metabase/utils/dom";
import { createMockSettings } from "metabase-types/api/mocks";

import { EveryoneForcePasswordResetModal } from "./ForcePasswordResetModal";

jest.mock("metabase/utils/dom", () => ({
  ...jest.requireActual("metabase/utils/dom"),
  redirect: jest.fn(),
}));

const FORCE_RESET_PATH = "path:/api/user/force-password-reset";

interface SetupOpts {
  emailConfigured?: boolean;
}

function setup({ emailConfigured = true }: SetupOpts = {}) {
  setupForcePasswordResetEndpoint({ users_reset: 5, emails_queued: 0 });

  const storeInitialState = createMockState({
    settings: mockSettings(
      createMockSettings({ "email-configured?": emailConfigured }),
    ),
  });

  const onClose = jest.fn<void, []>();
  renderWithProviders(
    <>
      <EveryoneForcePasswordResetModal onClose={onClose} />
      <UndoListing />
    </>,
    { storeInitialState },
  );
  return { onClose };
}

beforeEach(() => {
  jest.mocked(redirect).mockClear();
});

const typeConfirmation = async (text = "reset everyone") => {
  await userEvent.type(
    screen.getByRole("textbox", { name: /to confirm/ }),
    text,
  );
};

describe("EveryoneForcePasswordResetModal", () => {
  it("says nothing about reset emails when email is set up", async () => {
    setup();

    expect(
      await screen.findByText(/Everyone, except you,/),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/No reset emails will be sent/),
    ).not.toBeInTheDocument();
  });

  it("closes without offering a reset when email is not set up", async () => {
    const { onClose } = setup({ emailConfigured: false });

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(
      screen.queryByText("Force everyone to reset their password?"),
    ).not.toBeInTheDocument();
    expect(fetchMock.callHistory.calls(FORCE_RESET_PATH)).toHaveLength(0);
  });

  it("only allows submitting once the confirmation phrase is typed", async () => {
    setup();
    const submit = screen.getByRole("button", { name: "Force password reset" });

    expect(submit).toBeDisabled();
    await typeConfirmation("reset every");
    expect(submit).toBeDisabled();
    await typeConfirmation("one");
    expect(submit).toBeEnabled();

    await userEvent.click(submit);
    await waitFor(() =>
      expect(fetchMock.callHistory.calls(FORCE_RESET_PATH)).toHaveLength(1),
    );
  });

  it("does not reset anything without the confirmation phrase", async () => {
    setup();

    await typeConfirmation("reset nobody");
    await userEvent.click(
      screen.getByRole("button", { name: "Force password reset" }),
    );

    expect(fetchMock.callHistory.calls(FORCE_RESET_PATH)).toHaveLength(0);
  });

  it("forces a reset for everyone and reports the result", async () => {
    const { onClose } = setup();

    await typeConfirmation();
    await userEvent.click(
      screen.getByRole("button", { name: "Force password reset" }),
    );

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    const calls = fetchMock.callHistory.calls(FORCE_RESET_PATH);
    expect(calls).toHaveLength(1);
    const body: unknown = JSON.parse(String(calls[0].options.body));
    expect(body).toEqual({ all: true, include_self: false });
    expect(redirect).not.toHaveBeenCalled();
    expect(
      await screen.findByText("Forced a password reset for 5 people."),
    ).toBeInTheDocument();
  });

  it("includes the current user when asked, then sends them to sign in", async () => {
    const { onClose } = setup();

    expect(screen.getByText(/Everyone, except you,/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("checkbox", { name: "Include me" }));
    expect(screen.getByText(/Everyone, including you,/)).toBeInTheDocument();
    expect(
      screen.getByRole("textbox", {
        name: 'Type "reset everyone including me" to confirm',
      }),
    ).toBeInTheDocument();
    await typeConfirmation("reset everyone including me");
    await userEvent.click(
      screen.getByRole("button", { name: "Force password reset" }),
    );

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    const calls = fetchMock.callHistory.calls(FORCE_RESET_PATH);
    expect(calls).toHaveLength(1);
    const body: unknown = JSON.parse(String(calls[0].options.body));
    expect(body).toEqual({ all: true, include_self: true });
    expect(redirect).toHaveBeenCalledWith("/auth/login");
  });

  it("asks for the longer phrase once the current user is included", async () => {
    setup();
    const submit = screen.getByRole("button", { name: "Force password reset" });

    await typeConfirmation("reset everyone");
    expect(submit).toBeEnabled();

    await userEvent.click(screen.getByRole("checkbox", { name: "Include me" }));
    expect(submit).toBeDisabled();

    await userEvent.clear(screen.getByRole("textbox", { name: /to confirm/ }));
    await typeConfirmation("reset everyone including me");
    expect(submit).toBeEnabled();
  });
});
