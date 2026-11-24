import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  setupListDagRunTransformRunsEndpoint,
  setupListDagTransformsEndpoint,
  setupListTransformJobsEndpoint,
  setupListTransformTagsEndpoint,
  setupListTransformsEndpoint,
  setupRunTransformDagEndpoint,
  setupUserMetabotPermissionsEndpoint,
} from "__support__/server-mocks";
import {
  mockGetBoundingClientRect,
  renderWithProviders,
  screen,
  waitFor,
  within,
} from "__support__/ui";
import { UndoListing } from "metabase/common/components/UndoListing";
import { Route } from "metabase/router";
import { RunListPage } from "metabase/transforms/pages/RunListPage";
import * as Urls from "metabase/urls";
import type {
  RunTransformDagResponse,
  Transform,
  TransformJob,
  TransformRunForJobRun,
} from "metabase-types/api";
import {
  createMockListTransformRunsResponse,
  createMockTransform,
  createMockTransformJob,
  createMockTransformRun,
  createMockTransformRunForJobRun,
} from "metabase-types/api/mocks";

import { RunSection } from "./RunSection";

const TRANSFORM_ID = 10;
const DAG_RUN_ID = 1;

const DEFAULT_DAG_MEMBERS: TransformRunForJobRun[] = [
  createMockTransformRunForJobRun({
    id: 1,
    transform_id: 2,
    status: "started",
  }),
];

function setup({
  transform,
  runDagResponse,
  dagMembers = DEFAULT_DAG_MEMBERS,
  jobs = [],
  noTitle,
}: {
  transform?: Transform;
  runDagResponse?: RunTransformDagResponse;
  dagMembers?: TransformRunForJobRun[];
  jobs?: TransformJob[];
  noTitle?: boolean;
} = {}) {
  const testTransform =
    transform ?? createMockTransform({ id: TRANSFORM_ID, last_run: null });

  setupListTransformTagsEndpoint([]);
  setupListDagTransformsEndpoint(TRANSFORM_ID, [
    { id: 1, name: "Upstream A" },
    { id: 2, name: "Upstream B" },
    { id: TRANSFORM_ID, name: testTransform.name },
  ]);
  setupRunTransformDagEndpoint(TRANSFORM_ID, runDagResponse);
  setupListDagRunTransformRunsEndpoint(DAG_RUN_ID, dagMembers);
  setupListTransformJobsEndpoint(jobs);

  renderWithProviders(
    <>
      <RunSection transform={testTransform} noTitle={noTitle} />
      <UndoListing />
    </>,
  );
}

async function triggerUpstreamRun() {
  await userEvent.click(screen.getByTestId("run-options-button"));
  await userEvent.click(
    await screen.findByText("Run this and all upstream transforms"),
  );
  await screen.findByText("Upstream A");
  await userEvent.click(screen.getByRole("button", { name: "Run all" }));
}

