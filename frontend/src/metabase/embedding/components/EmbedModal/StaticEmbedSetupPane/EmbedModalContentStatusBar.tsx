import { useState } from "react";
import { match } from "ts-pattern";
import { t } from "ttag";

import CS from "metabase/css/core/index.css";
import type { EmbedResourceType } from "metabase/embedding/types";
import { Box, Button, Flex, Group, Text, Tooltip } from "metabase/ui";

interface EmbedModalContentStatusBarProps {
  isPublished: boolean;
  resourceType: EmbedResourceType;
  hasSettingsChanges: boolean;
  isFetching?: boolean;
  // When the resource can't be written (e.g. a remote-synced entity on a
  // read-only instance) publishing and unpublishing are disabled, since those
  // writes would fail; an explanatory tooltip replaces the action.
  isReadOnly?: boolean;
  onDiscard: () => void;
  onUnpublish: () => Promise<void>;
  onSave: () => Promise<void>;
}

export const EmbedModalContentStatusBar = ({
  isPublished,
  resourceType,
  hasSettingsChanges,
  isFetching,
  isReadOnly = false,
  onDiscard,
  onUnpublish,
  onSave,
}: EmbedModalContentStatusBarProps): JSX.Element => {
  const [isPublishing, setIsPublishing] = useState(false);
  const [isUnpublishing, setIsUnpublishing] = useState(false);

  // One whole sentence per resource type rather than an interpolated noun: the
  // noun is not translatable on its own, and the rest of the sentence has to
  // agree with its gender in many languages.
  const readOnlyTooltip = match(resourceType)
    .with(
      "dashboard",
      () =>
        t`This dashboard is synced from another instance and is read-only here, so its embed settings can’t be changed.`,
    )
    .with(
      "question",
      () =>
        t`This question is synced from another instance and is read-only here, so its embed settings can’t be changed.`,
    )
    .with(
      "document",
      () =>
        t`This document is synced from another instance and is read-only here, so its embed settings can’t be changed.`,
    )
    .exhaustive();

  return (
    <Flex
      w="100%"
      justify="space-between"
      direction="row"
      align="center"
      gap="0.5rem"
      data-testid="embed-modal-content-status-bar"
    >
      <Text>
        {!isPublished
          ? t`You will need to publish this ${resourceType} before you can embed it in another application.`
          : hasSettingsChanges
            ? t`You’ve made changes that need to be published before they will be reflected in your application embed.`
            : t`This ${resourceType} is published and ready to be embedded.`}
      </Text>

      <Group
        gap="1rem"
        className={CS.flexNoShrink}
        style={{ alignSelf: "flex-end", justifyContent: "flex-end" }}
      >
        {isPublished &&
          (hasSettingsChanges ? (
            <Button onClick={onDiscard}>{t`Discard changes`}</Button>
          ) : (
            <Tooltip label={readOnlyTooltip} disabled={!isReadOnly}>
              {/* Wrapper so the tooltip still shows over the disabled button,
                  which itself does not emit pointer events. */}
              <Box component="span" display="inline-flex">
                <Button
                  variant="subtle"
                  color="feedback-negative"
                  disabled={isReadOnly}
                  loading={isUnpublishing || isFetching}
                  onClick={() => {
                    setIsUnpublishing(true);
                    onUnpublish().finally(() => setIsUnpublishing(false));
                  }}
                >{t`Unpublish`}</Button>
              </Box>
            </Tooltip>
          ))}

        {(!isPublished || hasSettingsChanges) && (
          <Tooltip label={readOnlyTooltip} disabled={!isReadOnly}>
            <Box component="span" display="inline-flex">
              <Button
                variant="filled"
                disabled={isReadOnly}
                loading={isPublishing || isFetching}
                onClick={() => {
                  setIsPublishing(true);
                  onSave().finally(() => setIsPublishing(false));
                }}
              >
                {hasSettingsChanges && isPublished
                  ? t`Publish changes`
                  : t`Publish`}
              </Button>
            </Box>
          </Tooltip>
        )}
      </Group>
    </Flex>
  );
};
