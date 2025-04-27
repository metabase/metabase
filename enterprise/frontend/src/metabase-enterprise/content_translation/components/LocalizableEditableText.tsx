import { useEffect, useState } from "react";
import { t } from "ttag";

import EditableText, {
  type EditableTextProps,
} from "metabase/core/components/EditableText/EditableText";
import { useTranslateContent } from "metabase/i18n/hooks";
import { Button, Group, Icon, Tooltip } from "metabase/ui";

import { TranslationsPopover } from "./TranslationsPopover";

/** A version of EditableText that supports localized content. In OSS we use
 * EditableText in place of this component so it needs to have the same props
 */
export const LocalizableEditableText = (props: EditableTextProps) => {
  const [enableLocalization, setEnableLocalization] = useState(false);

  const { initialValue } = props;
  const tc = useTranslateContent();
  const translatedInitialValue = tc(initialValue);
  const stringHasTranslation = translatedInitialValue !== initialValue;
  const isLocalized = enableLocalization && stringHasTranslation;

  useEffect(() => {
    if (stringHasTranslation) {
      setEnableLocalization(true);
    }
  }, [stringHasTranslation]);

  const isHoverCardEnabled = !isLocalized;
  const [isButtonHovered, setIsButtonHovered] = useState(false);

  return (
    <Group gap={0}>
      <TranslationsPopover enabled={isHoverCardEnabled} msgid={initialValue}>
        <EditableText
          {...props}
          initialValue={
            enableLocalization ? translatedInitialValue : initialValue
          }
          isDisabled={isLocalized}
        />
      </TranslationsPopover>
      <Group gap="sm">
        {stringHasTranslation && (
          <Tooltip
            maw="18rem"
            label={
              enableLocalization
                ? t`This text has been translated into your language. Click to edit the original text`
                : t`Click to re-enable translation`
            }
          >
            <Button
              p="xs"
              onMouseOver={() => setIsButtonHovered(true)}
              onMouseOut={() => setIsButtonHovered(false)}
              h="auto"
              variant={isButtonHovered ? undefined : "subtle"}
              onClick={() => {
                setEnableLocalization((val) => !val);
              }}
              styles={{ label: { display: "flex" } }}
            >
              <Icon
                c={enableLocalization ? "brand" : "text-light"}
                name="globe"
              />
            </Button>
          </Tooltip>
        )}
      </Group>
    </Group>
  );
};
