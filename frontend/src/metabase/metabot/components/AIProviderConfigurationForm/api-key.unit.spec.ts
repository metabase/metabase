import {
  createMockLlmProviderField,
  createMockLlmProviderType,
} from "metabase-types/api/mocks";

import { findProviderTypeForApiKey } from "./api-key";

const apiKeyField = (prefix?: string) =>
  createMockLlmProviderField({
    key: "api-key",
    label: "API key",
    type: "password",
    required: true,
    prefix,
  });

const ANTHROPIC = createMockLlmProviderType({
  type: "anthropic",
  label: "Anthropic",
  fields: [apiKeyField("sk-ant-")],
});

const OPENAI = createMockLlmProviderType({
  type: "openai",
  label: "OpenAI",
  fields: [apiKeyField("sk-")],
});

const OPENROUTER = createMockLlmProviderType({
  type: "openrouter",
  label: "OpenRouter",
  fields: [apiKeyField("sk-or-v1-")],
});

const AZURE = createMockLlmProviderType({
  type: "azure",
  label: "Microsoft Azure",
  fields: [apiKeyField()],
});

const ALL = [ANTHROPIC, OPENAI, OPENROUTER, AZURE];

describe("findProviderTypeForApiKey", () => {
  it.each([
    ["sk-ant-api03-abc123", "anthropic"],
    ["sk-proj-abc123", "openai"],
    ["sk-or-v1-abc123", "openrouter"],
  ])("matches %s to %s", (apiKey, expected) => {
    expect(findProviderTypeForApiKey(ALL, apiKey)?.providerType.type).toBe(
      expected,
    );
  });

  it("prefers the most specific prefix over a shorter one that also matches", () => {
    // Both `sk-` (OpenAI) and `sk-ant-` (Anthropic) match, regardless of list order
    expect(
      findProviderTypeForApiKey([OPENAI, ANTHROPIC], "sk-ant-api03-abc123")
        ?.providerType.type,
    ).toBe("anthropic");
    expect(
      findProviderTypeForApiKey([ANTHROPIC, OPENAI], "sk-ant-api03-abc123")
        ?.providerType.type,
    ).toBe("anthropic");
  });

  it("reports which field the key belongs in", () => {
    expect(findProviderTypeForApiKey(ALL, "sk-ant-api03-abc")?.fieldKey).toBe(
      "api-key",
    );
  });

  it("ignores a key that matches no declared prefix", () => {
    expect(findProviderTypeForApiKey(ALL, "azure-key-abc")).toBeUndefined();
    expect(findProviderTypeForApiKey(ALL, "")).toBeUndefined();
  });

  it("skips provider types that cannot be connected", () => {
    const unavailable = createMockLlmProviderType({
      ...ANTHROPIC,
      available: false,
    });
    expect(findProviderTypeForApiKey([unavailable], "sk-ant-abc")).toBe(
      undefined,
    );

    const managed = createMockLlmProviderType({
      ...ANTHROPIC,
      managed: true,
    });
    expect(findProviderTypeForApiKey([managed], "sk-ant-abc")).toBe(undefined);
  });
});
