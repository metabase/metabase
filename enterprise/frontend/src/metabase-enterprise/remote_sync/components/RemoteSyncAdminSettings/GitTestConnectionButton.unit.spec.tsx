import userEvent from "@testing-library/user-event";

import { setupRemoteSyncTestConnectionEndpoint } from "__support__/server-mocks";
import { renderWithProviders, screen } from "__support__/ui";

import { GitTestConnectionButton } from "./GitTestConnectionButton";

const URL = "https://github.com/test/repo.git";
const TOKEN = "ghp_abc123";

const setup = ({
  error,
}: {
  error?: { status: number; message: string };
} = {}) => {
  setupRemoteSyncTestConnectionEndpoint({ error });
  const { rerender } = renderWithProviders(
    <GitTestConnectionButton url={URL} token={TOKEN} />,
  );
  return {
    rerender: ({
      url = URL,
      token = TOKEN,
    }: {
      url?: string;
      token?: string;
    }) => rerender(<GitTestConnectionButton url={url} token={token} />),
  };
};

const clickTestConnection = () =>
  userEvent.click(screen.getByRole("button", { name: /Test connection/i }));

describe("GitTestConnectionButton", () => {
  it("should show the success icon when the connection succeeds", async () => {
    setup();
    await clickTestConnection();
    expect(
      await screen.findByLabelText("Connection successful"),
    ).toBeInTheDocument();
  });

  it("should show the server error in the failure icon's tooltip", async () => {
    setup({
      error: { status: 400, message: "Authentication failed" },
    });
    await clickTestConnection();

    await userEvent.hover(await screen.findByLabelText("Connection failed"));
    expect(await screen.findByRole("tooltip")).toHaveTextContent(
      "Authentication failed",
    );
  });

  it.each([
    { name: "URL", change: { url: "https://github.com/x/y.git" } },
    { name: "token", change: { token: "ghp_other" } },
  ])("should clear the result when the $name changes", async ({ change }) => {
    const { rerender } = setup();
    await clickTestConnection();
    expect(
      await screen.findByLabelText("Connection successful"),
    ).toBeInTheDocument();

    rerender(change);
    expect(
      screen.queryByLabelText("Connection successful"),
    ).not.toBeInTheDocument();
  });
});
