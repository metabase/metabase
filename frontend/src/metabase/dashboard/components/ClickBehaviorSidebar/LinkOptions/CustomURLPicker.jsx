/* eslint-disable react/prop-types */
import React, { useCallback } from "react";
import { t } from "ttag";
import _ from "underscore";

import InputBlurChange from "metabase/components/InputBlurChange";
import ModalContent from "metabase/components/ModalContent";
import ModalWithTrigger from "metabase/components/ModalWithTrigger";

import {
  isTableDisplay,
  clickBehaviorIsValid,
} from "metabase/lib/click-behavior";

import CustomLinkText from "./CustomLinkText";
import { SidebarItem } from "../SidebarItem";

import ValuesYouCanReference from "./ValuesYouCanReference";
import { CustomURLPickerIcon, CustomURLPickerName } from "./LinkOptions.styled";
import { FormDescription, DoneButton } from "./CustomURLPicker.styled";

function CustomURLPicker({
  clickBehavior,
  updateSettings,
  dashcard,
  parameters,
}) {
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
      linkType: null,
    });
  }, [clickBehavior, updateSettings]);

  return (
    <ModalWithTrigger
      isInitiallyOpen={!hasLinkTemplate}
      triggerElement={
        <SidebarItem.Selectable isSelected padded={false}>
          <CustomURLPickerIcon name="link" />
          <SidebarItem.Content>
            <CustomURLPickerName>
              {hasLinkTemplate ? clickBehavior.linkTemplate : t`URL`}
            </CustomURLPickerName>
            <SidebarItem.CloseIcon onClick={handleReset} />
          </SidebarItem.Content>
        </SidebarItem.Selectable>
      }
    >
      {({ onClose }) => (
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
