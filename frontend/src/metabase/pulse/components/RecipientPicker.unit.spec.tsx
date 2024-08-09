import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import * as MetabaseAnalytics from "metabase/lib/analytics";
import { RecipientPicker } from "metabase/pulse/components/RecipientPicker";
import { createMockUser } from "metabase-types/api/mocks";

const TEST_USERS = [
  { id: 1, common_name: "Barb", email: "barb_holland@hawkins.test" }, // w
  { id: 2, common_name: "Dustin", email: "dustin_henderson@hawkinsav.test" }, // w
  { id: 3, common_name: "El", email: "011@energy.test" },
  { id: 4, common_name: "Lucas", email: "lucas.sinclair@hawkins.test" }, // w
  { id: 5, common_name: "Mike", email: "dm_mike@hawkins.test" }, // w
  { id: 6, common_name: "Nancy", email: "" },
  { id: 7, common_name: "Steve", email: "" },
  { id: 8, common_name: "Will", email: "zombieboy@upside.test" }, // w
].map(user => createMockUser(user));

describe("recipient picker", () => {
  describe("focus", () => {
    it("should be focused if there are no recipients", async () => {
      render(
        <RecipientPicker
          recipients={[]}
          users={TEST_USERS}
          isNewPulse={true}
          onRecipientsChange={() => alert("why?")}
          invalidRecipientText={() => ""}
        />,
      );
      // Popover with all names should be open on focus
      expect(await screen.findByText("Barb")).toBeInTheDocument();
      expect(await screen.findByText("Dustin")).toBeInTheDocument();
    });
    it("should not be focused if there are existing recipients", () => {
      render(
        <RecipientPicker
          recipients={[TEST_USERS[0]]}
          users={TEST_USERS}
          isNewPulse={true}
          onRecipientsChange={() => alert("why?")}
          invalidRecipientText={() => ""}
        />,
      );
      // Now only the recipient name should be visible
      screen.getByText("Barb");
      expect(screen.queryByText("Dustin")).not.toBeInTheDocument();
    });
  });

  describe("onChange", () => {
    beforeAll(() => {
      jest.mock("metabase/lib/analytics");
    });

    it("should track additions", async () => {
      const onRecipientsChange = jest.fn();

      render(
        <RecipientPicker
          recipients={[TEST_USERS[0]]}
          users={TEST_USERS}
          isNewPulse={true}
          onRecipientsChange={onRecipientsChange}
          invalidRecipientText={() => ""}
        />,
      );

      await userEvent.type(await screen.findByRole("textbox"), "Na");
      await userEvent.click(await screen.findByText("Nancy"));

      expect(onRecipientsChange).toHaveBeenCalled();

      expect(MetabaseAnalytics.trackStructEvent).toHaveBeenLastCalledWith(
        "PulseCreate",
        "AddRecipient",
        "user",
      );
    });

    it("should track removals", async () => {
      const onRecipientsChange = jest.fn();

      render(
        <RecipientPicker
          recipients={[TEST_USERS[0], TEST_USERS[1], TEST_USERS[2]]}
          users={TEST_USERS}
          isNewPulse={true}
          onRecipientsChange={onRecipientsChange}
          invalidRecipientText={() => ""}
        />,
      );

      await userEvent.click(
        (
          await screen.findAllByRole("img", { name: /close/ })
        )[2],
      );

      expect(onRecipientsChange).toHaveBeenCalled();
      expect(MetabaseAnalytics.trackStructEvent).toHaveBeenLastCalledWith(
        "PulseCreate",
        "RemoveRecipient",
        "user",
      );
    });

    it("should support adding emails", async () => {
      const onRecipientsChange = jest.fn();

      render(
        <RecipientPicker
          recipients={[TEST_USERS[0]]}
          users={TEST_USERS}
          isNewPulse={true}
          onRecipientsChange={onRecipientsChange}
          invalidRecipientText={() => ""}
        />,
      );

      await userEvent.type(
        await screen.findByRole("textbox"),
        "foo@bar.com{enter}",
      );

      expect(onRecipientsChange).toHaveBeenCalled();
      expect(MetabaseAnalytics.trackStructEvent).toHaveBeenLastCalledWith(
        "PulseCreate",
        "AddRecipient",
        "email",
      );
    });

    it("should track creating vs editing pulses", async () => {
      const onRecipientsChange = jest.fn();

      render(
        <RecipientPicker
          recipients={[TEST_USERS[0]]}
          users={TEST_USERS}
          isNewPulse={false}
          onRecipientsChange={onRecipientsChange}
          invalidRecipientText={() => ""}
        />,
      );

      await userEvent.type(
        await screen.findByRole("textbox"),
        "foo@bar.com{enter}",
      );

      expect(onRecipientsChange).toHaveBeenCalled();
      expect(MetabaseAnalytics.trackStructEvent).toHaveBeenLastCalledWith(
        "PulseEdit",
        "AddRecipient",
        "email",
      );
    });
  });
});
