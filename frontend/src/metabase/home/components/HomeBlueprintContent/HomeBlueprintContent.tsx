import { Flex, Box } from "metabase/ui";
import { HomeGreeting } from "../HomeGreeting";
import { t } from "ttag";
import {
  Database,
  DATABASE_BLUEPRINTS,
  DatabaseBlueprint,
} from "metabase-types/api";
import { useMemo } from "react";
import { BlueprintCardPrompt } from "./BlueprintCardPrompt";

const SERVICE_NAME_BY_BLUEPRINT: Record<DatabaseBlueprint, string> = {
  "is-salesforce?": "Salesforce",
  "is-stripe?": "Stripe",
};

export const HomeBlueprintContent = ({
  databases,
}: {
  databases: Database[];
}) => {
  const database = useMemo(() => {
    return databases.find((database) =>
      DATABASE_BLUEPRINTS.some((key) => database.settings?.blueprints?.[key]),
    );
  }, [databases]);

  const blueprint = useMemo(() => {
    return SERVICE_NAME_BY_BLUEPRINT[
      DATABASE_BLUEPRINTS.find((key) => database?.settings?.blueprints?.[key])
    ];
  }, [database]);

  return (
    <Flex direction="column" gap="md" maw="760px" mx="auto">
      <HomeGreeting
        messageOverride={t`It's a beautiful day to look at some ${blueprint} data.`}
      />
      <Box mt="lg">
        <BlueprintCardPrompt
          onConfirm={() => {}}
          onHide={() => {
            alert("no, you have to create some nicer tables");
          }}
        />
        {/* <BlueprintCard blueprint={blueprint} state="loading" /> */}
        {/* <BlueprintContentCard
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
          ]}
        /> */}
      </Box>
    </Flex>
  );
};
