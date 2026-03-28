import { useDisclosure } from "@mantine/hooks";
import { t } from "ttag";

import {
  AdminNavItem,
  AdminNavWrapper,
} from "metabase/admin/components/AdminNav";
import { useSetting } from "metabase/common/hooks";
import { useSelector } from "metabase/lib/redux";
import { FIXED_METABOT_IDS } from "metabase/metabot/constants";
import { getLocation } from "metabase/selectors/routing";
import { Flex } from "metabase/ui";

export function MetabotNavPane() {
  const isConfigured = useSetting("llm-metabot-configured?");
  const location = useSelector(getLocation);
  const isOnSystemPrompts = location?.pathname?.includes("/system-prompts");
  const [isSystemPromptsOpen, { toggle: toggleSystemPrompts }] =
    useDisclosure(isOnSystemPrompts);

  return (
    <Flex direction="column" flex="0 0 auto">
      <AdminNavWrapper>
        <AdminNavItem
          icon="gear"
          label={t`Connection settings`}
          path="/admin/metabot/setup"
        />
        {isConfigured && (
          <>
            <AdminNavItem
              icon="metabot"
              label={t`Metabot`}
              path={`/admin/metabot/${FIXED_METABOT_IDS.DEFAULT}`}
            />
            <AdminNavItem
              icon="lock"
              label={t`Usage controls`}
              path={`/admin/metabot/${FIXED_METABOT_IDS.DEFAULT}/usage-controls`}
            />
            <AdminNavItem
              icon="palette"
              label={t`Customization`}
              path={`/admin/metabot/${FIXED_METABOT_IDS.DEFAULT}/customization`}
            />
            <AdminNavItem
              icon="document"
              label={t`System prompts`}
              folderPattern="system-prompts"
              opened={isSystemPromptsOpen}
              onClick={toggleSystemPrompts}
            >
              <AdminNavItem
                label={t`Metabot chat`}
                path={`/admin/metabot/${FIXED_METABOT_IDS.DEFAULT}/system-prompts/metabot-chat`}
              />
              <AdminNavItem
                label={t`Natural language queries`}
                path={`/admin/metabot/${FIXED_METABOT_IDS.DEFAULT}/system-prompts/natural-language-queries`}
              />
              <AdminNavItem
                label={t`SQL generation`}
                path={`/admin/metabot/${FIXED_METABOT_IDS.DEFAULT}/system-prompts/sql-generation`}
              />
            </AdminNavItem>
          </>
        )}
      </AdminNavWrapper>
    </Flex>
  );
}
