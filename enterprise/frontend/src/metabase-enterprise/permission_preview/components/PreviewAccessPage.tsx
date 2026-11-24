import { useMediaQuery } from "@mantine/hooks";
import { useCallback, useEffect, useState } from "react";
import { t } from "ttag";

import { PermissionsEditorEmptyState } from "metabase/admin/permissions/components/PermissionsEditor";
import { PermissionsPageLayout } from "metabase/admin/permissions/components/PermissionsPageLayout";
import { Sidesheet } from "metabase/common/components/Sidesheet";
import {
  ALL_COLLECTIONS_ITEM,
  getLinkText,
} from "metabase/embedding/permission-preview/item";
import { Box, Flex, Loader, Text } from "metabase/ui";
import {
  useEndPermissionPreviewMutation,
  useStartPermissionPreviewMutation,
} from "metabase-enterprise/api";
import type { PermissionPreviewSession } from "metabase-types/api";

import { getRefusalMessage } from "../utils/refusal";

import { AttributeBar } from "./AttributeBar";
import { ExplainAccess } from "./ExplainAccess/ExplainAccess";
import { PreviewBand } from "./PreviewBand";
import { PreviewFrame } from "./PreviewFrame";
import { PreviewSidebar } from "./PreviewSidebar";
import type { PreviewTarget } from "./types";

export function PreviewAccessPage() {
  const [target, setTarget] = useState<PreviewTarget | null>(null);

  return (
    <PermissionsPageLayout tab="preview-access">
      <PreviewSidebar target={target} onSelect={setTarget} />
      <Flex flex={1} miw={0} mih={0} h="100%">
        {target ? (
          <Preview target={target} />
        ) : (
          <PermissionsEditorEmptyState
            icon="eye"
            message={t`Select a user or group to see what they can open`}
          />
        )}
      </Flex>
    </PermissionsPageLayout>
  );
}

interface PickedAttributes {
  targetKey: string;
  values: Record<string, string>;
}

interface PreviewProps {
  target: PreviewTarget;
}

