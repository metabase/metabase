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
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("should have beforeunload event when user makes edits to a metric", async () => {
    const { mockEventListener } = setup();

    const descriptionInput = screen.getByPlaceholderText(
      "Something descriptive but not too long",
    );
    userEvent.type(descriptionInput, "01189998819991197253");

    const mockEvent = await waitFor(() => {
      return callMockEvent(mockEventListener, "beforeunload");
    });
    expect(mockEvent.preventDefault).toHaveBeenCalled();
    expect(mockEvent.returnValue).toBe(BEFORE_UNLOAD_UNSAVED_MESSAGE);
  });

  it("should not have an beforeunload event when metric is unedited", async () => {
    const { mockEventListener } = setup();

    const mockEvent = callMockEvent(mockEventListener, "beforeunload");

    expect(mockEvent.preventDefault).not.toHaveBeenCalled();
    expect(mockEvent.returnValue).toBe(undefined);
  });
});
