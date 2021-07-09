import React from "react";
import { render, screen } from "@testing-library/react";

import MetabaseSettings from "../../../../metabase/lib/settings";
import SettingsUpdatesForm from "./SettingsUpdatesForm";

const elements = [
  {
    key: "key",
  },
];

it("shows custom message for Cloud installations", () => {
  const isHostedSpy = jest.spyOn(MetabaseSettings, "isHosted");
  isHostedSpy.mockImplementation(() => true);

  render(<SettingsUpdatesForm elements={elements} />);
  screen.getByText(/Metabase Cloud keeps your instance up-to-date/);
});