function Preview({ target }: PreviewProps) {
  const [startPreview] = useStartPermissionPreviewMutation();
  const [endPreview] = useEndPermissionPreviewMutation();
  const [session, setSession] = useState<PermissionPreviewSession | null>(null);
  const [refusal, setRefusal] = useState<string | null>(null);
  const [frameItem, setFrameItem] = useState(ALL_COLLECTIONS_ITEM);
  const [openCount, setOpenCount] = useState(0);
  const [linkText, setLinkText] = useState(getLinkText(ALL_COLLECTIONS_ITEM));
  const [isExplainOpen, setIsExplainOpen] = useState(false);
  const [pickedAttributes, setPickedAttributes] = useState<PickedAttributes>({
    targetKey: "",
    values: {},
  });
  const [loadedFrame, setLoadedFrame] = useState<string | null>(null);
  const isWide = useMediaQuery("(min-width: 80rem)");

  const targetId = getTargetId(target);
  const targetKey = `${target.kind}:${targetId}`;
  // the values picked for a group are dropped when another person is picked
  if (pickedAttributes.targetKey !== targetKey) {
    setPickedAttributes({ targetKey, values: {} });
  }
  const attributes = pickedAttributes.values;
  const attributesKey = JSON.stringify(attributes);

  useEffect(() => {
    let isCurrent = true;
    let startedSession: PermissionPreviewSession | null = null;

    setRefusal(null);

    startPreview(getStartBody(target.kind, targetId, attributes))
      .unwrap()
      .then((started) => {
        if (isCurrent) {
          startedSession = started;
          setSession(started);
        } else {
          endPreview(started.id);
        }
      })
      .catch((error) => {
        if (isCurrent) {
          setSession(null);
          setRefusal(getRefusalMessage(error));
        }
      });

    return () => {
      isCurrent = false;
      setSession(null);
      if (startedSession) {
        endPreview(startedSession.id);
      }
    };
    // `attributes` is read through its key, so a new object alone doesn't restart
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target.kind, targetId, attributesKey, startPreview, endPreview]);

  useEffect(() => {
    if (!session) {
      return;
    }
    const sessionId = session.id;

    function handlePageHide() {
      fetch(`/api/ee/permission_debug/preview/session/${sessionId}`, {
        method: "DELETE",
        keepalive: true,
      });
    }

    window.addEventListener("pagehide", handlePageHide);
    return () => window.removeEventListener("pagehide", handlePageHide);
  }, [session]);

  const openItem = useCallback((item: string) => {
    setFrameItem(item);
    setOpenCount((count) => count + 1);
  }, []);

  function handleOpen(item: string, text: string) {
    openItem(item);
    setLinkText(text);
  }

  function handleApplyAttribute(name: string, value: string) {
    const { [name]: _previous, ...others } = attributes;
    setPickedAttributes({
      targetKey,
      values: value ? { ...others, [name]: value } : others,
    });
  }

  const handleLocationChange = useCallback((item: string) => {
    setFrameItem(item);
    setLinkText(getLinkText(item));
  }, []);

  const name = getTargetName(target);
  const frameKey = session ? `${session.id}:${openCount}` : null;
  const isLoading = !refusal && (!session || loadedFrame !== frameKey);

  return (
    <>
      <Flex flex={1} direction="column" miw={0} p="md" gap="sm">
        <PreviewBand
          target={target}
          isStarted={session != null}
          linkText={linkText}
          frameKey={frameKey}
          onOpenLink={handleOpen}
          onGoHome={() =>
            handleOpen(ALL_COLLECTIONS_ITEM, getLinkText(ALL_COLLECTIONS_ITEM))
          }
          isExplainOpen={isExplainOpen}
          onToggleExplain={() => setIsExplainOpen((isOpen) => !isOpen)}
        />
        {target.kind === "group" && (
          <AttributeBar
            group={target.group}
            values={attributes}
            onApply={handleApplyAttribute}
          />
        )}
        {refusal && <Text c="feedback-negative">{refusal}</Text>}
        <Box
          flex={1}
          mih={0}
          pos="relative"
          bdrs="md"
          style={{
            border: "1px solid var(--mb-color-border-neutral-strong)",
            overflow: "hidden",
          }}
        >
          {session && (
            <PreviewFrame
              key={frameKey}
              token={session.token}
              name={name}
              initialItem={frameItem}
              onLoad={() => setLoadedFrame(frameKey)}
              onLocationChange={handleLocationChange}
            />
          )}
          {isLoading && (
            <Flex
              pos="absolute"
              inset={0}
              direction="column"
              align="center"
              justify="center"
              gap="md"
              bg="background_page-primary"
              style={{ zIndex: 1 }}
            >
              <Loader />
              <Text c="text-secondary">{t`Loading ${name}'s view…`}</Text>
            </Flex>
          )}
        </Box>
      </Flex>
      {session && isExplainOpen && isWide && (
        <Box
          component="aside"
          flex="0 0 auto"
          w="30rem"
          style={{ borderLeft: "1px solid var(--mb-color-border-neutral)" }}
        >
          <ExplainAccess
            target={target}
            userId={session.user_id}
            item={frameItem}
            onClose={() => setIsExplainOpen(false)}
          />
        </Box>
      )}
      {session && isExplainOpen && !isWide && (
        <Sidesheet
          isOpen
          size="sm"
          withOverlay={false}
          onClose={() => setIsExplainOpen(false)}
        >
          <ExplainAccess
            target={target}
            userId={session.user_id}
            item={frameItem}
          />
        </Sidesheet>
      )}
    </>
  );
}

function getTargetId(target: PreviewTarget) {
  return target.kind === "user" ? target.user.id : target.group.id;
}

function getStartBody(
  kind: PreviewTarget["kind"],
  id: number,
  attributes: Record<string, string>,
) {
  if (kind === "user") {
    return { user_id: id };
  }
  return Object.keys(attributes).length > 0
    ? { group_id: id, attributes }
    : { group_id: id };
}

function getTargetName(target: PreviewTarget) {
  return target.kind === "user" ? target.user.common_name : target.group.name;
}
