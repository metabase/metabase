import fetchMock from "fetch-mock";

import {
  setupCreateAccessGrantEndpoint,
  setupCreateAccessGrantEndpointWithError,
} from "__support__/server-mocks";
import {
  fireEvent,
  renderWithProviders,
  screen,
  waitFor,
  within,
} from "__support__/ui";
import { UndoListing } from "metabase/common/components/UndoListing";
import { PLUGIN_SUPPORT } from "metabase/plugins";
import { createMockAccessGrant } from "metabase-types/api/mocks";

import { GrantAccessModal } from "./GrantAccessModal";

const onClose = jest.fn();

const setup = () => {
  renderWithProviders(
    <>
      <GrantAccessModal onClose={onClose} />
      <UndoListing />
    </>,
  );
};

describe("GrantAccessModal", () => {
  beforeEach(() => {
    jest.spyOn(console, "error").mockImplementation(() => {});
    PLUGIN_SUPPORT.isEnabled = true;
  });

  afterEach(() => {
    jest.spyOn(console, "error").mockRestore();
    onClose.mockClear();
    fetchMock.clearHistory();
  });

  it("should close if PLUGIN_SUPPORT plugin is disabled", () => {
    PLUGIN_SUPPORT.isEnabled = false;
    setup();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("should create an access grant with default values", async () => {
    setupCreateAccessGrantEndpoint(createMockAccessGrant());
    setup();
    const durationField = screen.getByLabelText(/Access duration/);
    expect(durationField).toHaveValue("96 hours");
    fireEvent.click(screen.getByRole("button", { name: "Grant access" }));
    await waitFor(async () => {
      expect(
        fetchMock.callHistory.calls(`path:/api/ee/support-access-grant`, {
          body: {
            grant_duration_minutes: 96 * 60,
            notes: null,
            ticket_number: null,
          },
        }),
      ).toHaveLength(1);
    });
    expect(onClose).toHaveBeenCalledTimes(1);

    await waitFor(() => {
      const undo = screen.getByTestId("toast-undo");
      expect(
        within(undo).getByText(/Access grant created successfully/),
      ).toBeInTheDocument();
    });
  });

  it("should handle response error", async () => {
    const errorMessage = "An error occurred and this is the error message";
    setupCreateAccessGrantEndpointWithError(errorMessage);
    setup();
    fireEvent.click(screen.getByRole("button", { name: "Grant access" }));
    await waitFor(async () => {
      expect(
        fetchMock.callHistory.calls(`path:/api/ee/support-access-grant`),
      ).toHaveLength(1);
    });
    expect(onClose).not.toHaveBeenCalled();

    await waitFor(() => {
      const undo = screen.getByTestId("toast-undo");
      expect(
        within(undo).getByText(/Sorry, something went wrong. Please try again/),
      ).toBeInTheDocument();
    });
    expect(screen.getByRole("alert")).toHaveTextContent(
      new RegExp(errorMessage),
    );
  });
});
