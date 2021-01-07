import React from "react";
import {
  AdminPinMessage,
  PIN_MESSAGE_STORAGE_KEY,
} from "metabase/containers/Overworld";

import "@testing-library/jest-dom/extend-expect";
import { fireEvent, render, screen } from "@testing-library/react";

const PIN_MESSAGE_DESCRIPTION = "Your team's most important dashboards go here";
const PIN_MESSAGE_HINT =
  "Pin dashboards in Our analytics to have them appear in this space for everyone";

describe("AdminPinMessage", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("should show the admin pin message if the admin hasn't dismissed it", () => {
    render(<AdminPinMessage />);
    assertPresence();
  });

  it("should not show the message if the admin has dismissed it", () => {
    localStorage.setItem(PIN_MESSAGE_STORAGE_KEY, "true");
    render(<AdminPinMessage />);
    assertAbsence();
  });

  it("should set the proper local storage key if the dismiss icon is clicked", () => {
    render(<AdminPinMessage />);
    const CLOSE_ICON = screen.getByRole("img", { name: /close/i });

    assertPresence();
    fireEvent.click(CLOSE_ICON);
    assertAbsence();
  });
});

function assertPresence() {
  screen.getByText(PIN_MESSAGE_DESCRIPTION);
  // Note: the following text is broken between elements. Thus, we use `findBy` instead of `getBy`
  screen.findByText(PIN_MESSAGE_HINT);

  screen.getByRole("img", { name: /dashboard/i });
  screen.getByRole("img", { name: /close/i });
}

function assertAbsence() {
  const DASHBOARD_ICON = screen.queryByRole("img", { name: /dashboard/i });
  const CLOSE_ICON = screen.queryByRole("img", { name: /close/i });

  expect(screen.queryByText(PIN_MESSAGE_DESCRIPTION)).not.toBeInTheDocument();
  expect(screen.queryByText(PIN_MESSAGE_HINT)).not.toBeInTheDocument();
  expect(CLOSE_ICON).not.toBeInTheDocument();
  expect(DASHBOARD_ICON).not.toBeInTheDocument();
}
