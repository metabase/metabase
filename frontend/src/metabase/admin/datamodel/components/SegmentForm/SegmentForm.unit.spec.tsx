import userEvent from "@testing-library/user-event";
import { callMockEvent } from "__support__/events";
import {
  setupDatabasesEndpoints,
  setupSearchEndpoints,
} from "__support__/server-mocks";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import { createSampleDatabase } from "metabase-types/api/mocks/presets";
import SegmentApp from "metabase/admin/datamodel/containers/SegmentApp";
import { checkNotNull } from "metabase/core/utils/types";
import { Route } from "metabase/hoc/Title";
import { BEFORE_UNLOAD_UNSAVED_MESSAGE } from "metabase/hooks/use-before-unload";

const TestHome = () => <div />;

interface SetupOpts {
  initialRoute?: string;
}

const setup = ({
  initialRoute = "/admin/datamodel/segment/create",
}: SetupOpts = {}) => {
  setupDatabasesEndpoints([createSampleDatabase()]);
  setupSearchEndpoints([]);

  const { history } = renderWithProviders(
    <>
      <Route path="/" component={TestHome} />
      <Route path="/admin/datamodel/segment/create" component={SegmentApp} />
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

describe("SegmentForm", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("should have beforeunload event when user makes edits to a segment", async () => {
    const { mockEventListener } = setup();

    const descriptionInput = screen.getByPlaceholderText(
      "Something descriptive but not too long",
    );
    userEvent.type(descriptionInput, "something");

    const mockEvent = await waitFor(() => {
      return callMockEvent(mockEventListener, "beforeunload");
    });
    expect(mockEvent.preventDefault).toHaveBeenCalled();
    expect(mockEvent.returnValue).toBe(BEFORE_UNLOAD_UNSAVED_MESSAGE);
  });

  it("should not have an beforeunload event when segment is unedited", async () => {
    const { mockEventListener } = setup();

    const mockEvent = callMockEvent(mockEventListener, "beforeunload");

    expect(mockEvent.preventDefault).not.toHaveBeenCalled();
    expect(mockEvent.returnValue).toBe(undefined);
  });

  it("does not show custom warning modal when leaving with no changes via SPA navigation", async () => {
    const { history } = await setup({ initialRoute: "/" });

    history.push("/admin/datamodel/segment/create");

    history.goBack();

    expect(
      screen.queryByText("Changes were not saved"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(
        "Navigating away from here will cause you to lose any changes you have made.",
      ),
    ).not.toBeInTheDocument();
  });

  it("shows custom warning modal when leaving with unsaved changes via SPA navigation", async () => {
    const { history } = await setup({ initialRoute: "/" });

    history.push("/admin/datamodel/segment/create");

    const descriptionInput = screen.getByPlaceholderText(
      "Something descriptive but not too long",
    );
    userEvent.type(descriptionInput, "something");

    history.goBack();

    expect(screen.getByText("Changes were not saved")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Navigating away from here will cause you to lose any changes you have made.",
      ),
    ).toBeInTheDocument();
  });
});
