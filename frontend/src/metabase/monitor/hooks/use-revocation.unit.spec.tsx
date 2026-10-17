import userEvent from "@testing-library/user-event";

import { renderWithProviders, screen, waitFor, within } from "__support__/ui";

import { useRevocation } from "./use-revocation";

type Request = { ids: string[] };

const REQUEST: Request = { ids: ["first", "second"] };

const MESSAGES = {
  revoked: (count: number) => `Revoked ${count} items`,
  raced: (count: number) => `${count} new items arrived while revoking`,
  failed: "Could not revoke items.",
};

type SetupOpts = {
  remaining?: number;
  error?: unknown;
};

const setup = ({ remaining = 0, error }: SetupOpts = {}) => {
  const revoke = jest.fn((_request: Request) => ({
    unwrap: () =>
      error === undefined
        ? Promise.resolve({ revoked: 2, remaining })
        : Promise.reject(error),
  }));
  const onRevoked = jest.fn();

  const Harness = () => {
    const { confirmModal, confirmRevoke } = useRevocation({
      revoke,
      messages: MESSAGES,
      onRevoked,
    });
    return (
      <>
        <button
          onClick={() =>
            confirmRevoke({
              title: "Revoke 2 items?",
              message: "This can't be undone.",
              request: REQUEST,
            })
          }
        >
          Start
        </button>
        {confirmModal}
      </>
    );
  };

  renderWithProviders(<Harness />, { withUndos: true });

  return { revoke, onRevoked };
};

const startRevoke = async () => {
  await userEvent.click(screen.getByRole("button", { name: "Start" }));
  return screen.findByTestId("confirm-modal");
};

const confirmRevoke = async () => {
  const modal = await startRevoke();
  await userEvent.click(within(modal).getByRole("button", { name: "Revoke" }));
};

describe("useRevocation", () => {
  it("asks for confirmation before revoking anything", async () => {
    const { revoke } = setup();

    const modal = await startRevoke();

    expect(within(modal).getByText("Revoke 2 items?")).toBeInTheDocument();
    expect(
      within(modal).getByText("This can't be undone."),
    ).toBeInTheDocument();
    expect(revoke).not.toHaveBeenCalled();
  });

  it("revokes once confirmed, reporting how many went", async () => {
    const { revoke, onRevoked } = setup();

    await confirmRevoke();

    expect(await screen.findByText("Revoked 2 items")).toBeInTheDocument();
    expect(revoke).toHaveBeenCalledWith(REQUEST);
    expect(onRevoked).toHaveBeenCalledWith(REQUEST);
    expect(
      screen.queryByText(/arrived while revoking/),
    ).not.toBeInTheDocument();
  });

  it("warns when more arrived while the revoke was running", async () => {
    setup({ remaining: 3 });

    await confirmRevoke();

    expect(await screen.findByText("Revoked 2 items")).toBeInTheDocument();
    expect(
      await screen.findByText("3 new items arrived while revoking"),
    ).toBeInTheDocument();
  });

  it("revokes nothing when the confirmation is cancelled", async () => {
    const { revoke, onRevoked } = setup();

    const modal = await startRevoke();
    await userEvent.click(
      within(modal).getByRole("button", { name: "Cancel" }),
    );

    await waitFor(() => {
      expect(screen.queryByTestId("confirm-modal")).not.toBeInTheDocument();
    });
    expect(revoke).not.toHaveBeenCalled();
    expect(onRevoked).not.toHaveBeenCalled();
  });

  it("shows the server's reason when the revoke fails", async () => {
    const { onRevoked } = setup({
      error: { status: 400, data: { message: "Too many items" } },
    });

    await confirmRevoke();

    expect(await screen.findByText("Too many items")).toBeInTheDocument();
    expect(onRevoked).not.toHaveBeenCalled();
  });

  it("falls back to the feature's own message when the failure carries none", async () => {
    const { onRevoked } = setup({ error: { status: 500 } });

    await confirmRevoke();

    expect(
      await screen.findByText("Could not revoke items."),
    ).toBeInTheDocument();
    expect(screen.queryByText(/^Revoked /)).not.toBeInTheDocument();
    expect(onRevoked).not.toHaveBeenCalled();
  });
});
