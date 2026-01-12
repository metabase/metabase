import { useDisclosure } from "@mantine/hooks";
import { Link } from "react-router";
import { c, t } from "ttag";

import { NewUserModal } from "metabase/admin/people/containers/NewUserModal";
import { useDocsUrl, useSetting } from "metabase/common/hooks";
import { getHelpUrl } from "metabase/common/utils/help-url";
import CS from "metabase/css/core/index.css";
import { getEngines } from "metabase/databases/selectors";
import { useSelector } from "metabase/lib/redux";
import { getIsPaidPlan } from "metabase/selectors/settings";
import { getUserIsAdmin } from "metabase/selectors/user";
import {
  ActionIcon,
  Box,
  Button,
  Divider,
  Flex,
  Icon,
  ScrollArea,
  Title,
} from "metabase/ui";
import type { EngineKey } from "metabase-types/api";

import {
  ENGINE_DOC_MAP,
  EmbeddedEngineDocContent,
} from "./EmbeddedEngineDocContent";

interface Props {
  engineKey: EngineKey;
  onClose: VoidFunction;
}

export const DatabaseHelpSidePanel = ({ engineKey, onClose }: Props) => {
  const engines = useSelector(getEngines);
  const { url: fullDocsUrl, showMetabaseLinks } = useDocsUrl(
    `databases/connections/${ENGINE_DOC_MAP[engineKey]}`,
  );
  const [showUserModal, { toggle: toggleUserModal }] = useDisclosure(false);
  const isPaidPlan = useSelector(getIsPaidPlan);
  const version = useSetting("version");
  const talkToExpertUrl = getHelpUrl(isPaidPlan, version.tag);
  const isAdmin = useSelector(getUserIsAdmin);

  if (!engines[engineKey]) {
    return null;
  }

  const driverName = engines[engineKey]?.["driver-name"];

  return (
    <ScrollArea
      component="aside"
      data-testid="database-help-side-panel"
      display="flex"
      flex={{ sm: "1 0 20rem", md: "1 0 26.5rem", base: "1 0 100%" }}
      h="100%"
      bg="background-primary"
    >
      <Box p="xl" w="100%">
        <Flex align="baseline" justify="space-between" mb="md">
          <Title order={2} size="h4">
            {c("{0} is the database engine name").t`Add ${driverName}`}
          </Title>
          <ActionIcon aria-label={t`Close panel`} onClick={onClose}>
            <Icon name="close" />
          </ActionIcon>
        </Flex>
        {showMetabaseLinks && (
          <>
            <Button
              className={CS.link}
              component={Link}
              leftSection={<Icon name="reference" />}
              p={0}
              target="_blank"
              to={fullDocsUrl}
              variant="subtle"
            >
              {t`Read the full docs`}
            </Button>
            <Divider variant="dashed" />
          </>
        )}
        {isAdmin && (
          <>
            <Button
              className={CS.link}
              leftSection={<Icon name="mail" />}
              onClick={toggleUserModal}
              p={0}
              variant="subtle"
            >
              {t`Invite a teammate to help you`}
            </Button>
            <Divider variant="dashed" />
          </>
        )}
        {showMetabaseLinks && isPaidPlan && (
          <>
            <Button
              className={CS.link}
              component={Link}
              leftSection={<Icon name="person" />}
              p={0}
              target="_blank"
              to={talkToExpertUrl}
              variant="subtle"
            >
              {t`Talk to an expert`}
            </Button>
            <Divider variant="dashed" />
          </>
        )}
        <EmbeddedEngineDocContent engineKey={engineKey} />
      </Box>
      {showUserModal && <NewUserModal onClose={toggleUserModal} />}
    </ScrollArea>
  );
};
