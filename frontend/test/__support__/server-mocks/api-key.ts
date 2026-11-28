import fetchMock, { type CallLog } from "fetch-mock";

import type { ApiKey, Group } from "metabase-types/api";

// fetch-mock reads a bare number as an HTTP status and cannot build a body
// from one, so the count goes out as JSON text.
const countResponse = (count: number) => ({
  body: JSON.stringify(count),
  headers: { "content-type": "application/json" },
});

export function setupApiKeyEndpoints(apiKeys: ApiKey[]) {
  fetchMock.get("path:/api/api-key", apiKeys);
  fetchMock.get("path:/api/api-key/count", countResponse(apiKeys.length));
  fetchMock.post("path:/api/api-key", 200);
}

type StatefulApiKeyGroup = Pick<Group, "id" | "name">;

const parseBody = (call: CallLog): unknown =>
  JSON.parse(String(call.options.body ?? "{}"));

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const getField = (value: unknown, key: string): unknown =>
  isRecord(value) ? value[key] : undefined;

const getId = (call: CallLog) => Number(call.expressParams?.id);

const maskKey = (unmaskedKey: string) => `${unmaskedKey.slice(0, 7)}****`;

/**
 * An in-memory stand-in for the `/api/api-key` endpoints. Each handler branches
 * on the request (key id, name, group id) and changes the stored keys itself,
 * so the UI only shows a change after the request that makes it. Unknown ids
 * get a 404, and a name that is already taken gets the backend's 400.
 *
 * Every created or regenerated key gets the next `mb_<n>…` unmasked key, so
 * tests can tell the keys apart. Returns the store for assertions.
 */
export function setupStatefulApiKeyEndpoints({
  apiKeys,
  groups,
}: {
  apiKeys: ApiKey[];
  groups: StatefulApiKeyGroup[];
}) {
  const store = { apiKeys: [...apiKeys], issuedKeys: 0 };

  const issueKey = () => {
    store.issuedKeys += 1;
    return `mb_${store.issuedKeys}Key${"x".repeat(36)}`;
  };
  const findGroup = (groupId: unknown) =>
    groups.find((group) => group.id === groupId);
  const findKey = (call: CallLog) =>
    store.apiKeys.find((apiKey) => apiKey.id === getId(call));
  const isNameTaken = (name: unknown, exceptId?: number) =>
    store.apiKeys.some(
      (apiKey) => apiKey.name === name && apiKey.id !== exceptId,
    );
  const nameTakenResponse = {
    status: 400,
    body: { errors: { name: "An API key with this name already exists." } },
  };

  fetchMock.get("path:/api/api-key", () => store.apiKeys);
  fetchMock.get("path:/api/api-key/count", () =>
    countResponse(store.apiKeys.length),
  );

  fetchMock.post("path:/api/api-key", (call) => {
    const body = parseBody(call);
    const name = getField(body, "name");
    const group = findGroup(getField(body, "group_id"));
    if (typeof name !== "string" || !group) {
      return 400;
    }
    if (isNameTaken(name)) {
      return nameTakenResponse;
    }
    const unmaskedKey = issueKey();
    const apiKey: ApiKey = {
      id: Math.max(0, ...store.apiKeys.map(({ id }) => id)) + 1,
      name,
      group: { id: group.id, name: group.name },
      creator_id: 1,
      masked_key: maskKey(unmaskedKey),
      created_at: "2024-01-01T00:00:00Z",
      updated_at: "2024-01-01T00:00:00Z",
      updated_by: { id: 1, common_name: "Bobby Tables" },
    };
    store.apiKeys = [...store.apiKeys, apiKey];
    return { ...apiKey, unmasked_key: unmaskedKey };
  });

  fetchMock.put("express:/api/api-key/:id/regenerate", (call) => {
    const apiKey = findKey(call);
    if (!apiKey) {
      return 404;
    }
    const unmaskedKey = issueKey();
    const maskedKey = maskKey(unmaskedKey);
    store.apiKeys = store.apiKeys.map((key) =>
      key.id === apiKey.id ? { ...key, masked_key: maskedKey } : key,
    );
    return {
      id: apiKey.id,
      unmasked_key: unmaskedKey,
      masked_key: maskedKey,
      prefix: unmaskedKey.slice(0, 7),
    };
  });

  fetchMock.put("express:/api/api-key/:id", (call) => {
    const apiKey = findKey(call);
    if (!apiKey) {
      return 404;
    }
    const body = parseBody(call);
    const name = getField(body, "name");
    const groupId = getField(body, "group_id");
    const group = groupId === undefined ? apiKey.group : findGroup(groupId);
    if (!group) {
      return 400;
    }
    if (isNameTaken(name, apiKey.id)) {
      return nameTakenResponse;
    }
    const updated: ApiKey = {
      ...apiKey,
      name: typeof name === "string" ? name : apiKey.name,
      group: { id: group.id, name: group.name },
    };
    store.apiKeys = store.apiKeys.map((key) =>
      key.id === apiKey.id ? updated : key,
    );
    return updated;
  });

  fetchMock.delete("express:/api/api-key/:id", (call) => {
    if (!findKey(call)) {
      return 404;
    }
    store.apiKeys = store.apiKeys.filter((key) => key.id !== getId(call));
    return 204;
  });

  return store;
}
