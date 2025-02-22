import cx from "classnames";
import { useCallback, useState } from "react";
import { t } from "ttag";

import InputBlurChange from "metabase/components/InputBlurChange";
import ModalContent from "metabase/components/ModalContent";
import ModalWithTrigger from "metabase/components/ModalWithTrigger";
import Button from "metabase/core/components/Button";
import CS from "metabase/css/core/index.css";
import { isTableDisplay } from "metabase/lib/click-behavior";
import { Box } from "metabase/ui";
import type { UiParameter } from "metabase-lib/v1/parameters/types";
import { clickBehaviorIsValid } from "metabase-lib/v1/parameters/utils/click-behavior";
import type {
  ArbitraryCustomDestinationClickBehavior,
  ClickBehavior,
  DashboardCard,
} from "metabase-types/api";

import { SidebarItem } from "../SidebarItem";

import { CustomLinkText } from "./CustomLinkText";
import S from "./CustomURLPicker.module.css";
import { ValuesYouCanReference } from "./ValuesYouCanReference";

interface Props {
  dashcard: DashboardCard;
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
          <SidebarItem.Icon ml="sm" className={S.PickerIcon} name="link" />
          <SidebarItem.Content>
            <SidebarItem.Name className={S.PickerItemName}>
              {hasLinkTemplate ? clickBehavior.linkTemplate : t`URL`}
            </SidebarItem.Name>
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
          <Box component="span" mb="md">
            {t`You can insert the value of a column or dashboard filter using its name, like this: {{some_column}}`}
          </Box>
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
          <Button
            className={S.DoneButton}
            primary
            type="button"
            onClick={() => {
              handleSubmit();
              onClose();
            }}
            disabled={!canSelect}
          >{t`Done`}</Button>
        </ModalContent>
      )}
    </ModalWithTrigger>
  );
}
