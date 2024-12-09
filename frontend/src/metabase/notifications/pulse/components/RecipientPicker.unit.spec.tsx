import userEvent from "@testing-library/user-event";

import { renderWithProviders, screen } from "__support__/ui";
import { RecipientPicker } from "metabase/notifications/pulse/components/RecipientPicker";
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
      renderWithProviders(
        <RecipientPicker
          recipients={[]}
          users={TEST_USERS}
          onRecipientsChange={() => alert("why?")}
          invalidRecipientText={() => ""}
        />,
      );
      // Popover with all names should be open on focus
      expect(await screen.findByText("Barb")).toBeInTheDocument();
      expect(await screen.findByText("Dustin")).toBeInTheDocument();
    });

    it("should not be focused if there are existing recipients", () => {
      renderWithProviders(
        <RecipientPicker
          recipients={[TEST_USERS[0]]}
          users={TEST_USERS}
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
    it("should track additions", async () => {
      const onRecipientsChange = jest.fn();

      renderWithProviders(
        <RecipientPicker
          recipients={[TEST_USERS[0]]}
          users={TEST_USERS}
          onRecipientsChange={onRecipientsChange}
          invalidRecipientText={() => ""}
        />,
      );

      await userEvent.type(await screen.findByRole("textbox"), "Na");
      await userEvent.click(await screen.findByText("Nancy"));

      expect(onRecipientsChange).toHaveBeenCalledWith([
        TEST_USERS[0],
        TEST_USERS[5],
      ]);
    });

    it("should track removals", async () => {
      const onRecipientsChange = jest.fn();

      renderWithProviders(
        <RecipientPicker
          recipients={[TEST_USERS[0], TEST_USERS[1], TEST_USERS[2]]}
          users={TEST_USERS}
          onRecipientsChange={onRecipientsChange}
          invalidRecipientText={() => ""}
        />,
      );

      await userEvent.click(
        (await screen.findAllByRole("img", { name: /close/ }))[2],
      );

      expect(onRecipientsChange).toHaveBeenCalledWith([
        TEST_USERS[0],
        TEST_USERS[1],
      ]);
    });

    it("should support adding emails", async () => {
      const onRecipientsChange = jest.fn();

      renderWithProviders(
        <RecipientPicker
          recipients={[TEST_USERS[0]]}
          users={TEST_USERS}
          onRecipientsChange={onRecipientsChange}
          invalidRecipientText={() => ""}
        />,
      );

      await userEvent.type(
        await screen.findByRole("textbox"),
        "foo@bar.com{enter}",
      );

      expect(onRecipientsChange).toHaveBeenCalledWith([
        TEST_USERS[0],
        { email: "foo@bar.com" },
      ]);
    });
  });
});
