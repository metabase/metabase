import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  setupDatabaseEndpoints,
  setupUpdateTransformEndpoint,
  setupUsersEndpoints,
} from "__support__/server-mocks";
import { renderWithProviders, screen } from "__support__/ui";
import { Route } from "metabase/router";
import * as Urls from "metabase/urls";
import type { Transform, TransformId } from "metabase-types/api";
import {
  createMockDatabase,
  createMockTransform,
  createMockTransformOwner,
  createMockTransformRun,
  createMockUser,
} from "metabase-types/api/mocks";

import { TransformSettingsSection } from "./TransformSettingsSection";

type SetupOpts = {
  remoteSyncReadOnly?: boolean;
  transform?: Transform;
};

jest.mock(
  "metabase/transforms/components/IncrementalTransform/useHasCheckpointOptions",
  () => ({
    useHasCheckpointOptions: jest.fn().mockReturnValue({
      hasCheckpointOptions: true,
      hasNativeCheckpointOptions: true,
      transformType: "mbql",
    }),
  }),
);

function setup({
  transform = createMockTransform(),
  remoteSyncReadOnly = false,
}: SetupOpts) {
  setupDatabaseEndpoints(createMockDatabase({ id: 1 }));
  setupUsersEndpoints([
    createMockUser({
      id: 1,
      common_name: "Test Owner",
      email: "test@example.com",
    }),
    createMockUser({
      id: 2,
      common_name: "Another User",
      email: "another@example.com",
    }),
  ]);

  renderWithProviders(
    <Route
      path={Urls.transform(transform.id)}
      element={
        <TransformSettingsSection
          transform={transform}
          readOnly={remoteSyncReadOnly}
          remoteSyncReadOnly={remoteSyncReadOnly}
        />
      }
    />,
    {
      withRouter: true,
      withUndos: true,
      initialRoute: Urls.transform(transform.id),
    },
  );
}

function getLastOwnerUpdateBody(transformId: TransformId) {
  const call = fetchMock.callHistory.lastCall(
    `path:/api/transform/${transformId}`,
    { method: "PUT" },
  );
  return JSON.parse(String(call?.options.body));
}

describe("TransformSettingsSection", () => {
  it("should disable the change target button when the transform is running", () => {
    setup({
      transform: createMockTransform({
        last_run: createMockTransformRun({ status: "started" }),
      }),
    });
    const button = screen.getByRole("button", { name: "Change target" });
    expect(button).toBeDisabled();
  });

  it("should not disable the change target button when the transform is not running", () => {
    setup({
      transform: createMockTransform({
        last_run: createMockTransformRun({ status: "failed" }),
      }),
    });
    const button = screen.getByRole("button", { name: "Change target" });
    expect(button).toBeEnabled();
  });

  describe("when remote sync is read-only", () => {
    beforeEach(async () => {
      setup({ remoteSyncReadOnly: true });
      await screen.findByRole("switch", { name: /Only process new data/ });
    });

    it("does not show the change target button", () => {
      expect(
        screen.queryByRole("button", { name: "Change target" }),
      ).not.toBeInTheDocument();
    });

    it("makes Incremental transformation switch disabled", () => {
      expect(
        screen.getByRole("switch", {
          name: /Only process new data/,
        }),
      ).toBeDisabled();
    });
  });
});

describe("OwnerSection", () => {
  it("should render the ownership section with title and description", () => {
    setup({
      transform: createMockTransform(),
    });
    expect(screen.getByText("Ownership")).toBeInTheDocument();
    expect(
      screen.getByText("Specify who is responsible for this transform."),
    ).toBeInTheDocument();
  });

  it("should render the owner label", () => {
    setup({
      transform: createMockTransform({
        owner_user_id: 1,
        owner: createMockTransformOwner({
          id: 1,
          first_name: "Test",
          last_name: "Owner",
        }),
      }),
    });
    expect(screen.getByText("Owner")).toBeInTheDocument();
  });

  it("should display external email when owner_email is set", () => {
    setup({
      transform: createMockTransform({
        owner_email: "external@example.com",
        owner: createMockTransformOwner({ email: "external@example.com" }),
      }),
    });
    expect(screen.getByText("Ownership")).toBeInTheDocument();
  });

  it("should change the owner to another user", async () => {
    const transform = createMockTransform();
    setupUpdateTransformEndpoint(transform.id, transform);
    setup({ transform });

    await userEvent.click(screen.getByRole("textbox", { name: "Owner" }));
    await userEvent.click(
      await screen.findByRole("option", { name: /Another User/ }),
    );

    expect(
      await screen.findByText("Transform owner updated"),
    ).toBeInTheDocument();
    expect(getLastOwnerUpdateBody(transform.id)).toEqual({
      owner_email: null,
      owner_user_id: 2,
    });
  });

  it("should change the owner to an external email", async () => {
    const transform = createMockTransform();
    setupUpdateTransformEndpoint(transform.id, transform);
    setup({ transform });

    await userEvent.type(
      screen.getByRole("textbox", { name: "Owner" }),
      "external@example.com",
    );
    await userEvent.click(await screen.findByText("external@example.com"));

    expect(
      await screen.findByText("Transform owner updated"),
    ).toBeInTheDocument();
    expect(getLastOwnerUpdateBody(transform.id)).toEqual({
      owner_email: "external@example.com",
      owner_user_id: null,
    });
  });

  it("should clear the owner", async () => {
    const transform = createMockTransform({
      owner_user_id: 1,
      owner: createMockTransformOwner({ id: 1 }),
    });
    setupUpdateTransformEndpoint(transform.id, transform);
    setup({ transform });

    await userEvent.click(screen.getByRole("textbox", { name: "Owner" }));
    await userEvent.click(
      await screen.findByRole("option", { name: /No owner/ }),
    );

    expect(
      await screen.findByText("Transform owner updated"),
    ).toBeInTheDocument();
    expect(getLastOwnerUpdateBody(transform.id)).toEqual({
      owner_email: null,
      owner_user_id: null,
    });
  });

  it("should show an error toast when the owner update fails", async () => {
    const transform = createMockTransform();
    setupUpdateTransformEndpoint(transform.id, { status: 500 });
    setup({ transform });

    await userEvent.click(screen.getByRole("textbox", { name: "Owner" }));
    await userEvent.click(
      await screen.findByRole("option", { name: /Another User/ }),
    );

    expect(
      await screen.findByText("Failed to update transform owner"),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Transform owner updated"),
    ).not.toBeInTheDocument();
  });
});
