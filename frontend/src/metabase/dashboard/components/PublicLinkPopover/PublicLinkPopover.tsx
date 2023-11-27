import { useState } from "react";
import { useAsync } from "react-use";
import { t } from "ttag";
import {
  createPublicLink as createPublicQuestionLink,
  deletePublicLink as deletePublicQuestionLink,
} from "metabase/query_builder/actions";
import {
  exportFormats,
  publicQuestion as getPublicQuestionUrl,
  publicDashboard as getPublicDashboardUrl,
} from "metabase/lib/urls";
import { ExtensionOption } from "metabase/public/components/widgets/SharingPane.styled";
import type { Dashboard } from "metabase-types/api";
import {
  createPublicLink as createPublicDashboardLink,
  deletePublicLink as deletePublicDashboardLink,
} from "metabase/dashboard/actions";
import { color } from "metabase/lib/colors";
import { useDispatch, useSelector } from "metabase/lib/redux";
import { getUserIsAdmin } from "metabase/selectors/user";
import { Popover, Title, Text, Box, Anchor, Button, Group } from "metabase/ui";
import CopyButton from "metabase/components/CopyButton";
import type Question from "metabase-lib/Question";

type ExportFormatType = typeof exportFormats[number];

export const PublicLinkPopover = ({
  target,
  createPublicLink,
  deletePublicLink,
  uuid,
  getPublicLink,
  isOpen,
  onClose,
  extensions = [],
}: {
  target: JSX.Element;
  isOpen: boolean;
  onClose: () => void;
  createPublicLink: () => void;
  deletePublicLink: () => void;
  uuid: string | null;
  getPublicLink: (exportFormat?: ExportFormatType) => string | null;
  extensions?: ExportFormatType[];
}) => {
  const isAdmin = useSelector(getUserIsAdmin);

  const [exportFormat, setExportFormat] = useState<ExportFormatType | null>();

  const url = getPublicLink();

  const { loading } = useAsync(async () => {
    if (isOpen && !uuid) {
      await createPublicLink();
    }
    return uuid;
  }, [uuid, isOpen]);

  const onRemoveLink = async () => {
    onClose();
    await deletePublicLink();
  };

  return (
    <Popover opened={isOpen} onClose={onClose} position="bottom-end">
      <Popover.Target>
        <div>{target}</div>
      </Popover.Target>
      <Popover.Dropdown>
        <Box p="lg">
          <Title order={4}>{t`Public link`}</Title>
          <Text>{t`Anyone can view this if you give them the link.`}</Text>
          <Group
            noWrap
            w="28rem"
            pl="sm"
            pr="xs"
            style={{
              border: `1px solid ${color("border")}`,
              borderRadius: "0.25rem",
            }}
          >
            {loading ? (
              <Box style={{ flex: 1, overflow: "hidden" }}>
                <Text truncate>{t`Loading…`}</Text>
              </Box>
            ) : (
              <>
                <Box style={{ flex: 1, overflow: "hidden" }}>
                  <Text truncate>{url}</Text>
                </Box>
                <Button variant="unstyled" c="text.2">
                  <CopyButton value={url} />
                </Button>
              </>
            )}
          </Group>
          {extensions && extensions.length > 0 && (
            <Group>
              {extensions.map(extension => (
                <ExtensionOption
                  key={extension}
                  isSelected={extension === exportFormat}
                  onClick={() =>
                    setExportFormat(extensionState =>
                      extension === extensionState ? null : extension,
                    )
                  }
                >
                  {extension}
                </ExtensionOption>
              ))}
            </Group>
          )}
          {isAdmin && (
            <Box mt="md">
              <Anchor fz="sm" c="error.0" fw={700} onClick={onRemoveLink}>
                {t`Remove this public link`}
              </Anchor>
            </Box>
          )}
        </Box>
      </Popover.Dropdown>
    </Popover>
  );
};

export const QuestionPublicLinkPopover = ({
  question,
  target,
  isOpen,
  onClose,
}: {
  question: Question;
  target: JSX.Element;
  isOpen: boolean;
  onClose: () => void;
}) => {
  const dispatch = useDispatch();

  const uuid = question.publicUUID();
  const getPublicLink = (exportFormat?: ExportFormatType) => {
    return getPublicQuestionUrl({
      uuid,
      type: exportFormat,
    });
  };

  const createPublicLink = async () =>
    await dispatch(createPublicQuestionLink(question.card()));
  const deletePublicLink = async () =>
    await dispatch(deletePublicQuestionLink(question.card()));

  return (
    <PublicLinkPopover
      target={target}
      isOpen={isOpen}
      onClose={onClose}
      createPublicLink={createPublicLink}
      deletePublicLink={deletePublicLink}
      uuid={uuid}
      getPublicLink={getPublicLink}
      extensions={exportFormats}
    />
  );
};

export const DashboardPublicLinkPopover = ({
  dashboard,
  target,
  isOpen,
  onClose,
}: {
  dashboard: Dashboard;
  target: JSX.Element;
  isOpen: boolean;
  onClose: () => void;
}) => {
  const dispatch = useDispatch();

  const uuid = dashboard.public_uuid;
  const getPublicLink = (exportFormat?: ExportFormatType) => {
    if (!uuid) {
      return null;
    }
    return getPublicDashboardUrl(uuid);
  };

  const createPublicLink = async () =>
    await dispatch(createPublicDashboardLink(dashboard));
  const deletePublicLink = async () =>
    await dispatch(deletePublicDashboardLink(dashboard));

  return (
    <PublicLinkPopover
      target={target}
      isOpen={isOpen}
      onClose={onClose}
      createPublicLink={createPublicLink}
      deletePublicLink={deletePublicLink}
      uuid={uuid}
      getPublicLink={getPublicLink}
    />
  );
};
