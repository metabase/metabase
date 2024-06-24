import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { mockSettings } from "__support__/settings";
import { msToMinutes, msToHours } from "metabase/lib/time";

import QuestionCacheTTLField from "./QuestionCacheTTLField";

const TEN_MINUTES = 10 * 60 * 1000;

function setup({
  value = null,
  avgQueryDuration,
  databaseCacheTTL = null,
  cacheTTLMultiplier,
  minCacheThreshold,
} = {}) {
  const onChange = jest.fn();

  mockSettings({
    "query-caching-ttl-ratio": cacheTTLMultiplier,
    "query-caching-min-ttl": minCacheThreshold,
  });

  const question = {
    card: () => ({
      average_query_time: avgQueryDuration,
      cache_ttl: value,
    }),
    database: () => ({
      cache_ttl: databaseCacheTTL,
    }),
  };

  render(
    <form>
      <span id="cache_ttl-label">Label</span>
      <QuestionCacheTTLField
        field={{ name: "cache_ttl", value, onChange }}
        question={question}
      />
    </form>,
  );
  return { onChange, avgQueryDuration };
}

const DEFAULT_MODE_REGEXP = /Use default \([.0-9]+ hours\)/;

async function selectMode(nextMode) {
  const currentModeLabel =
    nextMode === "custom" ? DEFAULT_MODE_REGEXP : "Custom";
  const nextModeLabel = nextMode === "default" ? DEFAULT_MODE_REGEXP : "Custom";

  await userEvent.click(screen.getByText(currentModeLabel));
  await userEvent.click(screen.getByText(nextModeLabel));
}

async function fillValue(input, value) {
  await userEvent.clear(input);
  await userEvent.type(input, String(value));
  input.blur();
}

describe("QuestionCacheTTLField", () => {
  it("displays a placeholder if question is not cached", () => {
    setup();
    expect(screen.getByLabelText("Label")).toHaveAttribute("placeholder", "24");
  });

  it("displays question's cache TTL value", () => {
    setup({ value: 21 });
    expect(screen.getByLabelText("Label")).toHaveValue("21");
  });

  it("displays default caching value if question is cached on a db level", () => {
    setup({ databaseCacheTTL: 32 });
    expect(screen.getByLabelText("Use default (32 hours)")).toBeInTheDocument();
  });

  it("displays default caching value if question is cached on an instance level", () => {
    setup({
      avgQueryDuration: TEN_MINUTES,
      minCacheThreshold: 0,
      cacheTTLMultiplier: 100,
    });
    const expectedTTL = Math.round(msToHours(TEN_MINUTES * 100));
    const expectedLabel = `Use default (${expectedTTL} hours)`;
    expect(screen.getByLabelText(expectedLabel)).toBeInTheDocument();
  });

  it("handles if cache duration is in minutes", () => {
    setup({
      avgQueryDuration: 14400,
      minCacheThreshold: 0,
      cacheTTLMultiplier: 100,
    });
    const expectedTTL = Math.round(msToMinutes(14400 * 100));
    const expectedLabel = `Use default (${expectedTTL} minutes)`;
    expect(screen.getByLabelText(expectedLabel)).toBeInTheDocument();
  });

  it("calls onChange correctly when filling the input", async () => {
    const { onChange } = setup();
    await fillValue(screen.getByLabelText("Label"), 48);
    expect(onChange).toHaveBeenLastCalledWith(48);
  });

  it("offers to provide custom cache TTL when question is cached on a db level", () => {
    setup({ databaseCacheTTL: 32 });

    expect(screen.queryByLabelText("Use default (32 hours)")).toBeChecked();
    expect(screen.queryByLabelText("Custom")).not.toBeChecked();
  });

  it("allows to overwrite default caching with custom value", async () => {
    const { onChange } = setup({ databaseCacheTTL: 32 });

    await selectMode("custom");
    await fillValue(screen.getByLabelText("Label"), 24);

    expect(onChange).toHaveBeenLastCalledWith(24);
  });

  it("offers to switch to default caching instead of a custom TTL", async () => {
    setup({ value: 24, databaseCacheTTL: 32 });

    expect(screen.queryByLabelText("Use default (32 hours)")).not.toBeChecked();
    expect(screen.queryByLabelText("Custom")).toBeChecked();
  });

  it("allows to switch to default caching instead of a custom TTL", async () => {
    const { onChange } = setup({ value: 24, databaseCacheTTL: 32 });
    await selectMode("default");
    expect(onChange).toHaveBeenLastCalledWith(null);
  });
});
