import {
  setupDatabaseEndpoints,
  setupUsersEndpoints,
} from "__support__/server-mocks";
import { renderWithProviders, screen } from "__support__/ui";
import { Route } from "metabase/router";
import * as Urls from "metabase/urls";
import type { Transform } from "metabase-types/api";
import {
  createMockDatabase,
  createMockTable,
  createMockTransform,
  createMockTransformOwner,
  createMockTransformRun,
  createMockUser,
} from "metabase-types/api/mocks";

import { TransformSettingsSection } from "./TransformSettingsSection";

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

type SetupOpts = {
  remoteSyncReadOnly?: boolean;
  transform?: Transform;
};

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
      initialRoute: Urls.transform(transform.id),
    },
  );
}

describe("TransformSettingsSection", () => {
  it("should disable the change target button when the transform is running", async () => {
    setup({
      transform: createMockTransform({
        last_run: createMockTransformRun({ status: "started" }),
      }),
    });
    const button = await screen.findByRole("button", { name: "Change target" });
    expect(button).toBeDisabled();
  });

  it("should not disable the change target button when the transform is not running", async () => {
    setup({
      transform: createMockTransform({
        last_run: createMockTransformRun({ status: "failed" }),
      }),
    });
    const button = await screen.findByRole("button", { name: "Change target" });
    expect(button).toBeEnabled();
  });

  describe("when remote sync is read-only", () => {
    beforeEach(() => {
      setup({ remoteSyncReadOnly: true });
    });

    it("does not show the change target button", async () => {
      await screen.findByRole("switch", {
        name: /Only process new data/,
      });
      expect(
        screen.queryByRole("button", { name: "Change target" }),
      ).not.toBeInTheDocument();
    });

    it("makes Incremental transformation switch disabled", async () => {
      expect(
        await screen.findByRole("switch", {
          name: /Only process new data/,
        }),
      ).toBeDisabled();
    });
  });
});

describe("OwnerSection", () => {
  it("should render the ownership section with title and description", async () => {
    setup({
      transform: createMockTransform(),
    });
    expect(await screen.findByText("Ownership")).toBeInTheDocument();
    expect(
      screen.getByText("Specify who is responsible for this transform."),
    ).toBeInTheDocument();
  });

  it("should render the owner label", async () => {
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
    expect(await screen.findByText("Owner")).toBeInTheDocument();
  });

  it("should display external email when owner_email is set", async () => {
    setup({
      transform: createMockTransform({
        owner_email: "external@example.com",
        owner: createMockTransformOwner({ email: "external@example.com" }),
      }),
    });
    expect(await screen.findByText("Ownership")).toBeInTheDocument();
  });
});

describe("TargetSection", () => {
  it("should not render a edit table metadata button when the target table does not exist", async () => {
    setup({});

    expect(
      await screen.findByRole("button", { name: /Change target/ }),
    ).toBeInTheDocument();

    expect(
      screen.queryByRole("link", { name: /Edit this table/ }),
    ).not.toBeInTheDocument();
  });
  it("should link you to a page where you can edit the target tables metadata", async () => {
    setup({
      transform: createMockTransform({
        table: createMockTable(),
      }),
    });

    expect(
      await screen.findByRole("button", { name: /Change target/ }),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole("link", { name: /Edit this table/ }),
    ).toHaveAttribute(
      "href",
      expect.stringContaining("/data-studio/data/database"),
    );
  });
});
