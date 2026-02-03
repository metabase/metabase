import { useDisclosure } from "@mantine/hooks";
import cx from "classnames";
import { useCallback, useState } from "react";
import { t } from "ttag";

import CS from "metabase/css/core/index.css";
import { isTableDisplay } from "metabase/lib/click-behavior";
import {
  Button,
  Flex,
  Icon,
  Modal,
  Text,
  TextInputBlurChange,
} from "metabase/ui";
import type { UiParameter } from "metabase-lib/v1/parameters/types";
import { clickBehaviorIsValid } from "metabase-lib/v1/parameters/utils/click-behavior";
import type {
  ArbitraryCustomDestinationClickBehavior,
  ClickBehavior,
  DashboardCard,
} from "metabase-types/api";

import LinkOptionsS from "../LinkOptions/LinkOptions.module.css";
import { SidebarItem } from "../SidebarItem";

import { CustomLinkText } from "./CustomLinkText";
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
  const [modalOpened, { open: openModal, close: closeModal }] =
    useDisclosure(!hasLinkTemplate);
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
    <>
      <Button.Group>
        <Button
          justify="flex-start"
          leftSection={<Icon name="link" />}
          size="lg"
          variant="filled"
          classNames={{
            root: LinkOptionsS.ButtonRoot,
          }}
          onClick={openModal}
        >
          <SidebarItem.Name>
            {hasLinkTemplate ? clickBehavior.linkTemplate : t`URL`}
          </SidebarItem.Name>
        </Button>
        <Button
          onClick={handleReset}
          miw="3rem"
          size="lg"
          variant="filled"
          rightSection={<Icon name="close" />}
        />
      </Button.Group>
      <Modal
        opened={modalOpened}
        onClose={closeModal}
        title={t`Enter a URL to link to`}
        size="lg"
      >
        <Flex direction="column" gap="md" mt="sm">
          <Text>
            {t`You can insert the value of a column or dashboard filter using its name, like this: {{some_column}}`}
          </Text>
          <TextInputBlurChange
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
            ml="auto"
            mt="xl"
            variant="filled"
            type="button"
            onClick={() => {
              handleSubmit();
              closeModal();
            }}
            disabled={!canSelect}
          >{t`Done`}</Button>
        </Flex>
      </Modal>
    </>
  );
}
