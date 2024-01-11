import { t } from "ttag";
import Button from "metabase/core/components/Button";
import ActionButton from "metabase/components/ActionButton";
import { Flex, Paper, Text } from "metabase/ui";
import type { EmbedResourceType } from "metabase/public/components/EmbedModal";

interface EmbedModalContentStatusBarProps {
  isPublished: boolean;
  resourceType: EmbedResourceType;
  hasSettingsChanges: boolean;
  onDiscard: () => void;
  onUnpublish: () => void;
  onSave: () => void;
}

export const EmbedModalContentStatusBar = ({
  isPublished,
  resourceType,
  hasSettingsChanges,
  onDiscard,
  onUnpublish,
  onSave,
}: EmbedModalContentStatusBarProps): JSX.Element => {
  return (
    <Paper withBorder shadow="sm" m="1.5rem 2rem" p="0.75rem 1rem">
      <Flex w="100%" justify="space-between" align="center" gap="0.5rem">
        <Text fw="bold">
          {!isPublished
            ? t`You will need to publish this ${resourceType} before you can embed it in another application.`
            : hasSettingsChanges
            ? t`You’ve made changes that need to be published before they will be reflected in your application embed.`
            : t`This ${resourceType} is published and ready to be embedded.`}
        </Text>

        <div className="flex-no-shrink">
          {isPublished &&
            (hasSettingsChanges ? (
              <Button
                className="ml1"
                medium
                onClick={onDiscard}
              >{t`Discard changes`}</Button>
            ) : (
              <Button
                className="ml1"
                medium
                warning
                onClick={onUnpublish}
              >{t`Unpublish`}</Button>
            ))}

          {(!isPublished || hasSettingsChanges) && (
            <ActionButton
              className="ml1"
              primary
              medium
              actionFn={onSave}
              activeText={t`Updating...`}
              successText={t`Updated`}
              failedText={t`Failed!`}
            >
              {hasSettingsChanges ? t`Publish changes` : t`Publish`}
            </ActionButton>
          )}
        </div>
      </Flex>
    </Paper>
  );
};
