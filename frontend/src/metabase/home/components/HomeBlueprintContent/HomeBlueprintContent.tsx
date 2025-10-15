import { useMemo } from "react";
import { t } from "ttag";

import { Box, Flex } from "metabase/ui";
import { type Database } from "metabase-types/api";

import { HomeGreeting } from "../HomeGreeting";

import { BlueprintCardPrompt } from "./BlueprintCardPrompt";
import { getAvailableBlueprint } from "./utils";
import { capitalize } from "metabase/lib/formatting";
import { useRunBlueprintMutation, useGetBlueprintQuery } from "metabase/api";
import { BlueprintContentCard } from "./BlueprintContentCard";

export const HomeBlueprintContent = ({
  databases,
}: {
  databases: Database[];
}) => {
  const { database, service, isAlreadyBlueprinted } = useMemo(() => {
    return getAvailableBlueprint(databases);
  }, [databases]);

  const { data: existingBlueprintData, isLoading: isFetchingBlueprint } =
    useGetBlueprintQuery(
      {
        id: database?.id!,
        blueprint: service,
      },
      {
        skip: !isAlreadyBlueprinted || !database?.id || !service,
      },
    );

  const [runBlueprint, { isLoading: isCreatingBlueprint, data: newBlueprintData }] =
    useRunBlueprintMutation();

  const blueprintData = isAlreadyBlueprinted
    ? existingBlueprintData
    : newBlueprintData;
  const isLoading = isAlreadyBlueprinted
    ? isFetchingBlueprint
    : isCreatingBlueprint;

  return (
    <Flex direction="column" gap="md" maw="760px" mx="auto">
      <HomeGreeting
        messageOverride={t`It's a beautiful day to look at some ${service ? capitalize(service) : ""} data.`}
      />
      <Box mt="lg">
        {blueprintData ? (
          <BlueprintContentCard
            document={blueprintData.document}
            dashboard={blueprintData.dashboard}
            tables={blueprintData.tables}
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
