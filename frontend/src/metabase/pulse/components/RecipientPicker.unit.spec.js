import { render, screen } from "@testing-library/react";

import RecipientPicker from "metabase/pulse/components/RecipientPicker";

const TEST_USERS = [
  { id: 1, common_name: "Barb", email: "barb_holland@hawkins.test" }, // w
  { id: 2, common_name: "Dustin", email: "dustin_henderson@hawkinsav.test" }, // w
  { id: 3, common_name: "El", email: "011@energy.test" },
  { id: 4, common_name: "Lucas", email: "lucas.sinclair@hawkins.test" }, // w
  { id: 5, common_name: "Mike", email: "dm_mike@hawkins.test" }, // w
  { id: 6, common_name: "Nancy", email: "" },
  { id: 7, common_name: "Steve", email: "" },
  { id: 8, common_name: "Will", email: "zombieboy@upside.test" }, // w
];

describe("recipient picker", () => {
  describe("focus", () => {
    it("should be focused if there are no recipients", async () => {
      render(
        <RecipientPicker
          recipients={[]}
          users={TEST_USERS}
          isNewPulse={true}
          onRecipientsChange={() => alert("why?")}
          invalidRecipientText={() => {}}
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
          invalidRecipientText={() => {}}
        />,
      );
      // Now only the recipient name should be visible
      screen.getByText("Barb");
      expect(screen.queryByText("Dustin")).not.toBeInTheDocument();
    });
  });
});
