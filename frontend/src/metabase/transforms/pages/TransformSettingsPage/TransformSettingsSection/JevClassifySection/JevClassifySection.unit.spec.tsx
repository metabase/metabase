import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { setupJevClassifyPreviewEndpoint } from "__support__/server-mocks";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import type { JevClassifyPreview } from "metabase/api";
import type { JevClassifyStep, Transform } from "metabase-types/api";
import {
  createMockPythonTransformSource,
  createMockStructuredDatasetQuery,
  createMockTransform,
} from "metabase-types/api/mocks";

import { JevClassifySection } from "./JevClassifySection";

const SOURCE_PREVIEW: JevClassifyPreview = {
  columns: [
    { name: "ID", type: "type/Integer" },
    { name: "BODY", type: "type/Text" },
  ],
  rows: [[1, "It arrived broken"]],
  stats: { rows: 1, "jev-failures": 0, "elapsed-ms": 3 },
};

const CLASSIFY_PREVIEW: JevClassifyPreview = {
  columns: [
    ...SOURCE_PREVIEW.columns,
    { name: "complaint", type: "type/Text" },
    { name: "complaint_confidence", type: "type/Float" },
  ],
  rows: [
    [1, "It arrived broken", "quality", 0.92],
    [2, "Meh", "unsure", 0.41],
  ],
  stats: { rows: 2, "jev-failures": 0, "elapsed-ms": 180 },
};

const SAVED_STEP: JevClassifyStep = {
  input: "BODY",
  question: "What is the complaint about?",
  kind: "choice",
  answers: { shipping: "late delivery", quality: "broke" },
  "min-confidence": 0.6,
  output: { mode: "new-column", name: "complaint" },
};

type SetupOpts = {
  transform?: Transform;
  readOnly?: boolean;
};

function setup({
  transform = createMockTransform(),
  readOnly,
}: SetupOpts = {}) {
  fetchMock.post("path:/api/jev/classify/preview", ({ options }) => {
    const body = JSON.parse(String(options.body));
    return body.classify.length === 0 ? SOURCE_PREVIEW : CLASSIFY_PREVIEW;
  });
  fetchMock.put(`path:/api/transform/${transform.id}`, transform);

  renderWithProviders(
    <JevClassifySection transform={transform} readOnly={readOnly} />,
  );
}

function createTransformWithStep() {
  return createMockTransform({
    source: {
      type: "query",
      query: createMockStructuredDatasetQuery(),
      "jev-classify": [SAVED_STEP],
    },
  });
}

describe("JevClassifySection", () => {
  it("renders nothing for python transforms", () => {
    setupJevClassifyPreviewEndpoint();
    renderWithProviders(
      <JevClassifySection
        transform={createMockTransform({
          source: createMockPythonTransformSource({}),
        })}
      />,
    );
    expect(screen.queryByText("Classify with Jev")).not.toBeInTheDocument();
  });

  it("shows the empty state and lets you add a step", async () => {
    setup();
    expect(await screen.findByText(/No Jev step yet/)).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("button", { name: /Add a Jev step/ }),
    );

    expect(screen.getByLabelText("Question")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Add a Jev step/ }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  });

  it("offers the source columns and defaults a new step to a text column", async () => {
    setup();
    await screen.findByText(/No Jev step yet/);
    await waitFor(() =>
      expect(
        fetchMock.callHistory.called("path:/api/jev/classify/preview"),
      ).toBe(true),
    );

    await userEvent.click(
      screen.getByRole("button", { name: /Add a Jev step/ }),
    );

    const readColumns = screen.getByRole("textbox", { name: "Read columns" });
    expect(screen.getByText("BODY")).toBeInTheDocument();
    await userEvent.click(readColumns);
    await userEvent.click(await screen.findByRole("option", { name: "ID" }));
    expect(screen.getByText("ID")).toBeInTheDocument();
  });

  it("previews a saved step with confidence badges", async () => {
    setup({ transform: createTransformWithStep() });
    expect(
      await screen.findByDisplayValue("What is the complaint about?"),
    ).toBeInTheDocument();

    const previewButton = screen.getByRole("button", {
      name: /Preview on 20 rows/,
    });
    await waitFor(() => expect(previewButton).toBeEnabled());
    await userEvent.click(previewButton);

    expect(await screen.findByText("quality · 92%")).toBeInTheDocument();
    expect(screen.getByText("unsure · 41%")).toBeInTheDocument();
    expect(
      screen.getByText("Jev judged 2 rows in 180 ms."),
    ).toBeInTheDocument();
  });

  it("saves edited steps onto the transform source", async () => {
    const transform = createTransformWithStep();
    setup({ transform });

    const question = await screen.findByDisplayValue(
      "What is the complaint about?",
    );
    await userEvent.clear(question);
    await userEvent.type(question, "Why is the customer unhappy?");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(
        fetchMock.callHistory.called(`path:/api/transform/${transform.id}`),
      ).toBe(true),
    );
    const call = fetchMock.callHistory.lastCall(
      `path:/api/transform/${transform.id}`,
    );
    const body = JSON.parse(String(call?.options.body));
    expect(body.source["jev-classify"]).toEqual([
      { ...SAVED_STEP, question: "Why is the customer unhappy?" },
    ]);
  });

  it("hides editing controls when read-only", async () => {
    setup({ transform: createTransformWithStep(), readOnly: true });
    expect(
      await screen.findByDisplayValue("What is the complaint about?"),
    ).toBeDisabled();
    expect(
      screen.queryByRole("button", { name: "Save" }),
    ).not.toBeInTheDocument();
  });
});
