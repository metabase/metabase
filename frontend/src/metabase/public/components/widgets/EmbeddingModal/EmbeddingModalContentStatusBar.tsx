import { t } from "ttag";
import Button from "metabase/core/components/Button";
import ActionButton from "metabase/components/ActionButton";
import { Paper } from "metabase/ui";

interface EmbeddingModalContentStatusBarProps {
  isEmbeddingEnabled: boolean;
  resourceType: string;
  hasSettingsChanges: boolean;
  onDiscard: () => void;
  onUnpublish: () => void;
  onSave: () => void;
}

export const EmbeddingModalContentStatusBar = ({
  isEmbeddingEnabled,
  resourceType,
  hasSettingsChanges,
  onDiscard,
  onUnpublish,
  onSave,
}: EmbeddingModalContentStatusBarProps): JSX.Element => {
  return (
    <Paper
      withBorder
      shadow="lg"
      m="1.5rem 2rem"
      p="0.75rem 1rem"
      display="flex"
    >
      <div className="flex-full mr1">
        {!isEmbeddingEnabled
          ? t`You will need to publish this ${resourceType} before you can embed it in another application.`
          : hasSettingsChanges
          ? t`You’ve made changes that need to be published before they will be reflected in your application embed.`
          : t`This ${resourceType} is published and ready to be embedded.`}
      </div>
      <div className="flex-no-shrink">
        {isEmbeddingEnabled ? (
          hasSettingsChanges ? (
            <Button
              className="ml1"
              medium
              onClick={onDiscard}
            >{t`Discard Changes`}</Button>
          ) : (
            <Button
              className="ml1"
              medium
              warning
              onClick={onUnpublish}
            >{t`Unpublish`}</Button>
          )
        ) : (
          <ActionButton
            className="ml1"
            primary
            medium
            actionFn={onSave}
            activeText={t`Updating...`}
            successText={t`Updated`}
            failedText={t`Failed!`}
          >{t`Publish`}</ActionButton>
        )}
      </div>
    </Paper>
  );
};
