/* eslint-disable react/prop-types */
import React, { useCallback } from "react";
import { t } from "ttag";
import _ from "underscore";

import Button from "metabase/core/components/Button";
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

function CustomURLPicker({
  clickBehavior,
  updateSettings,
  dashcard,
  parameters,
}) {
  const handleReset = useCallback(() => {
    updateSettings({
      type: clickBehavior.type,
      linkType: null,
    });
  }, [clickBehavior, updateSettings]);

  return (
    <ModalWithTrigger
      isInitiallyOpen={clickBehavior.linkTemplate == null}
      triggerElement={
        <SidebarItem.Selectable isSelected padded={false}>
          <CustomURLPickerIcon name="link" />
          <SidebarItem.Content>
            <CustomURLPickerName>
              {clickBehavior.linkTemplate ? clickBehavior.linkTemplate : t`URL`}
            </CustomURLPickerName>
            <SidebarItem.CloseIcon onClick={handleReset} />
          </SidebarItem.Content>
        </SidebarItem.Selectable>
      }
    >
      {({ onClose }) => (
        <ModalContent
          title={t`Enter a URL to link to`}
          onClose={clickBehavior.targetId != null ? onClose : null}
        >
          <div className="mb1">{t`You can insert the value of a column or dashboard filter using its name, like this: {{some_column}}`}</div>
          <InputBlurChange
            autoFocus
            className="input block full"
            placeholder={t`e.g. http://acme.com/id/\{\{user_id\}\}`}
            value={clickBehavior.linkTemplate}
            onChange={e =>
              updateSettings({
                ...clickBehavior,
                linkTemplate: e.target.value,
              })
            }
          />
          {isTableDisplay(dashcard) && (
            <CustomLinkText
              updateSettings={updateSettings}
              clickBehavior={clickBehavior}
            />
          )}
          <ValuesYouCanReference dashcard={dashcard} parameters={parameters} />
          <div className="flex">
            <Button
              primary
              onClick={() => onClose()}
              className="ml-auto mt2"
              disabled={!clickBehaviorIsValid(clickBehavior)}
            >{t`Done`}</Button>
          </div>
        </ModalContent>
      )}
    </ModalWithTrigger>
  );
}

export default CustomURLPicker;
