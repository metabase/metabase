import { useState } from "react";
import { t } from "ttag";

import CS from "metabase/css/core/index.css";
import type { EmbedResourceType } from "metabase/public/lib/types";
import { Button, Flex, Group, Text } from "metabase/ui";

interface EmbedModalContentStatusBarProps {
  isPublished: boolean;
  resourceType: EmbedResourceType;
  hasSettingsChanges: boolean;
  isFetching?: boolean;
  onDiscard: () => void;
  onUnpublish: () => Promise<void>;
  onSave: () => Promise<void>;
}

export const EmbedModalContentStatusBar = ({
  isPublished,
  resourceType,
  hasSettingsChanges,
  isFetching,
  onDiscard,
  onUnpublish,
  onSave,
}: EmbedModalContentStatusBarProps): JSX.Element => {
  const [isPublishing, setIsPublishing] = useState(false);
  const [isUnpublishing, setIsUnpublishing] = useState(false);

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
            <Button
              variant="subtle"
              color="error"
              loading={isUnpublishing || isFetching}
              onClick={() => {
                setIsUnpublishing(true);
                onUnpublish().finally(() => setIsUnpublishing(false));
              }}
            >{t`Unpublish`}</Button>
          ))}

        {(!isPublished || hasSettingsChanges) && (
          <Button
            variant="filled"
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
        )}
      </Group>
    </Flex>
  );
};
