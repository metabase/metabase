import { useMediaQuery } from "@mantine/hooks";
import cx from "classnames";
import { type ChangeEvent, useCallback, useRef, useState } from "react";
import { t } from "ttag";
import _ from "underscore";

import { UploadInfoModal } from "metabase/collections/components/CollectionHeader/CollectionUploadInfoModal";
import {
  type CollectionOrTableIdProps,
  ModelUploadModal,
} from "metabase/collections/components/ModelUploadModal";
import type { OnFileUpload } from "metabase/collections/types";
import { UploadInput } from "metabase/components/upload";
import ExternalLink from "metabase/core/components/ExternalLink";
import Link from "metabase/core/components/Link";
import CS from "metabase/css/core/index.css";
import { useToggle } from "metabase/hooks/use-toggle";
import { useDispatch, useSelector } from "metabase/lib/redux";
import {
  MAX_UPLOAD_STRING,
  UPLOAD_DATA_FILE_TYPES,
  type UploadFileProps,
  uploadFile as uploadFileAction,
} from "metabase/redux/uploads";
import { getLearnUrl, getSetting } from "metabase/selectors/settings";
import { getApplicationName } from "metabase/selectors/whitelabel";
import { Box, Button, Icon, Menu, Stack, Text, Title } from "metabase/ui";
import { breakpoints } from "metabase/ui/theme";

import { PaddedSidebarLink } from "../../MainNavbar.styled";

import { trackAddDataViaCSV, trackAddDataViaDatabase } from "./analytics";
import type { OnboaringMenuItemProps, SidebarOnboardingProps } from "./types";

export function SidebarOnboardingSection({
  collections,
  databases,
  hasOwnDatabase,
  isAdmin,
}: SidebarOnboardingProps) {
  const initialState = !hasOwnDatabase;

  const [
    isModelUploadModalOpen,
    { turnOn: openModelUploadModal, turnOff: closeModelUploadModal },
  ] = useToggle(false);

  const [showInfoModal, setShowInfoModal] = useState(false);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);

  const applicationName = useSelector(getApplicationName);
  const uploadDbId = useSelector(
    state => getSetting(state, "uploads-settings")?.db_id,
  );

  const uploadInputRef = useRef<HTMLInputElement>(null);

  const dispatch = useDispatch();
  const uploadFile = useCallback(
    ({ file, modelId, collectionId, tableId, uploadMode }: UploadFileProps) =>
      dispatch(
        uploadFileAction({ file, modelId, collectionId, tableId, uploadMode }),
      ),
    [dispatch],
  );

  const handleFileInput = (event: ChangeEvent<HTMLInputElement>) => {
    trackAddDataViaCSV();
    const file = event.target.files?.[0];

    if (file !== undefined) {
      setUploadedFile(file);
      openModelUploadModal();

      // reset the input so that the same file can be uploaded again
      if (uploadInputRef.current) {
        uploadInputRef.current.value = "";
      }
    }
  };

  const handleFileUpload = useCallback<OnFileUpload>(
    (uploadFileArgs: CollectionOrTableIdProps) => {
      const { collectionId, tableId } = uploadFileArgs;
      if (uploadedFile && (collectionId || tableId)) {
        closeModelUploadModal();
        uploadFile({
          file: uploadedFile,
          ...uploadFileArgs,
        });
      }
    },
    [uploadFile, uploadedFile, closeModelUploadModal],
  );

  const isMobileSafe = useMediaQuery(`(min-width: ${breakpoints.sm})`);

  const canAddDatabase = isAdmin;

  /**
   * the collection needs to be root
   * the user must have "write" permissions for the root collection
   * the user must have permissions to upload to the database on which file uploads are enabled
   */
  const rootCollection = collections.find(
    c => c.id === "root" || c.id === null,
  );
  const canCurateRootCollection = rootCollection?.can_write;
  const canUploadToDatabase = databases
    ?.find(db => db.id === uploadDbId)
    ?.canUpload();
  const canUpload = canCurateRootCollection && canUploadToDatabase;

  function AddDatabaseButton() {
    return (
      <Link to="/admin/databases/create">
        <SidebarOnboardingMenuItem
          icon="database"
          title={t`Add a database`}
          subtitle={t`PostgreSQL, MySQL, Snowflake, ...`}
          onClick={() => trackAddDataViaDatabase()}
        />
      </Link>
    );
  }

  function UploadSpreadsheetButton() {
    const isUploadEnabled = !!uploadDbId;

    const icon = "table2";
    const title = t`Upload a spreadsheet`;
    const subtitle = t`${UPLOAD_DATA_FILE_TYPES.join(
      ", ",
    )} (${MAX_UPLOAD_STRING} MB max)`;

    return !isUploadEnabled ? (
      <SidebarOnboardingMenuItem
        icon={icon}
        title={title}
        subtitle={subtitle}
        onClick={() => setShowInfoModal(true)}
      />
    ) : (
      <SidebarOnboardingMenuItem
        icon={icon}
        title={title}
        subtitle={subtitle}
        onClick={() => uploadInputRef.current?.click()}
      />
    );
  }

  return (
    <Box
      m={0}
      bottom={0}
      pos="sticky"
      bg="bg-white"
      className={cx({ [CS.borderTop]: !initialState })}
    >
      <Box px="md" py="md">
        {/*eslint-disable-next-line no-unconditional-metabase-links-render -- This link is only temporary. It will be replaced with an internal link to a page. */}
        <ExternalLink href={getLearnUrl()} className={CS.noDecoration}>
          {/* TODO: We currently don't have a `selected` state. Will be added in MS2 when we add the onboarding page. */}
          <PaddedSidebarLink icon="learn">
            {t`How to use ${applicationName}`}
          </PaddedSidebarLink>
        </ExternalLink>
      </Box>
      {canAddDatabase || canUpload ? (
        <Box px="xl" pb="md" className={cx({ [CS.borderTop]: initialState })}>
          {initialState && (
            <Text
              fz="sm"
              my="md"
              lh="1.333"
            >{t`Start by adding your data. Connect to a database or upload a CSV file.`}</Text>
          )}

          <Menu position={isMobileSafe ? "right-end" : "top"} shadow="md">
            <Menu.Target>
              <Button
                leftIcon={<Icon name="add_data" />}
                fullWidth
              >{t`Add data`}</Button>
            </Menu.Target>
            <Menu.Dropdown>
              {canAddDatabase && <AddDatabaseButton />}
              {canUpload && <UploadSpreadsheetButton />}
            </Menu.Dropdown>
          </Menu>
        </Box>
      ) : null}
      {showInfoModal && (
        <UploadInfoModal
          isAdmin={isAdmin}
          onClose={() => setShowInfoModal(false)}
        />
      )}
      {canUpload && (
        <UploadInput
          id="onboarding-upload-input"
          ref={uploadInputRef}
          onChange={handleFileInput}
        />
      )}
      <ModelUploadModal
        collectionId="root"
        opened={isModelUploadModalOpen}
        onClose={closeModelUploadModal}
        onUpload={handleFileUpload}
      />
    </Box>
  );
}

function SidebarOnboardingMenuItem({
  icon,
  title,
  subtitle,
  onClick,
}: OnboaringMenuItemProps) {
  return (
    <Menu.Item
      icon={<Icon name={icon} />}
      style={{ alignItems: "flex-start" }}
      onClick={onClick}
    >
      <Stack spacing="xs">
        <Title c="inherit" order={4}>
          {title}
        </Title>
        <Text c="inherit" size="sm">
          {subtitle}
        </Text>
      </Stack>
    </Menu.Item>
  );
}
