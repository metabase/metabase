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
import { createMockDashboard, createMockTable } from "metabase-types/api/mocks";

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
            dashboard={createMockDashboard({
              id: 1,
              name: "Starter salesforce dashboard",
              description:
                "Here's a description of the metrics that are in here.",
            })}
            tables={[
              createMockTable({
                id: 1,
                name: "Table 1",
                description: "Description 1",
              }),
              createMockTable({
                id: 2,
                name: "Table 2",
                description: "Description 2",
              }),
              createMockTable({
                id: 3,
                name: "Table 3",
                description: "Description 3",
              }),
              createMockTable({
                id: 4,
                name: "Table 4",
                description: "Description 4",
              }),
              createMockTable({
                id: 5,
                name: "Table 5",
                description: "Description 5",
              }),
              createMockTable({
                id: 6,
                name: "Table 6",
                description: "Description 6",
              }),
              createMockTable({
                id: 7,
                name: "Table 7",
                description: "Description 7",
              }),
              createMockTable({
                id: 8,
                name: "Table 8",
                description: "Description 8",
              }),
            ]}
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
