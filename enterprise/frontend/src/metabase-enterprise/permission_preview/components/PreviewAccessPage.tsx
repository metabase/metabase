import { useMediaQuery } from "@mantine/hooks";
import { useCallback, useEffect, useState } from "react";
import { t } from "ttag";

import { PermissionsEditorEmptyState } from "metabase/admin/permissions/components/PermissionsEditor";
import { PermissionsPageLayout } from "metabase/admin/permissions/components/PermissionsPageLayout";
import { Sidesheet } from "metabase/common/components/Sidesheet";
import {
  ALL_COLLECTIONS_ITEM,
  getItemFromLink,
  getLinkText,
} from "metabase/embedding/permission-preview/item";
import { Box, Center, Flex, Stack, Text } from "metabase/ui";
import {
  useEndPermissionPreviewMutation,
  useStartPermissionPreviewMutation,
} from "metabase-enterprise/api";
import type { PermissionPreviewSession } from "metabase-types/api";

import { getRefusalMessage } from "../utils/refusal";

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
      <Flex flex={1} direction="column" mih={0} h="100%">
        {target ? (
          <Preview target={target} />
        ) : (
          <PermissionsEditorEmptyState
            icon="eye"
            message={t`Select a user or group to see what they can open.`}
          />
        )}
      </Flex>
    </PermissionsPageLayout>
  );
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
  const isWide = useMediaQuery("(min-width: 80rem)");

  const targetId = target.kind === "user" ? target.user.id : target.group.id;

  useEffect(() => {
    let isCurrent = true;
    let startedSession: PermissionPreviewSession | null = null;

    setRefusal(null);

    startPreview(
      target.kind === "user" ? { user_id: targetId } : { group_id: targetId },
    )
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
  }, [target.kind, targetId, startPreview, endPreview]);

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

  function handleOpenLink(link: string) {
    openItem(getItemFromLink(link));
    setLinkText(link);
  }

  const handleLocationChange = useCallback((item: string) => {
    setFrameItem(item);
    setLinkText(getLinkText(item));
  }, []);

  return (
    <Stack flex={1} gap={0} mih={0}>
      <PreviewBand
        target={target}
        linkText={linkText}
        onOpenLink={handleOpenLink}
        onGoHome={() => {
          openItem(ALL_COLLECTIONS_ITEM);
          setLinkText(getLinkText(ALL_COLLECTIONS_ITEM));
        }}
        isExplainOpen={isExplainOpen}
        onToggleExplain={() => setIsExplainOpen((isOpen) => !isOpen)}
      />
      <Flex flex={1} mih={0}>
        <Box flex={1} mih={0} display="flex">
          {session && (
            <PreviewFrame
              key={`${session.id}:${openCount}`}
              token={session.token}
              name={getTargetName(target)}
              initialItem={frameItem}
              onLocationChange={handleLocationChange}
            />
          )}
          {!session && (
            <Center flex={1}>
              <Text c="text-secondary">
                {refusal ?? t`Loading ${getTargetName(target)}'s view…`}
              </Text>
            </Center>
          )}
        </Box>
        {session && isExplainOpen && isWide && (
          <Box
            component="aside"
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
      </Flex>
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
    </Stack>
  );
}

function getTargetName(target: PreviewTarget) {
  return target.kind === "user" ? target.user.common_name : target.group.name;
}
