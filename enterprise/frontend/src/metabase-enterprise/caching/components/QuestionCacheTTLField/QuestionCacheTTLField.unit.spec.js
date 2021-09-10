import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import MetabaseSettings from "metabase/lib/settings";
import { QuestionCacheTTLField } from "./QuestionCacheTTLField";

const TEN_MINUTES = 10 * 60 * 1000;
const CACHE_MULTIPLIER = 10;

function setup({
  value = null,
  avgQueryDuration = TEN_MINUTES,
  databaseCacheTTL = null,
  cacheTTLMultiplier,
  minCacheThreshold,
} = {}) {
  const onChange = jest.fn();

  const spy = jest.spyOn(MetabaseSettings, "get");
  spy.mockImplementation(key => {
    if (key === "enable-query-caching") {
      return true;
    }
    if (key === "query-caching-ttl-ratio") {
      return cacheTTLMultiplier;
    }
    if (key === "query-caching-min-ttl") {
      return minCacheThreshold;
    }
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

function selectMode(nextMode) {
  const currentModeLabel =
    nextMode === "custom" ? DEFAULT_MODE_REGEXP : "Custom";
  const nextModeLabel = nextMode === "default" ? DEFAULT_MODE_REGEXP : "Custom";

  userEvent.click(screen.getByText(currentModeLabel));
  userEvent.click(screen.getByText(nextModeLabel));
}

function fillValue(input, value) {
  userEvent.clear(input);
  userEvent.type(input, String(value));
  input.blur();
}

function msToHours(ms) {
  const seconds = ms / 1000;
  const minutes = seconds / 60;
  const hours = minutes / 60;
  return Math.round(hours);
}

function getExpectedMagicCacheTTL(avgQueryDurationMs, multiplier) {
  const hours = msToHours(avgQueryDurationMs * multiplier);
  return hours >= 1 ? hours : (hours / 60).toFixed(2);
}

const DEFAULT_MODE_TEXT_TEST_ID = /radio-[0-9]+-default-name/;

describe("QuestionCacheTTLField", () => {
  it("displays 0 if question is not cached", () => {
    setup();
    expect(screen.getByLabelText("Label")).toHaveValue("0");
  });

  it("displays question's cache TTL value", () => {
    setup({ value: 21 });
    expect(screen.getByLabelText("Label")).toHaveValue("21");
  });

  it("displays default caching value if question is cached on a db level", () => {
    setup({ databaseCacheTTL: 32 });
    expect(screen.queryByTestId(DEFAULT_MODE_TEXT_TEST_ID)).toHaveTextContent(
      "Use default (32 hours)",
    );
  });

  it("displays default caching value if question is cached on an instance level", () => {
    const { avgQueryDuration } = setup({
      minCacheThreshold: 0,
      cacheTTLMultiplier: CACHE_MULTIPLIER,
    });
    const expectedTTL = getExpectedMagicCacheTTL(
      avgQueryDuration,
      CACHE_MULTIPLIER,
    );
    console.log("### EXPECTED", expectedTTL);
    expect(screen.queryByTestId(DEFAULT_MODE_TEXT_TEST_ID)).toHaveTextContent(
      `Use default (${expectedTTL} hours)`,
    );
  });

  it("calls onChange correctly when filling the input", () => {
    const { onChange } = setup();
    fillValue(screen.getByLabelText("Label"), 48);
    expect(onChange).toHaveBeenLastCalledWith(48);
  });

  it("offers to provide custom cache TTL when question is cached on a db level", () => {
    setup({ databaseCacheTTL: 32 });

    expect(screen.queryByLabelText("Use default (32 hours)")).toBeChecked();
    expect(screen.queryByLabelText("Custom")).not.toBeChecked();
  });

  it("allows to overwrite default caching with custom value", () => {
    const { onChange } = setup({ databaseCacheTTL: 32 });

    selectMode("custom");
    fillValue(screen.getByLabelText("Label"), 24);

    expect(onChange).toHaveBeenLastCalledWith(24);
  });

  it("offers to switch to default caching instead of a custom TTL", () => {
    setup({ value: 24, databaseCacheTTL: 32 });

    expect(screen.queryByLabelText("Use default (32 hours)")).not.toBeChecked();
    expect(screen.queryByLabelText("Custom")).toBeChecked();
  });

  it("allows to switch to default caching instead of a custom TTL", () => {
    const { onChange } = setup({ value: 24, databaseCacheTTL: 32 });
    selectMode("default");
    expect(onChange).toHaveBeenLastCalledWith(null);
  });
});
