import userEvent from "@testing-library/user-event";

import { setupSearchEndpoints } from "__support__/server-mocks";
import { screen } from "__support__/ui";

import { defaultOptions } from "../QuestionPicker";

import {
  level,
  myMetric,
  myModel,
  nestedDashboardQuestion,
  nestedQuestion,
  rootDashboardQuestion,
  setupModal,
  setupPicker,
} from "./setup";

describe("QuestionPicker", () => {
  it("should select the root collection by default", async () => {
    await setupPicker();

    expect(
      await screen.findByRole("link", { name: /Our Analytics/ }),
    ).toHaveAttribute("data-active", "true");

    expect(
      await screen.findByRole("link", { name: /Collection 4/ }),
    ).toBeInTheDocument();

    expect(
      await screen.findByRole("link", { name: /Collection 2/ }),
    ).toBeInTheDocument();
  });

  it("should render the path to the collection provided", async () => {
    await setupPicker({ initialValue: { id: 3, model: "collection" } });
    expect(
      await screen.findByRole("link", { name: /Our Analytics/ }),
    ).toHaveAttribute("data-active", "true");

    expect(
      await screen.findByRole("link", { name: /Collection 4/ }),
    ).toHaveAttribute("data-active", "true");

    expect(
      await screen.findByRole("link", { name: /Collection 3/ }),
    ).toHaveAttribute("data-active", "true");
  });

  describe("initial value", () => {
    it("should render the path to a question in the root collection", async () => {
      await setupPicker({ initialValue: { id: 104, model: "card" } });

      expect(
        await (await level(0)).findByRole("link", { name: /Our Analytics/ }),
      ).toHaveAttribute("data-active", "true");

      expect(
        await (await level(1)).findByRole("link", { name: /Question in Root/ }),
      ).toHaveAttribute("data-active", "true");
    });

    it("should render the path to a question nested in multiple collections", async () => {
      await setupPicker({
        initialValue: { id: 100, model: "card" },
      });

      expect(
        await (await level(0)).findByRole("link", { name: /Our Analytics/ }),
      ).toHaveAttribute("data-active", "true");

      expect(
        await (await level(1)).findByRole("link", { name: /Collection 4/ }),
      ).toHaveAttribute("data-active", "true");

      expect(
        await (await level(2)).findByRole("link", { name: /Collection 3/ }),
      ).toHaveAttribute("data-active", "true");

      // question itself should start selected
      expect(
        await (await level(3)).findByRole("link", { name: /Nested Question/ }),
      ).toHaveAttribute("data-active", "true");
    });

    it("should render the path to a dashboard question where dashboard is in the root collection", async () => {
      await setupPicker({
        initialValue: { id: rootDashboardQuestion.id, model: "card" },
      });

      expect(
        await (await level(0)).findByRole("link", { name: /Our Analytics/ }),
      ).toHaveAttribute("data-active", "true");

      expect(
        await (await level(1)).findByRole("link", { name: /Root Dashboard/ }),
      ).toHaveAttribute("data-active", "true");

      expect(
        await (await level(2)).findByRole("link", { name: /DQ in Root/ }),
      ).toHaveAttribute("data-active", "true");
    });

    it("should render the path to a dashboard question in a nested collection", async () => {
      await setupPicker({
        initialValue: { id: nestedDashboardQuestion.id, model: "card" },
      });

      expect(
        await (await level(0)).findByRole("link", { name: /Our Analytics/ }),
      ).toHaveAttribute("data-active", "true");

      expect(
        await (await level(1)).findByRole("link", { name: /Collection 4/ }),
      ).toHaveAttribute("data-active", "true");

      expect(
        await (await level(2)).findByRole("link", { name: /Collection 3/ }),
      ).toHaveAttribute("data-active", "true");

      expect(
        await (await level(3)).findByRole("link", { name: /Nested Dashboard/ }),
      ).toHaveAttribute("data-active", "true");

      expect(
        await (await level(4)).findByRole("link", { name: /Nested DQ/ }),
      ).toHaveAttribute("data-active", "true");
    });
  });
});

