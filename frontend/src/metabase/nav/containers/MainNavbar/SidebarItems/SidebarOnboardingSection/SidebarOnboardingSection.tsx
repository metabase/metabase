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
import {
  Box,
  Button,
  Icon,
  type IconName,
  Menu,
  Stack,
  Text,
  Title,
} from "metabase/ui";

import { PaddedSidebarLink } from "../../MainNavbar.styled";

type SidebarOnboardingProps = {
  hasOwnDatabase: boolean;
  isAdmin: boolean;
};

export function SidebarOnboardingSection({
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
  const isUploadEnabled = !!uploadDbId;

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
      {isAdmin && (
        <Box px="xl" pb="md" className={cx({ [CS.borderTop]: initialState })}>
          {initialState && (
            <Text
              fz="sm"
              my="md"
              lh="1.333"
            >{t`Start by adding your data. Connect to a database or upload a CSV file.`}</Text>
          )}

          <Menu position="right-end" shadow="md">
            <Menu.Target>
              <Button
                leftIcon={<Icon name="add_data" />}
                fullWidth
              >{t`Add data`}</Button>
            </Menu.Target>
            <Menu.Dropdown>
              <Link to="/admin/databases/create">
                <SidebarOnboardingMenuItem
                  icon="database"
                  title={t`Add a database`}
                  subtitle={t`PostgreSQL, MySQL, Snowflake, ...`}
                />
              </Link>
              {!isUploadEnabled ? (
                <SidebarOnboardingMenuItem
                  icon="table2"
                  title={t`Upload a spreadsheet`}
                  subtitle={t`${UPLOAD_DATA_FILE_TYPES.join(
                    ", ",
                  )} (${MAX_UPLOAD_STRING} MB max)`}
                  onClick={() => setShowInfoModal(true)}
                />
              ) : (
                <SidebarOnboardingMenuItem
                  icon="table2"
                  title={t`Upload a spreadsheet`}
                  subtitle={t`${UPLOAD_DATA_FILE_TYPES.join(
                    ", ",
                  )} (${MAX_UPLOAD_STRING} MB max)`}
                  onClick={() => uploadInputRef.current?.click()}
                />
              )}
            </Menu.Dropdown>
          </Menu>
        </Box>
      )}
      {showInfoModal && (
        <UploadInfoModal
          isAdmin={isAdmin}
          onClose={() => setShowInfoModal(false)}
        />
      )}
      <UploadInput
        id="onboarding-upload-input"
        ref={uploadInputRef}
        onChange={handleFileInput}
      />
      <ModelUploadModal
        collectionId="root"
        opened={isModelUploadModalOpen}
        onClose={closeModelUploadModal}
        onUpload={handleFileUpload}
      />
    </Box>
  );
}

type OnboaringMenuItemProps = {
  icon: IconName;
  title: string;

  subtitle: string;
  onClick?: () => void;
};

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
