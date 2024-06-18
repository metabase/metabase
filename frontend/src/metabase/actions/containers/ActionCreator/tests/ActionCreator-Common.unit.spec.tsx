import userEvent from "@testing-library/user-event";

import { callMockEvent } from "__support__/events";
import { screen } from "__support__/ui";
import { getDefaultFormSettings } from "metabase/actions/utils";
import { BEFORE_UNLOAD_UNSAVED_MESSAGE } from "metabase/hooks/use-before-unload";
import {
  createMockActionParameter,
  createMockImplicitQueryAction,
  createMockQueryAction,
} from "metabase-types/api/mocks";

import type { SetupOpts } from "./common";
import { setup as baseSetup } from "./common";

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
      afterEach(() => {
        jest.resetAllMocks();
      });

      it("should show action settings button", async () => {
        await setup({ action: getAction(), canWrite: true });
        const button = screen.getByRole("button", { name: "Action settings" });
        expect(button).toBeInTheDocument();
      });

      it("should be able to set success message", async () => {
        await setup();

        await userEvent.click(
          screen.getByRole("button", { name: "Action settings" }),
        );

        await userEvent.type(
          screen.getByRole("textbox", { name: "Success message" }),
          `Thanks!`,
        );
        expect(
          screen.getByRole("textbox", { name: "Success message" }),
        ).toHaveValue("Thanks!");
      });

      it("should warn the user before leaving an edited action", async () => {
        const mockEventListener = jest.spyOn(window, "addEventListener");
        await setup({
          action: getAction({
            visualization_settings: getDefaultFormSettings(),
          }),
          canWrite: true,
        });

        await userEvent.click(
          screen.getByRole("button", { name: "Action settings" }),
        );

        await userEvent.type(
          screen.getByRole("textbox", { name: "Success message" }),
          `Thanks!`,
        );

        await userEvent.tab();

        expect(
          screen.getByRole("textbox", { name: "Success message" }),
        ).toHaveValue("Thanks!");

        const mockEvent = callMockEvent(mockEventListener, "beforeunload");
        expect(mockEvent.returnValue).toEqual(BEFORE_UNLOAD_UNSAVED_MESSAGE);
        expect(mockEvent.preventDefault).toHaveBeenCalled();
      });

      it("should not warn user when leaving unedited action", async () => {
        const mockEventListener = jest.spyOn(window, "addEventListener");
        await setup({
          action: getAction({
            visualization_settings: getDefaultFormSettings(),
          }),
          canWrite: true,
        });

        const mockEvent = callMockEvent(mockEventListener, "beforeunload");
        expect(mockEvent.returnValue).toBeUndefined();
        expect(mockEvent.preventDefault).not.toHaveBeenCalled();
      });

      it("should be able to hide fields", async () => {
        await setup({
          action: getAction({
            visualization_settings: getDefaultFormSettings(),
            parameters: [createMockActionParameter({ name: "FooBar" })],
          }),
        });

        const checkbox = screen.getByLabelText("Show field");
        const input = screen.getByRole("textbox", { name: /foobar/i });

        expect(input).toBeEnabled();
        expect(checkbox).toBeChecked();

        await userEvent.click(checkbox);

        expect(checkbox).not.toBeChecked();
        expect(input).toBeDisabled();
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

        await userEvent.click(
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
