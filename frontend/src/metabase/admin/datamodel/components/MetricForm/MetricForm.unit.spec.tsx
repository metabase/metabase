import React from "react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import MetricApp from "metabase/admin/datamodel/containers/MetricApp";
import { Route } from "metabase/hoc/Title";
import { callMockEvent } from "__support__/events";
import { BEFORE_UNLOAD_UNSAVED_MESSAGE } from "metabase/hooks/use-before-unload";

const setup = () => {
  renderWithProviders(
    <Route path="/admin/datamodel/metric/create" component={MetricApp} />,
    {
      initialRoute: "/admin/datamodel/metric/create",
      withRouter: true,
    },
  );

  const mockEventListener = jest.spyOn(window, "addEventListener");

  return { mockEventListener };
};

describe("MetricForm", () => {
  it("should render", async () => {
    const { mockEventListener } = setup();

    const descriptionInput = screen.getByPlaceholderText(
      "Something descriptive but not too long",
    );
    userEvent.type(descriptionInput, "01189998819991197253");

    await waitFor(() => {
      screen.debug(undefined, 1000000);
    });

    const mockEvent = callMockEvent(mockEventListener, "beforeunload");

    expect(mockEvent.preventDefault).toHaveBeenCalled();
    expect(mockEvent.returnValue).toBe(BEFORE_UNLOAD_UNSAVED_MESSAGE);

    expect(true).toBe(true);
  });
});
