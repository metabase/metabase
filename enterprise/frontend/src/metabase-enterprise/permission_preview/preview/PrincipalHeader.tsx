import { t } from "ttag";

import { Flex, Icon, Stack, Text, Title } from "metabase/ui";

import type { PreviewPrincipal } from "../api";

type PrincipalHeaderProps = {
  principal: PreviewPrincipal;
  hint?: string;
};

/** Who is being previewed: their groups and attributes, above a read-only preview grid. */
export function PrincipalHeader({ principal, hint }: PrincipalHeaderProps) {
  return (
    <Stack gap="xs" mb="md">
      <Title order={2}>
        {getWhoName(principal)}{" "}
        <Text component="span" c="text-secondary" fz="md" fw="normal">
          {t`effective access · read-only`}
        </Text>
      </Title>
      <Flex gap="lg" wrap="wrap" c="text-secondary">
        <Text c="text-secondary">{getDetail(principal)}</Text>
        <Flex align="center" gap="xs">
          <Icon name="group" />
          <Text c="text-secondary">
            {principal.groups.map((group) => group.name).join(", ")}
          </Text>
        </Flex>
        <Text c="text-secondary">
          {t`Attributes:`} {getAttributes(principal)}
        </Text>
      </Flex>
      {hint && <Text>{hint}</Text>}
    </Stack>
  );
}

/** How a preview names who is previewed: "Sandy Sales", "Any member of Sales", "Any user of Acme". */
export function getWhoName(principal: PreviewPrincipal): string {
  switch (principal.type) {
    case "user":
      return principal.name;
    case "group":
      return t`Any member of ${principal.name}`;
    case "tenant":
      return t`Any user of ${principal.name}`;
  }
}

function getDetail(principal: PreviewPrincipal) {
  if (principal.superuser) {
    return t`Admin: has full access to everything`;
  }
  if (principal.type === "group") {
    const otherGroups = principal.groups
      .filter((group) => group.id !== principal.id)
      .map((group) => group.name);
    return otherGroups.length > 0
      ? t`Assumes no other groups besides ${otherGroups.join(", ")}`
      : t`Assumes no other groups`;
  }
  return principal.detail;
}

function getAttributes(principal: PreviewPrincipal) {
  const entries = Object.entries(principal.attributes ?? {});
  if (entries.length === 0) {
    return principal.type === "group" ? t`each member's own` : t`none`;
  }
  return entries.map(([key, value]) => `${key} = ${value}`).join(", ");
}
