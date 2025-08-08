import { t } from "ttag";

import { Badge, Box, Flex, Icon, Stack, Text } from "metabase/ui";
import { useGetTenantUsageSuggestionsQuery } from "metabase-enterprise/api";
import type { Database } from "metabase-types/api";

interface DatabaseTenantRoutingSuggestionsProps {
  database: Database;
}

export const DatabaseTenantRoutingSuggestions = ({
  database,
}: DatabaseTenantRoutingSuggestionsProps) => {
  const { data } = useGetTenantUsageSuggestionsQuery();
  const suggestions = data?.suggestions ?? [];
  
  // Find the database routing suggestion
  const routingSuggestion = suggestions.find(s => s.type === "database-routing");
  
  // Only show if this database is a router database and there are unrouted tenants
  const isRouterDatabase = routingSuggestion?.router_databases?.some(
    db => db.id === database.id
  );
  
  if (!isRouterDatabase || !routingSuggestion?.unrouted_tenants?.length) {
    return null;
  }

  return (
    <Box
      p="md"
      style={{
        backgroundColor: "#fefef9",
        border: "1px solid #fde047",
        borderRadius: "6px",
        marginTop: "16px",
      }}
    >
      <Flex align="center" gap="xs" mb="sm">
        <Icon name="info" size={16} style={{ color: "#ca8a04" }} />
        <Text
          size="sm"
          style={{
            fontWeight: 500,
            color: "#ca8a04",
          }}
        >
          {t`Tenants without routing`}
        </Text>
      </Flex>
      
      <Text
        size="sm"
        style={{
          color: "#a16207",
          marginBottom: "12px",
          lineHeight: 1.4,
        }}
      >
        {t`The following tenants don't have destination databases configured. Create destination databases with names matching these tenant slugs to enable routing.`}
      </Text>
      
      <Stack gap="xs">
        <Flex gap="xs" wrap="wrap">
          {routingSuggestion.unrouted_tenants.map((tenant) => (
            <Badge
              key={tenant.id}
              variant="light"
              size="sm"
              style={{
                backgroundColor: "#fefce8",
                color: "#a16207",
                border: "1px solid #fde047",
              }}
            >
              <Flex align="center" gap={6}>
                <Icon name="person" size={12} style={{ color: "#ca8a04" }} />
                <Text size="sm" style={{ fontWeight: 500 }}>
                  {tenant.name}
                </Text>
                <Text
                  size="xs"
                  style={{
                    color: "#78716c",
                    fontFamily: "monospace",
                    backgroundColor: "#f5f4f0",
                    padding: "2px 4px",
                    borderRadius: "3px",
                  }}
                >
                  {tenant.slug}
                </Text>
              </Flex>
            </Badge>
          ))}
        </Flex>
      </Stack>
    </Box>
  );
};
