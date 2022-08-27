import React, { useCallback } from "react";
import { t } from "ttag";

import InputBlurChange from "metabase/components/InputBlurChange";
import ModalContent from "metabase/components/ModalContent";
import ModalWithTrigger from "metabase/components/ModalWithTrigger";

import {
  isTableDisplay,
  clickBehaviorIsValid,
} from "metabase/lib/click-behavior";

import type { UiParameter } from "metabase/parameters/types";
import type {
  ArbitraryCustomDestinationClickBehavior,
  ClickBehavior,
  DashboardOrderedCard,
} from "metabase-types/api";

import CustomLinkText from "./CustomLinkText";
import { SidebarItem } from "../SidebarItem";

import ValuesYouCanReference from "./ValuesYouCanReference";
import {
  FormDescription,
  DoneButton,
  PickerIcon,
  PickerItemName,
} from "./CustomURLPicker.styled";

interface Props {
  dashcard: DashboardOrderedCard;
  clickBehavior: ArbitraryCustomDestinationClickBehavior;
  parameters: UiParameter[];
  updateSettings: (settings: ClickBehavior) => void;
}

function CustomURLPicker({
  clickBehavior,
  updateSettings,
  dashcard,
  parameters,
}: Props) {
  const hasLinkTemplate = clickBehavior.linkTemplate != null;
  const canSelect = clickBehaviorIsValid(clickBehavior);

  const handleLinkTemplateChange = useCallback(
    e => {
      updateSettings({
        ...clickBehavior,
        linkTemplate: e.target.value,
      });
    },
    [clickBehavior, updateSettings],
  );

  const handleReset = useCallback(() => {
    updateSettings({
      type: clickBehavior.type,

      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
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
          onClose={hasLinkTemplate ? onClose : null}
        >
          <FormDescription>
            {t`You can insert the value of a column or dashboard filter using its name, like this: {{some_column}}`}
          </FormDescription>
          <InputBlurChange
            autoFocus
            value={clickBehavior.linkTemplate}
            placeholder={t`e.g. http://acme.com/id/\{\{user_id\}\}`}
            onChange={handleLinkTemplateChange}
            className="input block full"
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
            onClick={onClose}
            disabled={!canSelect}
          >{t`Done`}</DoneButton>
        </ModalContent>
      )}
    </ModalWithTrigger>
  );
}

export default CustomURLPicker;
