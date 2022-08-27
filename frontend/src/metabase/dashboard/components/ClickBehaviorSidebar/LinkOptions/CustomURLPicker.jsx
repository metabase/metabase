/* eslint-disable react/prop-types */
import React from "react";
import { t } from "ttag";
import _ from "underscore";

import Button from "metabase/core/components/Button";
import Icon from "metabase/components/Icon";
import InputBlurChange from "metabase/components/InputBlurChange";
import ModalContent from "metabase/components/ModalContent";
import ModalWithTrigger from "metabase/components/ModalWithTrigger";

import {
  isTableDisplay,
  clickBehaviorIsValid,
} from "metabase/lib/click-behavior";

import CustomLinkText from "./CustomLinkText";
import { SidebarItem } from "../SidebarItem";
import {
  CloseIconContainer,
  SidebarIconWrapper,
} from "../ClickBehaviorSidebar.styled";

import ValuesYouCanReference from "./ValuesYouCanReference";

function CustomURLPicker({
  clickBehavior,
  updateSettings,
  dashcard,
  parameters,
}) {
  return (
    <ModalWithTrigger
      isInitiallyOpen={clickBehavior.linkTemplate == null}
      triggerElement={
        <SidebarItem.Selectable isSelected>
          <SidebarIconWrapper
            style={{ borderColor: "transparent", marginLeft: 8 }}
          >
            <Icon name="link" />
          </SidebarIconWrapper>
          <div className="flex align-center full">
            <h4 className="pr1">
              {clickBehavior.linkTemplate ? clickBehavior.linkTemplate : t`URL`}
            </h4>
            <CloseIconContainer
              onClick={() =>
                updateSettings({
                  type: clickBehavior.type,
                  linkType: null,
                })
              }
            >
              <Icon name="close" size={12} />
            </CloseIconContainer>
          </div>
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
