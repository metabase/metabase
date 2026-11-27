import userEvent from "@testing-library/user-event";
import fetchMock, { type CallLog } from "fetch-mock";

import { setupEnterprisePlugins } from "__support__/enterprise";
import {
  setupCollectionByIdEndpoint,
  setupDatabasesEndpoints,
  setupListTransformJobsEndpoint,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { createMockState } from "__support__/state";
import {
  act,
  renderWithProviders,
  screen,
  waitFor,
  within,
} from "__support__/ui";
import * as Analytics from "metabase/analytics";
import { Route } from "metabase/router";
import * as Lib from "metabase-lib";
import { DEFAULT_TEST_QUERY, SAMPLE_PROVIDER } from "metabase-lib/test-helpers";
import type {
  QueryTransformSource,
  Transform,
  TransformId,
  TransformTag,
  TransformTagId,
} from "metabase-types/api";
import {
  createMockCollection,
  createMockDatabase,
  createMockTokenFeatures,
  createMockTransform,
  createMockTransformTag,
} from "metabase-types/api/mocks";

import { TransformRunPage } from "./TransformRunPage";

const TRANSFORM_A_ID = 7;
const TRANSFORM_B_ID = 8;

const HOURLY = createMockTransformTag({ id: 11, name: "hourly" });
const DAILY = createMockTransformTag({ id: 12, name: "daily" });
const WEEKLY = createMockTransformTag({ id: 13, name: "weekly" });
const NEW_TAG_ID = 14;

const QUERY_SOURCE: QueryTransformSource = {
  type: "query",
  query: Lib.createTestJsQuery(SAMPLE_PROVIDER, DEFAULT_TEST_QUERY),
};

function createTransform(opts: Partial<Transform>) {
  return createMockTransform({
    source: QUERY_SOURCE,
    tag_ids: [],
    last_run: null,
    ...opts,
  });
}

type ServerState = {
  tags: TransformTag[];
  transforms: Transform[];
};

function getRunPageUrl(transformId: TransformId) {
  return `/data-studio/transforms/${transformId}/run`;
}

function getId(call: CallLog) {
  return Number(call.expressParams?.id);
}

function getBody(call: CallLog) {
  return JSON.parse(String(call.options.body));
}

function setup({
  transforms,
  tags,
}: {
  transforms: Transform[];
  tags: TransformTag[];
}) {
  const server: ServerState = { tags: [...tags], transforms: [...transforms] };

  setupDatabasesEndpoints([
    createMockDatabase({ id: 1, transforms_permissions: "write" }),
  ]);
  setupListTransformJobsEndpoint([]);
  setupCollectionByIdEndpoint({
    collections: [createMockCollection({ id: "root" })],
  });

  fetchMock.get("path:/api/transform-tag", () => server.tags);
  fetchMock.post("path:/api/transform-tag", (call) => {
    const tag = createMockTransformTag({
      id: NEW_TAG_ID,
      name: getBody(call).name,
    });
    server.tags = [...server.tags, tag];
    return tag;
  });
  fetchMock.put("express:/api/transform-tag/:id", (call) => {
    const id = getId(call);
    const tag = server.tags.find((tag) => tag.id === id);
    if (tag == null) {
      return 404;
    }
    const updatedTag = { ...tag, ...getBody(call) };
    server.tags = server.tags.map((tag) => (tag.id === id ? updatedTag : tag));
    return updatedTag;
  });
  fetchMock.delete("express:/api/transform-tag/:id", (call) => {
    const id = getId(call);
    if (!server.tags.some((tag) => tag.id === id)) {
      return 404;
    }
    server.tags = server.tags.filter((tag) => tag.id !== id);
    server.transforms = server.transforms.map((transform) => ({
      ...transform,
      tag_ids: transform.tag_ids?.filter((tagId) => tagId !== id),
    }));
    return 204;
  });
  fetchMock.get("express:/api/transform/:id", (call) => {
    const transform = server.transforms.find(({ id }) => id === getId(call));
    return transform ?? 404;
  });
  fetchMock.put("express:/api/transform/:id", (call) => {
    const id = getId(call);
    const transform = server.transforms.find(
      (transform) => transform.id === id,
    );
    if (transform == null) {
      return 404;
    }
    const updatedTransform = { ...transform, ...getBody(call) };
    server.transforms = server.transforms.map((transform) =>
      transform.id === id ? updatedTransform : transform,
    );
    return updatedTransform;
  });

  const state = createMockState({
    settings: mockSettings({
      "token-features": createMockTokenFeatures({ "transforms-basic": true }),
      "transforms-enabled": true,
    }),
  });
  setupEnterprisePlugins();

  // Each call starts from an empty store, like a page reload.
  const renderPage = (transformId: TransformId) => {
    const { router, unmount } = renderWithProviders(
      <Route
        path="/data-studio/transforms/:transformId/run"
        element={<TransformRunPage />}
      />,
      {
        withRouter: true,
        withUndos: true,
        storeInitialState: state,
        initialRoute: getRunPageUrl(transformId),
      },
    );

    return {
      unmount,
      navigate: (path: string) => act(() => router?.navigate(path)),
    };
  };

  return { server, renderPage };
}

function getTagsInput() {
  return screen.getByPlaceholderText("Add tags");
}

function getTagsInputContainer() {
  // eslint-disable-next-line testing-library/no-node-access
  const container = getTagsInput().parentElement;
  if (container == null) {
    throw new Error("Tags input container not found");
  }
  return within(container);
}

function getUpdateTransformBodies(transformId: TransformId) {
  return fetchMock.callHistory
    .calls(`path:/api/transform/${transformId}`, { method: "PUT" })
    .map(getBody);
}

function queryTagOption(name: string) {
  return screen
    .queryAllByRole("option")
    .find((option) => within(option).queryByText(name) != null);
}

async function findTagOption(name: string) {
  return waitFor(() => {
    const option = queryTagOption(name);
    if (option == null) {
      throw new Error(`Tag option "${name}" not found`);
    }
    return option;
  });
}

function expectTagIds(tagIds: TransformTagId[]) {
  return expect.objectContaining({ tag_ids: tagIds });
}

function getDeleteTagCalls() {
  return fetchMock.callHistory.calls("express:/api/transform-tag/:id", {
    method: "DELETE",
  });
}

function getUpdateTagCalls() {
  return fetchMock.callHistory.calls("express:/api/transform-tag/:id", {
    method: "PUT",
  });
}

function getTagsUpdatedEvent(eventDetail: "tag_added" | "tag_removed") {
  return {
    event: "transform_tags_updated",
    triggered_from: "transform_run_page",
    event_detail: eventDetail,
    target_id: TRANSFORM_A_ID,
    result: "success",
  };
}

describe("TransformRunPage tags", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("adds, removes, deletes, and renames tags", async () => {
    const trackSimpleEvent = jest.spyOn(Analytics, "trackSimpleEvent");
    const { renderPage } = setup({
      transforms: [createTransform({ id: TRANSFORM_A_ID })],
      tags: [HOURLY, DAILY, WEEKLY],
    });
    const { unmount } = renderPage(TRANSFORM_A_ID);

    // add "hourly"
    await userEvent.click(await screen.findByPlaceholderText("Add tags"));
    await userEvent.click(await findTagOption("hourly"));
    expect(
      await getTagsInputContainer().findByText("hourly"),
    ).toBeInTheDocument();
    expect(
      getTagsInputContainer().queryByText("daily"),
    ).not.toBeInTheDocument();
    expect(getUpdateTransformBodies(TRANSFORM_A_ID)).toEqual([
      expectTagIds([HOURLY.id]),
    ]);
    await waitFor(() =>
      expect(trackSimpleEvent).toHaveBeenCalledWith(
        getTagsUpdatedEvent("tag_added"),
      ),
    );

    // add "daily"
    await userEvent.click(await findTagOption("daily"));
    expect(
      await getTagsInputContainer().findByText("daily"),
    ).toBeInTheDocument();
    expect(getTagsInputContainer().getByText("hourly")).toBeInTheDocument();
    expect(getUpdateTransformBodies(TRANSFORM_A_ID)).toEqual([
      expectTagIds([HOURLY.id]),
      expectTagIds([HOURLY.id, DAILY.id]),
    ]);

    // backspace removes the last tag
    trackSimpleEvent.mockClear();
    await userEvent.type(getTagsInput(), "{backspace}");
    await waitFor(() =>
      expect(
        getTagsInputContainer().queryByText("daily"),
      ).not.toBeInTheDocument(),
    );
    expect(getTagsInputContainer().getByText("hourly")).toBeInTheDocument();
    expect(getUpdateTransformBodies(TRANSFORM_A_ID)).toEqual([
      expectTagIds([HOURLY.id]),
      expectTagIds([HOURLY.id, DAILY.id]),
      expectTagIds([HOURLY.id]),
    ]);
    await waitFor(() =>
      expect(trackSimpleEvent).toHaveBeenCalledWith(
        getTagsUpdatedEvent("tag_removed"),
      ),
    );

    // reload: the tags are read back from the server and no toast is shown
    unmount();
    renderPage(TRANSFORM_A_ID);
    await screen.findByPlaceholderText("Add tags");
    expect(
      await getTagsInputContainer().findByText("hourly"),
    ).toBeInTheDocument();
    expect(
      getTagsInputContainer().queryByText("daily"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText("Transform tags updated"),
    ).not.toBeInTheDocument();

    // delete a tag that is not selected
    await userEvent.click(getTagsInput());
    await userEvent.click(
      within(await findTagOption("daily")).getByRole("button", {
        name: "Delete tag",
      }),
    );
    const deleteModal = await screen.findByRole("dialog", {
      name: "Delete the daily tag?",
    });
    await userEvent.click(
      within(deleteModal).getByRole("button", { name: "Delete tag" }),
    );
    expect(
      await screen.findByText("Transform tags updated"),
    ).toBeInTheDocument();
    expect(getDeleteTagCalls().map(getId)).toEqual([DAILY.id]);
    expect(getTagsInputContainer().getByText("hourly")).toBeInTheDocument();

    await userEvent.click(getTagsInput());
    expect(await findTagOption("weekly")).toBeInTheDocument();
    await waitFor(() => expect(queryTagOption("daily")).toBeUndefined());

    // rename a tag
    await userEvent.click(
      within(await findTagOption("weekly")).getByRole("button", {
        name: "Rename tag",
      }),
    );
    const renameModal = await screen.findByRole("dialog", {
      name: "Rename the weekly tag",
    });
    const nameInput = within(renameModal).getByLabelText("Name");
    await userEvent.clear(nameInput);
    await userEvent.type(nameInput, "weekly_changed");
    await userEvent.click(
      within(renameModal).getByRole("button", { name: "Save" }),
    );
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    expect(getUpdateTagCalls().map(getId)).toEqual([WEEKLY.id]);
    expect(getUpdateTagCalls().map(getBody)).toEqual([
      { name: "weekly_changed" },
    ]);

    await userEvent.click(getTagsInput());
    expect(await findTagOption("weekly_changed")).toBeInTheDocument();
  });

  it("removes a tag deleted from another transform from this transform", async () => {
    const { renderPage } = setup({
      transforms: [
        createTransform({ id: TRANSFORM_A_ID, name: "Transform A" }),
        createTransform({ id: TRANSFORM_B_ID, name: "Transform B" }),
      ],
      tags: [],
    });
    const { navigate } = renderPage(TRANSFORM_A_ID);

    // add a new tag to transform A
    await userEvent.type(
      await screen.findByPlaceholderText("Add tags"),
      "New tag",
    );
    await userEvent.click(await screen.findByText(/Create/));
    expect(
      await screen.findByText("Transform tags updated"),
    ).toBeInTheDocument();
    expect(
      await getTagsInputContainer().findByText("New tag"),
    ).toBeInTheDocument();
    const createTagCalls = fetchMock.callHistory.calls(
      "path:/api/transform-tag",
      { method: "POST" },
    );
    expect(createTagCalls.map(getBody)).toEqual([{ name: "New tag" }]);
    expect(getUpdateTransformBodies(TRANSFORM_A_ID)).toEqual([
      expectTagIds([NEW_TAG_ID]),
    ]);
    // transform A has a tag that no enabled job runs
    expect(
      await screen.findByText("No enabled job runs these tags."),
    ).toBeInTheDocument();

    // delete the tag from transform B
    await navigate(getRunPageUrl(TRANSFORM_B_ID));
    expect(await screen.findByDisplayValue("Transform B")).toBeInTheDocument();
    await userEvent.click(getTagsInput());
    await userEvent.click(
      within(await findTagOption("New tag")).getByRole("button", {
        name: "Delete tag",
      }),
    );
    const deleteModal = await screen.findByRole("dialog", {
      name: "Delete the New tag tag?",
    });
    await userEvent.click(
      within(deleteModal).getByRole("button", { name: "Delete tag" }),
    );
    await waitFor(() =>
      expect(getDeleteTagCalls().map(getId)).toEqual([NEW_TAG_ID]),
    );
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );

    // the tag is gone from transform A
    await navigate(getRunPageUrl(TRANSFORM_A_ID));
    expect(await screen.findByDisplayValue("Transform A")).toBeInTheDocument();
    await waitFor(() =>
      expect(
        screen.queryByText("No enabled job runs these tags."),
      ).not.toBeInTheDocument(),
    );
    expect(getTagsInput()).toBeInTheDocument();
    expect(
      getTagsInputContainer().queryByText("New tag"),
    ).not.toBeInTheDocument();
  });
});
