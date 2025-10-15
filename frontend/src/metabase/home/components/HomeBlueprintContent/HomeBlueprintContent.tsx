import { useMemo } from "react";
import { t } from "ttag";

import { Box, Flex } from "metabase/ui";
import { type Database } from "metabase-types/api";

import { HomeGreeting } from "../HomeGreeting";

import { BlueprintCardPrompt } from "./BlueprintCardPrompt";
import { getAvailableBlueprint } from "./utils";
import { capitalize } from "metabase/lib/formatting";
import { useRunBlueprintMutation } from "metabase/api";
import { BlueprintContentCard } from "./BlueprintContentCard";

export const HomeBlueprintContent = ({
  databases,
}: {
  databases: Database[];
}) => {
  const { database, service } = useMemo(() => {
    return getAvailableBlueprint(databases);
  }, [databases]);

  const [runBlueprint, { isLoading, data }] = useRunBlueprintMutation();

  return (
    <Flex direction="column" gap="md" maw="760px" mx="auto">
      <HomeGreeting
        messageOverride={t`It's a beautiful day to look at some ${capitalize(service)} data.`}
      />
      <Box mt="lg">
        {data ? (
          <BlueprintContentCard
            document={data.document}
            dashboard={data.dashboard}
            tables={data.tables}
          />
        ) : (
          <BlueprintCardPrompt
            isLoading={isLoading}
            onConfirm={() => {
              runBlueprint({
                id: database?.id!,
                blueprint: service,
              });
            }}
            onHide={() => {
              alert("Sorry, you must create some nicer tables");
            }}
          />
        )}
      </Box>
    </Flex>
  );
};
