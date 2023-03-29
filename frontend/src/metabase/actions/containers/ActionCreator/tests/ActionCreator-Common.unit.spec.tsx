import userEvent from "@testing-library/user-event";

import { screen } from "__support__/ui";

import {
  createMockImplicitQueryAction,
  createMockQueryAction,
} from "metabase-types/api/mocks";

import { setup as baseSetup, SetupOpts } from "./common";

async function setup({
  action = createMockImplicitQueryAction(),
  ...opts
}: SetupOpts = {}) {
  await baseSetup({ action, ...opts });
  return { action };
}

describe("ActionCreator > Common", () => {
  describe.each([
    ["query", createMockQueryAction],
    ["implicit", createMockImplicitQueryAction],
  ])(`%s actions`, (_, getAction) => {
    describe("with write permissions", () => {
      it("should show action settings button", async () => {
        await setup({ action: getAction(), canWrite: true });
        const button = screen.getByRole("button", { name: "Action settings" });
        expect(button).toBeInTheDocument();
      });

      it("should be able to set success message", async () => {
        await setup();

        userEvent.click(
          screen.getByRole("button", { name: "Action settings" }),
        );

        userEvent.type(
          screen.getByRole("textbox", { name: "Success message" }),
          `Thanks!`,
        );
        expect(
          screen.getByRole("textbox", { name: "Success message" }),
        ).toHaveValue("Thanks!");
      });
    });

    describe("with read-only permissions", () => {
      it("should show action settings button", async () => {
        await setup({ action: getAction(), canWrite: false });
        const button = screen.getByRole("button", { name: "Action settings" });
        expect(button).toBeInTheDocument();
      });

      it("should not allow editing success message", async () => {
        await setup({ canWrite: false });

        userEvent.click(
          screen.getByRole("button", { name: "Action settings" }),
        );

        expect(
          screen.getByRole("textbox", {
            name: "Success message",
          }),
        ).toBeDisabled();
      });
    });
  });
});