describe("RunSection DAG run flow", () => {
  it("offers upstream and downstream run options", async () => {
    setup();
    await userEvent.click(screen.getByTestId("run-options-button"));

    expect(
      await screen.findByText("Run this and all upstream transforms"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Run this and all downstream transforms"),
    ).toBeInTheDocument();
  });

  it("previews the transforms and triggers a run-dag with the chosen direction", async () => {
    setup();
    await userEvent.click(screen.getByTestId("run-options-button"));
    await userEvent.click(
      await screen.findByText("Run this and all upstream transforms"),
    );

    expect(
      await screen.findByText("Run this and all upstream transforms?"),
    ).toBeInTheDocument();
    expect(await screen.findByText("Upstream A")).toBeInTheDocument();
    expect(screen.getByText("Upstream B")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Run all" }));

    await waitFor(() => {
      expect(
        fetchMock.callHistory.called(
          `path:/api/transform/${TRANSFORM_ID}/run-dag`,
        ),
      ).toBe(true);
    });
    const call = fetchMock.callHistory.lastCall(
      `path:/api/transform/${TRANSFORM_ID}/run-dag`,
    );
    const rawBody = call?.options?.body;
    const body = JSON.parse(typeof rawBody === "string" ? rawBody : "{}");
    expect(body.direction).toBe("upstream");
  });

  it("shows a scheduled state after triggering a DAG run", async () => {
    setup();
    await triggerUpstreamRun();

    expect(
      await screen.findByText("Scheduled to run as part of a reprocess run."),
    ).toBeInTheDocument();
  });

  it("stops showing the scheduled state once this transform's own run has completed mid-DAG", async () => {
    setup({
      transform: createMockTransform({
        id: TRANSFORM_ID,
        last_run: createMockTransformRun({
          status: "succeeded",
          end_time: null,
        }),
      }),
      dagMembers: [
        createMockTransformRunForJobRun({
          id: 1,
          transform_id: 2,
          status: "started",
        }),
        createMockTransformRunForJobRun({
          id: 2,
          transform_id: TRANSFORM_ID,
          status: "succeeded",
        }),
      ],
    });
    await triggerUpstreamRun();

    expect(
      await screen.findByText("Last ran successfully."),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Scheduled to run as part of a reprocess run."),
    ).not.toBeInTheDocument();
  });

  it("notifies the user and skips the scheduled state when nothing was run", async () => {
    setup({
      runDagResponse: { message: "DAG run started", dag_run_id: null },
    });
    await triggerUpstreamRun();

    expect(
      await screen.findByText(
        "A reprocess run for this transform is already in progress.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Scheduled to run as part of a reprocess run."),
    ).not.toBeInTheDocument();
  });
});

describe("RunSection no active job note", () => {
  const TAG_ID = 5;
  const OTHER_TAG_ID = 6;
  const NOTE_TEXT = "No enabled job runs these tags.";

  const taggedTransform = createMockTransform({
    id: TRANSFORM_ID,
    last_run: null,
    tag_ids: [TAG_ID],
  });

  async function waitForJobsRequest() {
    await waitFor(() => {
      expect(fetchMock.callHistory.called("path:/api/transform-job")).toBe(
        true,
      );
    });
  }

  it("shows the note with a jobs link when no active job has any of the transform's tags", async () => {
    setup({
      transform: taggedTransform,
      jobs: [
        createMockTransformJob({ id: 1, active: false, tag_ids: [TAG_ID] }),
        createMockTransformJob({
          id: 2,
          active: true,
          tag_ids: [OTHER_TAG_ID],
        }),
      ],
    });

    expect(await screen.findByText(NOTE_TEXT)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Go to jobs" })).toHaveAttribute(
      "href",
      "/data-studio/transforms/jobs",
    );
  });

  it("shows the note when the section renders without a title", async () => {
    setup({
      transform: taggedTransform,
      jobs: [
        createMockTransformJob({ id: 1, active: false, tag_ids: [TAG_ID] }),
      ],
      noTitle: true,
    });

    expect(await screen.findByText(NOTE_TEXT)).toBeInTheDocument();
  });

  it("hides the note when an active job has one of the transform's tags", async () => {
    setup({
      transform: taggedTransform,
      jobs: [
        createMockTransformJob({
          id: 1,
          active: true,
          tag_ids: [OTHER_TAG_ID, TAG_ID],
        }),
      ],
    });
    await waitForJobsRequest();

    expect(screen.queryByText(NOTE_TEXT)).not.toBeInTheDocument();
  });

  it("hides the note and does not fetch jobs when the transform has no tags", async () => {
    setup({
      transform: createMockTransform({
        id: TRANSFORM_ID,
        last_run: null,
        tag_ids: [],
      }),
    });
    await screen.findByText("This transform hasn't been run before.");

    expect(screen.queryByText(NOTE_TEXT)).not.toBeInTheDocument();
    expect(fetchMock.callHistory.called("path:/api/transform-job")).toBe(false);
  });
});

describe("RunSection run list link", () => {
  const MBQL_TRANSFORM = createMockTransform({ id: 1, name: "MBQL transform" });
  const MBQL_RUN = createMockTransformRun({
    id: 101,
    transform: MBQL_TRANSFORM,
    status: "succeeded",
    run_method: "manual",
  });
  const SQL_TRANSFORM = createMockTransform({
    id: 2,
    name: "SQL transform",
    last_run: createMockTransformRun({ id: 102, status: "succeeded" }),
  });
  const SQL_RUN = createMockTransformRun({
    id: 102,
    transform: SQL_TRANSFORM,
    status: "succeeded",
    run_method: "manual",
  });

  function setupWithRunList() {
    setupListTransformTagsEndpoint([]);
    setupListTransformJobsEndpoint([]);
    setupUserMetabotPermissionsEndpoint();
    setupListTransformsEndpoint([MBQL_TRANSFORM, SQL_TRANSFORM]);
    fetchMock.get("path:/api/transform/run", (call) => {
      const transformIds = new URL(call.url).searchParams
        .getAll("transform-ids")
        .map(Number);
      const runs = [MBQL_RUN, SQL_RUN].filter(
        (run) =>
          transformIds.length === 0 ||
          transformIds.includes(run.transform?.id ?? -1),
      );
      return createMockListTransformRunsResponse({
        data: runs,
        total: runs.length,
      });
    });
    mockGetBoundingClientRect({ width: 1200, height: 800 });

    const { router } = renderWithProviders(
      <>
        <Route
          path="/transform"
          element={<RunSection transform={SQL_TRANSFORM} />}
        />
        <Route path={Urls.transformRunList()} element={<RunListPage />} />
      </>,
      { withRouter: true, initialRoute: "/transform" },
    );
    return { router };
  }

  it("opens the run list filtered by the current transform", async () => {
    const { router } = setupWithRunList();

    const link = screen.getByRole("link", { name: "See all runs" });
    expect(link).toHaveAttribute(
      "href",
      `/data-studio/transforms/runs/individual?transform-ids=${SQL_TRANSFORM.id}`,
    );
    await userEvent.click(link);

    expect(router?.location.search).toBe(`?transform-ids=${SQL_TRANSFORM.id}`);
    const table = await screen.findByRole("treegrid", {
      name: "Transform runs",
    });
    expect(await within(table).findByText("SQL transform")).toBeInTheDocument();
    expect(within(table).getByText("Success")).toBeInTheDocument();
    expect(within(table).getByText("Manual")).toBeInTheDocument();
    expect(within(table).queryByText("MBQL transform")).not.toBeInTheDocument();

    const call = fetchMock.callHistory.lastCall("path:/api/transform/run");
    expect(
      new URL(call?.url ?? "http://x").searchParams.getAll("transform-ids"),
    ).toEqual([String(SQL_TRANSFORM.id)]);
  });
});
