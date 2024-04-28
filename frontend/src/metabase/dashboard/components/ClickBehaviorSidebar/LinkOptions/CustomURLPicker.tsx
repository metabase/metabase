import cx from "classnames";
import { useCallback, useState } from "react";
import { t } from "ttag";

import InputBlurChange from "metabase/components/InputBlurChange";
import ModalContent from "metabase/components/ModalContent";
import ModalWithTrigger from "metabase/components/ModalWithTrigger";
import CS from "metabase/css/core/index.css";
import { isTableDisplay } from "metabase/lib/click-behavior";
import type { UiParameter } from "metabase-lib/v1/parameters/types";
import { clickBehaviorIsValid } from "metabase-lib/v1/parameters/utils/click-behavior";
import type {
  ArbitraryCustomDestinationClickBehavior,
  ClickBehavior,
  QuestionDashboardCard,
} from "metabase-types/api";

import { SidebarItem } from "../SidebarItem";

import { CustomLinkText } from "./CustomLinkText";
import {
  FormDescription,
  DoneButton,
  PickerIcon,
  PickerItemName,
} from "./CustomURLPicker.styled";
import { ValuesYouCanReference } from "./ValuesYouCanReference";

interface Props {
  dashcard: QuestionDashboardCard;
  clickBehavior: ArbitraryCustomDestinationClickBehavior;
  parameters: UiParameter[];
  updateSettings: (settings: ClickBehavior) => void;
}

export function CustomURLPicker({
  clickBehavior,
  updateSettings,
  dashcard,
  parameters,
}: Props) {
  const [url, setUrl] = useState(clickBehavior?.linkTemplate ?? "");
  const hasLinkTemplate = !!clickBehavior.linkTemplate;
  const canSelect = clickBehaviorIsValid({
    ...clickBehavior,
    linkTemplate: url,
  });

  const handleLinkTemplateChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setUrl(e.currentTarget.value);
    },
    [],
  );

  const handleSubmit = useCallback(() => {
    updateSettings({
      ...clickBehavior,
      linkTemplate: url,
    });
  }, [clickBehavior, updateSettings, url]);

  const handleReset = useCallback(() => {
    updateSettings({
      type: clickBehavior.type,
      // @ts-expect-error allow resetting
      linkType: null,
    });
  }, [clickBehavior, updateSettings]);

  return (
    <ModalWithTrigger
      isInitiallyOpen={!hasLinkTemplate}
      triggerElement={
        <SidebarItem.Selectable isSelected padded={false}>
          <PickerIcon name="link" />
          <SidebarItem.Content>
            <PickerItemName>
              {hasLinkTemplate ? clickBehavior.linkTemplate : t`URL`}
            </PickerItemName>
            <SidebarItem.CloseIcon onClick={handleReset} />
          </SidebarItem.Content>
        </SidebarItem.Selectable>
      }
    >
      {({ onClose }: { onClose: () => void }) => (
        <ModalContent
          title={t`Enter a URL to link to`}
          onClose={hasLinkTemplate ? onClose : undefined}
        >
          <FormDescription>
            {t`You can insert the value of a column or dashboard filter using its name, like this: {{some_column}}`}
          </FormDescription>
          <InputBlurChange
            autoFocus
            value={url}
            placeholder={t`e.g. http://acme.com/id/\{\{user_id\}\}`}
            onChange={handleLinkTemplateChange}
            className={cx(CS.block, CS.full)}
          />
          {isTableDisplay(dashcard) && (
            <CustomLinkText
              updateSettings={updateSettings}
              clickBehavior={clickBehavior}
            />
          )}
          <ValuesYouCanReference dashcard={dashcard} parameters={parameters} />
          <DoneButton
            primary
            type="button"
            onClick={() => {
              handleSubmit();
              onClose();
            }}
            disabled={!canSelect}
          >{t`Done`}</DoneButton>
        </ModalContent>
      )}
    </ModalWithTrigger>
  );
}
