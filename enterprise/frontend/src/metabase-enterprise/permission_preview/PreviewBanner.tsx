import { useEffect, useState } from "react";
import { t } from "ttag";

import { Box, Button, Group, Text } from "metabase/ui";

import {
  AttributeValueSelect,
  getAttributeValues,
} from "./AttributeValueSelect";
import type { PreviewAttribute, StartPreviewResponse } from "./api";
import {
  type PreviewState,
  clearPreviewState,
  getPreviewUrl,
} from "./preview-state";

/**
 * The banner of a tab that previews the app as another user, with the way back to the admin's own
 * view. A group preview also shows the attribute values it runs with, and changing one reloads the
 * view with the new value.
 */
export function PreviewBanner({ state }: { state: PreviewState }) {
  const attributes = useGroupAttributes(state);
  const [isChanging, setIsChanging] = useState(false);

  const handleExit = () => {
    clearPreviewState();
    // a full load, so nothing fetched as the previewed user stays cached
    window.location.assign(state.returnPath);
  };

  const handleAttributeChange = async (attribute: string, value: string) => {
    setIsChanging(true);
    const values = {
      ...getAttributeValues(attributes, state.attributes),
      [attribute]: value,
    };
    const result = await restartPreview(state, values);
    if (result == null) {
      setIsChanging(false);
      return;
    }
    window.location.assign(
      getPreviewUrl(
        `${window.location.pathname}${window.location.search}${window.location.hash}`,
        { ...state, userId: result.user_id, attributes: result.attributes },
      ),
    );
  };

  return (
    <Group
      role="status"
      aria-label={t`Previewing as another user`}
      justify="center"
      gap="md"
      px="md"
      py="xs"
      bg="feedback-warning"
    >
      <Text fw="bold" c="text-primary">
        {getWhoText(state)}
      </Text>
      {attributes.map((attribute) => (
        <Group key={attribute.attribute} gap="xs" wrap="nowrap">
          <Text c="text-primary">{`${attribute.attribute}:`}</Text>
          <Box w="12rem">
            <AttributeValueSelect
              attribute={attribute}
              size="xs"
              value={state.attributes[attribute.attribute] ?? ""}
              onChange={(value) =>
                handleAttributeChange(attribute.attribute, value)
              }
            />
          </Box>
        </Group>
      ))}
      <Button size="compact-sm" loading={isChanging} onClick={handleExit}>
        {t`Exit preview`}
      </Button>
    </Group>
  );
}

function getWhoText(state: PreviewState) {
  switch (state.principalType) {
    case "group":
      return t`You're viewing the app as the group ${state.principalName}. Read-only: changes aren't allowed.`;
    case "tenant":
      return t`You're viewing the app as the tenant ${state.principalName}. Read-only: changes aren't allowed.`;
    default:
      return t`You're viewing the app as ${state.userName}. Read-only: changes aren't allowed.`;
  }
}

function useGroupAttributes(state: PreviewState) {
  const [attributes, setAttributes] = useState<PreviewAttribute[]>([]);

  useEffect(() => {
    if (state.principalType !== "group") {
      return;
    }
    fetchAsAdmin(
      `/api/ee/permission_debug/preview/attributes?group-id=${state.principalId}`,
    ).then((response) => {
      if (Array.isArray(response)) {
        // the endpoint's response schema (`PreviewAttributesResponse` in permission_debug/impl.clj) guarantees the shape
        setAttributes(response as PreviewAttribute[]);
      }
    });
  }, [state.principalType, state.principalId]);

  return attributes;
}

async function restartPreview(
  state: PreviewState,
  attributes: Record<string, string>,
): Promise<StartPreviewResponse | null> {
  const response = await fetchAsAdmin(
    "/api/ee/permission_debug/preview/start",
    {
      method: "POST",
      body: JSON.stringify({
        principal_type: state.principalType,
        principal_id: state.principalId,
        attributes,
      }),
    },
  );
  return isStartPreviewResponse(response) ? response : null;
}

function isStartPreviewResponse(
  response: unknown,
): response is StartPreviewResponse {
  return (
    typeof response === "object" &&
    response != null &&
    "user_id" in response &&
    typeof response.user_id === "number" &&
    "attributes" in response
  );
}

// Plain `fetch`, not the API client: the client sends this tab's `X-Metabase-Preview-As`, and these
// admin-only calls must run as the admin.
async function fetchAsAdmin(url: string, init?: RequestInit): Promise<unknown> {
  const response = await fetch(url, {
    ...init,
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
  });
  return response.ok ? response.json() : null;
}
