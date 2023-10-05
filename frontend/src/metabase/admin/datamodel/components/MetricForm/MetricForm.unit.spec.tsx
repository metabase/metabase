import userEvent from "@testing-library/user-event";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import MetricApp from "metabase/admin/datamodel/containers/MetricApp";
import { Route } from "metabase/hoc/Title";
import { callMockEvent } from "__support__/events";
import { BEFORE_UNLOAD_UNSAVED_MESSAGE } from "metabase/hooks/use-before-unload";
import {
  setupDatabasesEndpoints,
  setupSearchEndpoints,
} from "__support__/server-mocks";
import { createMockDatabase } from "metabase-types/api/mocks";
import { checkNotNull } from "metabase/core/utils/types";

const TestHome = () => <div />;

interface SetupOpts {
  initialRoute?: string;
}

const setup = ({
  initialRoute = "/admin/datamodel/metric/create",
}: SetupOpts = {}) => {
  setupDatabasesEndpoints([createMockDatabase()]);
  setupSearchEndpoints([]);
  renderWithProviders(
    <>
      <Route path="/" component={TestHome} />
      <Route path="/admin/datamodel/metric/create" component={MetricApp} />
    </>,
    {
      initialRoute,
      withRouter: true,
    },
  );

  const mockEventListener = jest.spyOn(window, "addEventListener");

  return {
    history: checkNotNull(history),
    mockEventListener,
  };
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
