import React from "react";
import { render, screen } from "@testing-library/react";

import CollectionSidebarFooter from "./CollectionSidebarFooter";

it("displays link to archive, including icon", () => {
  render(<CollectionSidebarFooter isAdmin={false} />);

  screen.getByText("View archive");
  screen.getByLabelText("view_archive icon");
});

it("does not display link to other users personal collections if user is not superuser", () => {
  render(<CollectionSidebarFooter isAdmin={false} />);

  expect(
    screen.queryByText("Other users' personal collections"),
  ).not.toBeInTheDocument();
  expect(screen.queryByLabelText("group icon")).not.toBeInTheDocument();
});

it("displays link to other users personal collections if user is superuser", () => {
  render(<CollectionSidebarFooter isAdmin={true} />);

  screen.getByText("Other users' personal collections");
  screen.queryByLabelText("group icon");
});
