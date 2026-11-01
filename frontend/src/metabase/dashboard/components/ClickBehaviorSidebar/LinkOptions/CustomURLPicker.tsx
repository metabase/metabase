import { useDisclosure } from "@mantine/hooks";
import cx from "classnames";
import { useCallback, useId, useState } from "react";
import { t } from "ttag";

import CS from "metabase/css/core/index.css";
import { hasColumnLevelClickBehavior } from "metabase/dashboard/utils";
import {
  Button,
  Icon,
  Modal,
  Stack,
  Text,
  TextInputBlurChange,
} from "metabase/ui";
import type { UiParameter } from "metabase-lib/v1/parameters/types";
import type {
  ArbitraryCustomDestinationClickBehavior,
  ClickBehavior,
  DashboardCard,
} from "metabase-types/api";
import { clickBehaviorIsValid } from "metabase-types/guards";

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
  const formId = useId();
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

  const handleSubmit = useCallback(
    (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      if (!canSelect) {
        return;
      }
      updateSettings({
        ...clickBehavior,
        linkTemplate: url,
      });
      closeModal();
    },
    [canSelect, clickBehavior, closeModal, updateSettings, url],
  );

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
          flex="1 1 auto"
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
        density="relaxed"
        opened={modalOpened}
        onClose={closeModal}
        title={t`Enter a URL to link to`}
        size="lg"
      >
        <Stack gap="xl">
          <Text>
            {t`You can insert the value of a column or dashboard filter using its name, like this: {{some_column}}`}
          </Text>
          {/* "Done" joins this form via form={formId}. Keep the link text input out:
              on unmount it saves with the old clickBehavior, which drops the URL. */}
          <form id={formId} onSubmit={handleSubmit}>
            <TextInputBlurChange
              data-autofocus
              aria-label={t`URL`}
              value={url}
              placeholder={t`e.g. http://acme.com/id/\{\{user_id\}\}`}
              onChange={handleLinkTemplateChange}
              className={cx(CS.block, CS.full)}
            />
          </form>
          {hasColumnLevelClickBehavior(dashcard) && (
            <CustomLinkText
              updateSettings={updateSettings}
              clickBehavior={clickBehavior}
            />
          )}
          <ValuesYouCanReference dashcard={dashcard} parameters={parameters} />
        </Stack>
        <Modal.Footer>
          <Button
            variant="filled"
            type="submit"
            form={formId}
            disabled={!canSelect}
          >{t`Done`}</Button>
        </Modal.Footer>
      </Modal>
    </>
  );
}
