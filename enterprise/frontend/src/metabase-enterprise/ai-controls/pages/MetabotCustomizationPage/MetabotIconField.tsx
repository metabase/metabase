import cx from "classnames";
import { type ChangeEvent, useRef, useState } from "react";
import { t } from "ttag";

import EmptyDashboardBot from "assets/img/dashboard-empty.svg";
import { useAdminSetting } from "metabase/api/utils";
import CS from "metabase/css/core/index.css";
import {
  ActionIcon,
  Box,
  Button,
  Flex,
  Group,
  Icon,
  Stack,
  Switch,
  Text,
  Tooltip,
} from "metabase/ui";

const IMAGE_SIZE_LIMIT = 1024 * 1024; // 1MB limit

export function MetabotIconField() {
  const { value: metabotIcon, updateSetting } = useAdminSetting("metabot-icon");
  const {
    value: showIllustrations,
    updateSetting: updateShowIllustrations,
    isLoading: isLoadingIllustrations,
  } = useAdminSetting("metabot-show-illustrations");

  // Icon upload
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [iconFileName, setIconFileName] = useState("");
  const [iconError, setIconError] = useState("");

  const isDefaultIcon = !metabotIcon || metabotIcon === "metabot";
  const iconPreviewSrc =
    !isDefaultIcon && typeof metabotIcon === "string" ? metabotIcon : null;

  function handleIconUpload(e: ChangeEvent<HTMLInputElement>) {
    setIconError("");
    const file = e.target.files?.[0];
    if (!file) {
      return;
    }
    if (file.size > IMAGE_SIZE_LIMIT) {
      setIconError(
        t`The image you chose is larger than 1MB. Please choose another one.`,
      );
      return;
    }
    const reader = new FileReader();
    reader.onload = async (readerEvent) => {
      const dataUri = readerEvent.target?.result as string;
      if (!(await isFileIntact(dataUri))) {
        setIconError(
          t`The image you chose is corrupted. Please choose another one.`,
        );
        return;
      }
      setIconError("");
      setIconFileName(file.name);
      await updateSetting({
        key: "metabot-icon",
        value: dataUri,
        toast: false,
      });
    };
    reader.readAsDataURL(file);
  }

  async function handleIconRemove() {
    setIconError("");
    setIconFileName("");
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
    await updateSetting({ key: "metabot-icon", value: null, toast: false });
  }

  return (
    <Stack gap={0}>
      <Text lh="lg" fz="md" mb="xs" fw="bold">
        {t`AI agent's icon`}
      </Text>
      <Text fz="md" c="text-secondary" lh="lg">
        {t`Upload a custom icon for the AI agent. For best results, use an SVG or PNG with a transparent background.`}
      </Text>
      {iconError && (
        <Text fz="sm" c="error" mt="xs">
          {iconError}
        </Text>
      )}
      <Flex
        align="center"
        className={cx(CS.bordered, CS.rounded, CS.alignSelfStart)}
        gap="md"
        my="sm"
        py="sm"
        px="md"
        maw="100%"
        wrap="wrap"
      >
        <Flex
          className={cx(CS.bgLight, CS.bordered, CS.rounded)}
          align="center"
          justify="center"
          w="2.25rem"
          h="2.25rem"
          flex="0 0 auto"
        >
          {iconPreviewSrc ? (
            <Box
              component="img"
              src={iconPreviewSrc}
              alt={t`Metabot icon`}
              w="1.5rem"
              h="1.5rem"
              style={{ objectFit: "contain" }}
            />
          ) : (
            <Icon name="metabot" />
          )}
        </Flex>
        <input
          ref={fileInputRef}
          hidden
          type="file"
          accept="image/jpeg,image/png,image/svg+xml"
          multiple={false}
          onChange={handleIconUpload}
        />
        <Button
          size="sm"
          onClick={() => fileInputRef.current?.click()}
          flex="0 0 auto"
        >
          {t`Upload a custom icon`}
        </Button>
        {(iconFileName || !isDefaultIcon) && (
          <Flex align="center" gap="md" flex="1 1 0" miw="2rem">
            {iconFileName && (
              <Text
                fz="sm"
                c="text-secondary"
                truncate="end"
                miw={0}
                title={iconFileName}
                flex="1 1 0"
              >
                {iconFileName}
              </Text>
            )}
            {!isDefaultIcon && (
              <Tooltip label={t`Remove custom icon`}>
                <ActionIcon
                  onClick={handleIconRemove}
                  aria-label={t`Remove custom icon`}
                >
                  <Icon name="close" />
                </ActionIcon>
              </Tooltip>
            )}
          </Flex>
        )}
      </Flex>
      {!isDefaultIcon && (
        <Stack mt="lg" gap="sm">
          <Text fz="md" fw="bold">
            {t`Metabot illustrations`}
          </Text>
          <Group gap="lg" align="center" wrap="nowrap">
            <Flex align="center" gap="sm" flex="1" miw={0}>
              <Box
                component="img"
                src={EmptyDashboardBot}
                alt={t`Metabot illustration preview`}
                w="3rem"
                h="3rem"
                flex="0 0 auto"
              />
              <Text fz="md" c="text-secondary" flex="1">
                {t`Show Metabot illustrations in chat sidebar and AI exploration page`}
              </Text>
            </Flex>
            <Switch
              aria-label={t`Show Metabot illustrations`}
              checked={!!showIllustrations}
              onChange={(e) =>
                updateShowIllustrations({
                  key: "metabot-show-illustrations",
                  value: e.currentTarget.checked,
                  toast: false,
                })
              }
              disabled={isLoadingIllustrations}
              size="sm"
            />
          </Group>
        </Stack>
      )}
    </Stack>
  );
}

async function isFileIntact(dataUri: string): Promise<boolean> {
  return new Promise((resolve) => {
    const img = document.createElement("img");
    img.src = dataUri;
    img.onerror = () => resolve(false);
    img.onload = () => resolve(true);
  });
}
