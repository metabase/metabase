import { render, screen } from "@testing-library/react";
import MetabaseSettings from "metabase/lib/settings";
import { DataPermissionsHelp } from "metabase/admin/permissions/components/DataPermissionsHelp/DataPermissionsHelp";

describe("DataPermissionsHelp", function () {
  it("shows link to the plans page on non-enterprise instances", () => {
    jest
      .spyOn(MetabaseSettings, "isEnterprise")
      .mockImplementation(() => false);

    render(<DataPermissionsHelp />);

    screen
      .queryAllByText("Only available in certain Metabase plans.")
      .every(element => {
        expect(element).toBeInTheDocument();
      });

    screen.getAllByText("Upgrade to Pro").every(link => {
      expect(link).toHaveAttribute("href", "https://www.metabase.com/pricing");
    });
  });

  it("does not show the link to the plans page on enterprise instances", () => {
    jest.spyOn(MetabaseSettings, "isEnterprise").mockImplementation(() => true);

    render(<DataPermissionsHelp />);

    expect(
      screen.queryByText("Only available in certain Metabase plans."),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Upgrade to Pro")).not.toBeInTheDocument();
  });
});