describe("QuestionPickerModal", () => {
  it("should render the modal", async () => {
    await setupModal();

    expect(
      await screen.findByText(/choose a question or model/i),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole("link", { name: /Our Analytics/ }),
    ).toBeInTheDocument();

    expect(
      screen.queryByRole("button", { name: /Select/ }),
    ).not.toBeInTheDocument();
  });

  it("should render the modal with a select button", async () => {
    await setupModal({
      options: { ...defaultOptions, hasConfirmButtons: true },
    });

    expect(
      await screen.findByText(/choose a question or model/i),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole("link", { name: /Our Analytics/ }),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole("button", { name: /Select/ }),
    ).toBeInTheDocument();
  });

  it("should render model and question tabs by default", async () => {
    await setupModal();

    expect(
      await screen.findByRole("tab", { name: /Questions/ }),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole("tab", { name: /Models/ }),
    ).toBeInTheDocument();
  });

  it("should render the metric tab if explicitly enabled", async () => {
    await setupModal({ models: ["card", "dataset", "metric"] });

    expect(
      await screen.findByRole("tab", { name: /Questions/ }),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole("tab", { name: /Models/ }),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole("tab", { name: /Metrics/ }),
    ).toBeInTheDocument();
  });

  it("can render a single tab (which hides the tab bar)", async () => {
    await setupModal({ models: ["dataset"] });

    expect(
      await screen.findByText(/choose a question or model/i),
    ).toBeInTheDocument();
    expect(screen.queryByRole("tablist")).not.toBeInTheDocument();
    expect(screen.queryByRole("tab")).not.toBeInTheDocument();
  });

  it("should auto-select the question tab when a question is selected", async () => {
    await setupModal({
      initialValue: { id: 100, model: "card" },
    });

    expect(
      await screen.findByRole("tab", { name: /Questions/ }),
    ).toHaveAttribute("aria-selected", "true");
    expect(await screen.findByRole("tab", { name: /Models/ })).toHaveAttribute(
      "aria-selected",
      "false",
    );

    expect(
      await screen.findByRole("link", { name: /Nested Question/ }),
    ).toHaveAttribute("data-active", "true");
  });

  it("should auto-select the model tab when a model is selected", async () => {
    await setupModal({
      initialValue: { id: 101, model: "dataset" },
    });

    expect(
      await screen.findByRole("tab", { name: /Questions/ }),
    ).toHaveAttribute("aria-selected", "false");
    expect(await screen.findByRole("tab", { name: /Models/ })).toHaveAttribute(
      "aria-selected",
      "true",
    );

    expect(
      await screen.findByRole("link", { name: /My Model/ }),
    ).toHaveAttribute("data-active", "true");
  });

  it("should auto-select the metric tab when a metric is selected", async () => {
    await setupModal({
      initialValue: { id: 102, model: "metric" },
      models: ["card", "dataset", "metric"],
    });

    expect(
      await screen.findByRole("tab", { name: /Questions/ }),
    ).toHaveAttribute("aria-selected", "false");
    expect(await screen.findByRole("tab", { name: /Metrics/ })).toHaveAttribute(
      "aria-selected",
      "true",
    );

    expect(
      await screen.findByRole("link", { name: /My Metric/ }),
    ).toHaveAttribute("data-active", "true");
  });

  it("should automatically switch to the search tab when a search query is provided", async () => {
    setupSearchEndpoints([]);
    await setupModal();

    const searchInput = await screen.findByPlaceholderText(/search/i);

    expect(
      await screen.findByRole("tab", { name: /Questions/ }),
    ).toHaveAttribute("aria-selected", "true");

    await userEvent.type(searchInput, "sizzlipede");

    expect(
      await screen.findByRole("tab", { name: /Questions/ }),
    ).toHaveAttribute("aria-selected", "false");
    expect(await screen.findByRole("tab", { name: /Search/ })).toHaveAttribute(
      "aria-selected",
      "true",
    );

    await screen.findByText(/Didn't find anything/i);
  });

  it("should switch back to the default tab when the search query is cleared", async () => {
    setupSearchEndpoints([]);
    await setupModal();

    const searchInput = await screen.findByPlaceholderText(/search/i);

    expect(
      await screen.findByRole("tab", { name: /Questions/ }),
    ).toHaveAttribute("aria-selected", "true");

    await userEvent.type(searchInput, "sizzlipede");

    expect(
      await screen.findByRole("tab", { name: /Questions/ }),
    ).toHaveAttribute("aria-selected", "false");
    expect(await screen.findByRole("tab", { name: /Search/ })).toHaveAttribute(
      "aria-selected",
      "true",
    );

    await screen.findByText(/Didn't find anything/i);

    await userEvent.clear(searchInput);

    expect(
      await screen.findByRole("tab", { name: /Questions/ }),
    ).toHaveAttribute("aria-selected", "true");
    expect(
      screen.queryByRole("tab", { name: /Search/ }),
    ).not.toBeInTheDocument();
  });

  it("should be able to search for metrics", async () => {
    await setupSearchEndpoints([nestedQuestion, myModel, myMetric]);
    await setupModal({ models: ["card", "dataset", "metric"] });
    // Need to wait for the collections tab to render
    expect(
      await screen.findByRole("link", { name: /Our Analytics/ }),
    ).toBeInTheDocument();
    const searchInput = await screen.findByPlaceholderText(/search/i);
    await userEvent.type(searchInput, myMetric.name);
    await userEvent.click(await screen.findByText("Everywhere"));
    expect(await screen.findByText(myMetric.name)).toBeInTheDocument();
    expect(screen.queryByText(nestedQuestion.name)).not.toBeInTheDocument();
  });
});
